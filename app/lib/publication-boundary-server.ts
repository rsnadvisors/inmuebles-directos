import "server-only";
import { createHash, createHmac } from "node:crypto";
import type { getVerifiedUser } from "./auth-server";
import { imageExtensions, type validatePublication } from "./publication";
import { PRIVATE_PROPERTY_IMAGE_BUCKET } from "./property-images";

type Client = NonNullable<Awaited<ReturnType<typeof getVerifiedUser>>["client"]>;
export const PUBLICATION_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const LOOKUP_FINGERPRINT = "0".repeat(64);
export class PublicationBoundaryError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
export type PublicationSlot = { imageId: string; path: string; mime: string; size: number; digest: string;
  state: "RESERVED" | "RETIRED" | "FINALIZED"; sortOrder: number;
  observation: "PRESENT" | "ABSENT" | "INACCESSIBLE"; metadataValid: boolean };
export type PublicationPlan = { requestId: string; fingerprint: string; slug: string; revision: number;
  state: "ACTIVE" | "CANCEL_PENDING" | "CANCELLED" | "FINALIZED"; parentValid: boolean; slots: PublicationSlot[] };
type Binding = { uid: string; request_id: string; fingerprint: string; revision?: number };

export function signPublicationEnvelope(purpose: "prepare" | "finalize" | "reconcile", binding: Binding,
  details: Record<string, unknown> = {}, now = Math.floor(Date.now() / 1000)) {
  const key = process.env.PUBLICATION_BOUNDARY_HMAC_KEY;
  const keyId = process.env.PUBLICATION_BOUNDARY_HMAC_KEY_ID;
  if (!key || !/^[0-9a-f]{64}$/.test(key) || !keyId || !/^[a-zA-Z0-9_-]{1,40}$/.test(keyId)) {
    throw new PublicationBoundaryError("PUBLICATION_BOUNDARY_UNAVAILABLE");
  }
  const envelope = JSON.stringify({ ...details, ...binding, version: 1, audience: "inmuebles-publication",
    purpose, key_id: keyId, issued_at: now, expires_at: now + 300 });
  if (Buffer.byteLength(envelope) > 32768) throw new PublicationBoundaryError("INVALID_REQUEST", 400);
  return { p_envelope: envelope, p_mac: createHmac("sha256", Buffer.from(key, "hex")).update(envelope, "utf8").digest("hex") };
}

export async function publicationServerManifest(input: ReturnType<typeof validatePublication>, uid: string, requestId: string) {
  const { files, ...fields } = input;
  const images = await Promise.all(files.map(async file => ({ type: file.type,
    digest: hash(new Uint8Array(await file.arrayBuffer())) })));
  const fingerprint = hash(JSON.stringify({ fields, images }));
  const manifest = images.map((image, index) => {
    // Stable IDs for concurrent exact retries; no fresh capacity/path on a retry.
    const h = hash(`${uid}/${requestId}/${fingerprint}/${index}`);
    const imageId = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
    return { imageId, mime: image.type, size: files[index].size, digest: image.digest };
  });
  return { fields, manifest, fingerprint };
}

function parsePlan(value: unknown, uid: string, requestId: string): PublicationPlan {
  const p = value as PublicationPlan;
  if (!p || p.requestId !== requestId || !/^[0-9a-f]{64}$/.test(p.fingerprint)
    || !["ACTIVE", "CANCEL_PENDING", "CANCELLED", "FINALIZED"].includes(p.state)
    || !Number.isSafeInteger(p.revision) || p.revision < 0 || typeof p.parentValid !== "boolean"
    || typeof p.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)
    || !Array.isArray(p.slots) || p.slots.length < 1 || p.slots.length > 5) {
    throw new PublicationBoundaryError("RECONCILIATION_UNAVAILABLE");
  }
  for (const [index, s] of p.slots.entries()) {
    const extension = imageExtensions[s.mime as keyof typeof imageExtensions];
    if (!PUBLICATION_REQUEST_ID.test(s.imageId) || !extension || s.path !== `${uid}/${requestId}/${s.imageId}.${extension}`
      || s.sortOrder !== index || !Number.isSafeInteger(s.size) || s.size < 1 || s.size > 5242880
      || !/^[0-9a-f]{64}$/.test(s.digest) || typeof s.metadataValid !== "boolean"
      || !["RESERVED", "RETIRED", "FINALIZED"].includes(s.state)
      || !["PRESENT", "ABSENT", "INACCESSIBLE"].includes(s.observation)) {
      throw new PublicationBoundaryError("RECONCILIATION_UNAVAILABLE");
    }
  }
  return p;
}

