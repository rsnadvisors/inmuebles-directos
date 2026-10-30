// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, createHash } from "node:crypto";
import { cancelPublication, inspectPublication, publicationServerManifest, signPublicationEnvelope } from "../app/lib/publication-boundary-server";
import { POST } from "../app/api/publicar/cancelar/route";
import { validatePublication } from "../app/lib/publication";

const auth = vi.hoisted(() => ({ client: null as any, user: null as any }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: async () => auth }));
const uid="11111111-1111-4111-8111-111111111111", requestId="22222222-2222-4222-8222-222222222222";
const registeredUser = { id: uid, is_anonymous: false, email: "owner@example.invalid", email_confirmed_at: "2026-10-01T00:00:00Z" };
const imageId="33333333-3333-4333-8333-333333333333";
const fingerprint="cd".repeat(32), path=`${uid}/${requestId}/${imageId}.png`;
function plan(state="ACTIVE", observation="ABSENT") {
  return { requestId, fingerprint, state, revision: 0, slug: `qa-${requestId}`, parentValid: true,
    slots:[{ imageId,path,mime:"image/png",size:4,digest:"ef".repeat(32),sortOrder:0,state:state==="ACTIVE"?"RESERVED":"RETIRED",metadataValid:true,observation }] };
}
beforeEach(() => { vi.stubEnv("PUBLICATION_BOUNDARY_HMAC_KEY","ab".repeat(32)); vi.stubEnv("PUBLICATION_BOUNDARY_HMAC_KEY_ID","test"); auth.client=null; auth.user=null; });
describe("publication proof and content binding", () => {
  it("authenticates the exact UTF-8 envelope, including Unicode, not reconstructed JSON", () => {
    const proof=signPublicationEnvelope("prepare",{uid,request_id:requestId,fingerprint},{fields:{title:"Casa Perú"}},1000);
    expect(proof.p_mac).toBe(createHmac("sha256",Buffer.from("ab".repeat(32),"hex")).update(proof.p_envelope,"utf8").digest("hex"));
    expect(JSON.parse(proof.p_envelope)).toMatchObject({purpose:"prepare",audience:"inmuebles-publication",issued_at:1000,expires_at:1300});
    expect(proof.p_envelope).not.toContain("abababab");
  });
  it.each(["", "abc", "ab".repeat(31), "AB".repeat(32)])("fails closed with invalid private key %s", key => {
    vi.stubEnv("PUBLICATION_BOUNDARY_HMAC_KEY",key);
    expect(() => signPublicationEnvelope("finalize",{uid,request_id:requestId,fingerprint})).toThrow("PUBLICATION_BOUNDARY_UNAVAILABLE");
  });
  it("rejects oversized envelopes before RPC", () => {
    expect(() => signPublicationEnvelope("prepare",{uid,request_id:requestId,fingerprint},{fields:{title:"x".repeat(33000)}})).toThrow("INVALID_REQUEST");
  });
  it("recomputes the existing client fingerprint and stable paths from normalized fields and photo bytes", async () => {
    const f=new FormData(); Object.entries({title:"QA",description:"Synthetic",address:"Synthetic",city:"Piura",region:"Piura",contact_phone:"900000001",operation:"Vender",type:"Casas",price:"1",currency:"PEN",latitude:"-5",longitude:"-80",coordinatesConfirmed:"true"}).forEach(([k,v])=>f.set(k,v));
    const bytes=new Uint8Array([1,2,3,4]); f.append("images",new File([bytes],"ignored.png",{type:"image/png"}));
    const input=validatePublication(f), first=await publicationServerManifest(input,uid,requestId), second=await publicationServerManifest(input,uid,requestId);
    const {files,...fields}=input; const digest=createHash("sha256").update(bytes).digest("hex");
    expect(first.fingerprint).toBe(createHash("sha256").update(JSON.stringify({fields,images:[{type:files[0].type,digest}]})).digest("hex"));
    expect(first).toEqual(second); expect(first.manifest[0].digest).toBe(digest);
  });
});
describe("owner cancellation and UNKNOWN", () => {
  it("freezes authority before user-context removal and closes only after confirmed cleanup", async () => {
    const order:string[]=[]; const rpc=vi.fn(async (_name,proof) => {
      const e=JSON.parse(proof.p_envelope); order.push(e.action);
      if(e.action==="close_cancel") expect(e.cleanup_confirmed).toBe(true);
      return {data:plan(e.action==="inspect"?"ACTIVE":e.action==="begin_cancel"?"CANCEL_PENDING":"CANCELLED"),error:null};
    });
    const remove=vi.fn(async () => { order.push("remove"); return {error:null}; });
    const client={rpc,storage:{from:()=>({remove})}} as any;
    expect((await cancelPublication(client,uid,requestId,"cancel")).state).toBe("CANCELLED");
    expect(order).toEqual(["inspect","begin_cancel","remove","close_cancel"]); expect(remove).toHaveBeenCalledWith([path]);
  });
  it("never closes cancellation when Storage removal fails", async () => {
    const rpc=vi.fn(async () => ({data:plan("CANCEL_PENDING"),error:null}));
    const client={rpc,storage:{from:()=>({remove:async()=>({error:{message:"private failure"}})})}} as any;
    await expect(cancelPublication(client,uid,requestId,"cancel")).rejects.toThrow("CLEANUP_UNCONFIRMED");
    expect(rpc).toHaveBeenCalledOnce();
  });
  it("UNKNOWN lookup performs no deletion and never becomes ABSENT", async () => {
    const remove=vi.fn(), client={rpc:async()=>({data:null,error:{message:"internal"}}),storage:{from:()=>({remove})}} as any;
    await expect(cancelPublication(client,uid,requestId,"cancel")).rejects.toThrow("RECONCILIATION_UNAVAILABLE"); expect(remove).not.toHaveBeenCalled();
  });
  it("ACTIVE reconcile observes without cancellation or cleanup", async () => {
    const remove=vi.fn(), client={rpc:vi.fn(async()=>({data:plan(),error:null})),storage:{from:()=>({remove})}} as any;
    expect((await cancelPublication(client,uid,requestId,"reconcile")).state).toBe("ACTIVE"); expect(remove).not.toHaveBeenCalled(); expect(client.rpc).toHaveBeenCalledOnce();
  });
  it("FINALIZED cancellation is denied before any removal", async () => {
    const remove=vi.fn(), client={rpc:async()=>({data:{...plan("FINALIZED","PRESENT"),slots:[{...plan().slots[0],state:"FINALIZED",observation:"PRESENT"}]},error:null}),storage:{from:()=>({remove})}} as any;
    await expect(cancelPublication(client,uid,requestId,"cancel")).rejects.toThrow("PUBLICATION_ALREADY_FINALIZED"); expect(remove).not.toHaveBeenCalled();
  });
  it.each(["UNKNOWN","INACCESSIBLE"])("does not clean up unknown/inaccessible state %s", async observation => {
    const remove=vi.fn(), client={rpc:async()=>({data:plan("CANCEL_PENDING",observation),error:null}),storage:{from:()=>({remove})}} as any;
    await expect(cancelPublication(client,uid,requestId,"cancel")).rejects.toThrow("RECONCILIATION_UNAVAILABLE"); expect(remove).not.toHaveBeenCalled();
  });
  it("rejects a forged cross-owner returned path", async () => {
    const bad=plan(); bad.slots[0].path="other/"+path;
    await expect(inspectPublication({rpc:async()=>({data:bad,error:null})} as any,uid,requestId)).rejects.toThrow("RECONCILIATION_UNAVAILABLE");
  });
  it("maps missing owner attempt to generic 404", async () => {
    await expect(inspectPublication({rpc:async()=>({data:null,error:{code:"PT404",message:"details"}})} as any,uid,requestId)).rejects.toMatchObject({code:"PUBLICATION_NOT_FOUND",status:404});
  });
  it("does not mutate a cancelled tombstone during late orphan cleanup", async () => {
    const rpc=vi.fn(async(_name: string, _proof: { p_envelope: string })=>({data:plan("CANCELLED"),error:null}));
    const client={rpc,storage:{from:()=>({remove:async()=>({error:null})})}} as any;
    expect((await cancelPublication(client,uid,requestId,"reconcile")).state).toBe("CANCELLED");
    expect(rpc.mock.calls.map(c=>JSON.parse(c[1].p_envelope).action)).toEqual(["inspect","inspect"]);
  });
});
describe("cancellation route admission", () => {
  const req=(body:unknown,origin="http://localhost")=>new Request("http://localhost/api/publicar/cancelar",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
  it("requires same-origin",async()=>expect((await POST(req({requestId,action:"cancel"},"https://other.invalid"))).status).toBe(403));
  it("requires a verified user",async()=>expect((await POST(req({requestId,action:"cancel"}))).status).toBe(401));
  it.each([{requestId,action:"release"},{requestId,action:"cancel",path},{requestId:"bad",action:"cancel"}])("strictly rejects client mutation instructions %j",async body=>{
    auth.client={};auth.user={...registeredUser};expect((await POST(req(body))).status).toBe(400);
  });
  it("counts body bytes before JSON parsing",async()=>{auth.client={};auth.user={...registeredUser};expect((await POST(req({requestId,action:"cancel",junk:"x".repeat(1024)}))).status).toBe(413);});
  it.each(["cancel", "reconcile"])("preserves %s of an existing own attempt without newly requiring email confirmation", async action => {
    const rpc = vi.fn(async (_name: string, proof: { p_envelope: string }) => {
      const envelope = JSON.parse(proof.p_envelope);
      expect(envelope.uid).toBe(uid);
      expect(envelope.request_id).toBe(requestId);
      return { data: plan(envelope.action === "inspect" ? "ACTIVE" : envelope.action === "begin_cancel" ? "CANCEL_PENDING" : "CANCELLED"), error: null };
    });
    const remove = vi.fn().mockResolvedValue({ error: null });
    auth.client = { rpc, storage: { from: () => ({ remove }) } };
    auth.user = { ...registeredUser, email_confirmed_at: undefined };
    const response = await POST(req({ requestId, action }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, requestId, state: action === "cancel" ? "CANCELLED" : "ACTIVE" });
    expect(rpc.mock.calls.map(call => JSON.parse(call[1].p_envelope).action)).toEqual(
      action === "cancel" ? ["inspect", "begin_cancel", "close_cancel"] : ["inspect"]);
    if (action === "cancel") expect(remove).toHaveBeenCalledWith([path]);
    else expect(remove).not.toHaveBeenCalled();
  });
  it("denies a foreign attempt reported missing in the caller's owner context without Storage access", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PT404", message: "not found" } });
    const storageFrom = vi.fn();
    auth.client = { rpc, storage: { from: storageFrom } };
    auth.user = { ...registeredUser };
    const response = await POST(req({ requestId, action: "cancel" }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, code: "PUBLICATION_NOT_FOUND" });
    expect(body).not.toHaveProperty("preparation"); expect(body).not.toHaveProperty("subject");
    expect(JSON.parse(rpc.mock.calls[0][1].p_envelope).uid).toBe(uid);
    expect(rpc).toHaveBeenCalledOnce();
    expect(storageFrom).not.toHaveBeenCalled();
  });
  it("rejects a cross-owner returned path before cancellation or Storage access", async () => {
    const foreign = plan(); foreign.slots[0].path = "other/" + path;
    const rpc = vi.fn().mockResolvedValue({ data: foreign, error: null });
    const storageFrom = vi.fn();
    auth.client = { rpc, storage: { from: storageFrom } };
    auth.user = { ...registeredUser };
    expect((await POST(req({ requestId, action: "cancel" }))).status).toBe(503);
    expect(rpc).toHaveBeenCalledOnce();
    expect(storageFrom).not.toHaveBeenCalled();
  });
});