async function call(client: Client, uid: string, requestId: string, rpc: string, proof: ReturnType<typeof signPublicationEnvelope>) {
  let result;
  try { result = await client.rpc(rpc, proof); }
  catch { throw new PublicationBoundaryError("RECONCILIATION_UNAVAILABLE"); }
  if (result.error) {
    const known = ["PUBLICATION_REQUEST_MISMATCH", "CANCELLATION_PENDING", "PUBLICATION_CANCELLED",
      "PUBLICATION_IN_PROGRESS", "PUBLICATION_ALREADY_FINALIZED", "PUBLICATION_REVISION_CONFLICT"];
    const code = known.find(code => result.error!.message === code);
    if (code) throw new PublicationBoundaryError(code, 409);
    if (result.error.code === "PT404") throw new PublicationBoundaryError("PUBLICATION_NOT_FOUND", 404);
    throw new PublicationBoundaryError("RECONCILIATION_UNAVAILABLE");
  }
  return parsePlan(result.data, uid, requestId);
}

export async function inspectPublication(client: Client, uid: string, requestId: string, fingerprint = LOOKUP_FINGERPRINT) {
  return call(client, uid, requestId, "reconcile_publication_attempt", signPublicationEnvelope("reconcile",
    { uid, request_id: requestId, fingerprint, revision: 0 }, { action: "inspect" }));
}
export async function preparePublication(client: Client, uid: string, requestId: string, input: ReturnType<typeof validatePublication>) {
  const manifest = await publicationServerManifest(input, uid, requestId);
  const plan = await call(client, uid, requestId, "prepare_publication_attempt", signPublicationEnvelope("prepare",
    { uid, request_id: requestId, fingerprint: manifest.fingerprint }, { fields: manifest.fields, manifest: manifest.manifest }));
  if (plan.fingerprint !== manifest.fingerprint || plan.slots.some((s, index) => s.imageId !== manifest.manifest[index]?.imageId
    || s.digest !== manifest.manifest[index]?.digest || s.size !== manifest.manifest[index]?.size || s.mime !== manifest.manifest[index]?.mime)) {
    throw new PublicationBoundaryError("RECONCILIATION_UNAVAILABLE");
  }
  return plan;
}
export async function finalizePublication(client: Client, uid: string, plan: PublicationPlan) {
  return call(client, uid, plan.requestId, "finalize_publication_attempt", signPublicationEnvelope("finalize",
    { uid, request_id: plan.requestId, fingerprint: plan.fingerprint, revision: plan.revision }));
}

export async function cancelPublication(client: Client, uid: string, requestId: string, action: "cancel" | "reconcile") {
  let plan = await inspectPublication(client, uid, requestId);
  if (plan.state === "FINALIZED") throw new PublicationBoundaryError("PUBLICATION_ALREADY_FINALIZED", 409);
  if (plan.state === "ACTIVE") {
    if (action === "reconcile") return plan;
    plan = await call(client, uid, requestId, "reconcile_publication_attempt", signPublicationEnvelope("reconcile",
      { uid, request_id: requestId, fingerprint: plan.fingerprint, revision: plan.revision }, { action: "begin_cancel" }));
  }
  if (!["CANCEL_PENDING", "CANCELLED"].includes(plan.state)
    || plan.slots.some(s => s.state !== "RETIRED" || s.observation === "INACCESSIBLE")) {
    throw new PublicationBoundaryError("RECONCILIATION_UNAVAILABLE");
  }
  // Network cleanup occurs after confirmed DB freeze, outside all DB locks.
  try {
    const removed = await client.storage.from(PRIVATE_PROPERTY_IMAGE_BUCKET).remove(plan.slots.map(s => s.path));
    if (removed.error) throw new Error("Unconfirmed cleanup");
  } catch { throw new PublicationBoundaryError("CLEANUP_UNCONFIRMED", 502); }
  if (plan.state === "CANCELLED") {
    const observed = await inspectPublication(client, uid, requestId, plan.fingerprint);
    if (observed.slots.some(s => s.observation !== "ABSENT")) throw new PublicationBoundaryError("CLEANUP_UNCONFIRMED", 502);
    return observed; // late orphan cleanup never reactivates authority or quota
  }
  return call(client, uid, requestId, "reconcile_publication_attempt", signPublicationEnvelope("reconcile",
    { uid, request_id: requestId, fingerprint: plan.fingerprint, revision: plan.revision },
    { action: "close_cancel", cleanup_confirmed: true }));
}
