import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { availableActions, listingStatusLabel, ListingValidationError, validateListingEdit } from "../app/lib/listing-management";

const stubs = vi.hoisted(() => ({ verified: vi.fn(), rpc: vi.fn(), remove: vi.fn(), row: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: stubs.refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: stubs.verified }));

import { POST } from "../app/api/mis-propiedades/route";
import ListingActions from "../app/components/account/ListingActions";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "34da4627-df58-4b7d-bff8-e51f1fd7190b";
const valid = { title: " Casa en Castilla ", description: "Amplia", price: "250000", currency: "USD", contact_phone: "987 654 321",
  maintenance_fee: "", area_total_m2: "200", area_built_m2: "150", bedrooms: "3", bathrooms: "2", parking_spaces: "1", floors: "2",
  address: "Av. Principal 1", district: "", city: "Piura", region: "Piura", lat: "-5.19", lng: "-80.63" };

function client() {
  return {
    rpc: stubs.rpc,
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: stubs.row }) }) }) }),
    storage: { from: () => ({ remove: stubs.remove }) },
  };
}
const request = (body: unknown, headers: Record<string, string> = {}) => new Request("http://localhost:3103/api/mis-propiedades", {
  method: "POST", body: JSON.stringify(body), headers: { origin: "http://localhost:3103", "content-type": "application/json", ...headers } });

beforeEach(() => {
  stubs.verified.mockResolvedValue({ client: client(), user: { id: OWNER } });
  stubs.rpc.mockReset().mockResolvedValue({ data: { id: ID, status: "published" }, error: null });
  stubs.remove.mockReset().mockResolvedValue({ data: [], error: null });
  stubs.row.mockReset().mockResolvedValue({ data: { property_type: "house" }, error: null });
  stubs.refresh.mockReset();
});

describe("validación de la edición", () => {
  it("normaliza teléfono, recorta textos y convierte opcionales vacíos en null", () => {
    const out = validateListingEdit(valid, "house");
    expect(out).toMatchObject({ title: "Casa en Castilla", contact_phone: "+51987654321", price: 250000, district: null, maintenance_fee: null, bedrooms: 3 });
  });
  it("en terrenos anula construcción, habitaciones y mantenimiento aunque lleguen", () => {
    const out = validateListingEdit({ ...valid, maintenance_fee: "50" }, "land");
    expect([out.area_built_m2, out.bedrooms, out.bathrooms, out.parking_spaces, out.floors, out.maintenance_fee]).toEqual([null, null, null, null, null, null]);
  });
  it.each([["price", "0"], ["price", "abc"], ["contact_phone", "123"], ["lat", "10"], ["bedrooms", "2.5"], ["title", ""], ["currency", "EUR"]])(
    "rechaza %s=%s", (key, value) => expect(() => validateListingEdit({ ...valid, [key]: value }, "house")).toThrow(ListingValidationError));
  it("rechaza campos no editables como tipo, operación, estado o dueño", () => {
    for (const key of ["property_type", "listing_type", "status", "owner_id", "slug"]) {
      expect(() => validateListingEdit({ ...valid, [key]: "x" }, "house")).toThrow(ListingValidationError);
    }
  });
});

describe("acciones disponibles y etiquetas", () => {
  const base = { listing_type: "sale", published_at: "2026-11-14T00:00:00Z" };
  it("publicado en venta: vender, reservar y pausar; se puede editar y eliminar", () => {
    expect(availableActions({ ...base, status: "published" })).toMatchObject({ actions: ["mark_sold", "reserve", "pause"], canEdit: true, canDelete: true });
  });
  it("publicado en alquiler y reservado: alquilado, quitar reservado y pausar", () => {
    expect(availableActions({ ...base, listing_type: "rent", status: "published", is_reserved: true }).actions).toEqual(["mark_rented", "unreserve", "pause"]);
  });
  it("pausado, vendido y alquilado se pueden volver a publicar", () => {
    for (const row of [{ status: "archived", owner_paused: true }, { status: "sold" }, { status: "rented" }]) {
      expect(availableActions({ ...base, ...row }).actions).toEqual(["reactivate"]);
    }
  });
  it("archivado por moderación: sin reactivar ni editar; solo eliminar", () => {
    expect(availableActions({ ...base, status: "archived", owner_paused: false })).toMatchObject({ actions: [], canEdit: false, canDelete: true, moderated: true });
  });
  it("borrador y eliminación pendiente no ofrecen gestión", () => {
    expect(availableActions({ ...base, status: "draft", published_at: null })).toMatchObject({ actions: [], canEdit: false, canDelete: false });
    expect(availableActions({ ...base, status: "archived", deletion_requested_at: "x" })).toMatchObject({ actions: [], canEdit: false, deleting: true });
  });
  it("etiquetas en español", () => {
    expect(listingStatusLabel({ status: "published", is_reserved: true })).toBe("Reservado");
    expect(listingStatusLabel({ status: "archived", owner_paused: true })).toBe("Pausado");
    expect(listingStatusLabel({ status: "archived" })).toBe("Archivado por revisión");
    expect(listingStatusLabel({ status: "sold" })).toBe("Vendido");
    expect(listingStatusLabel({ status: "archived", deletion_requested_at: "x" })).toBe("Eliminación pendiente");
  });
});

describe("ruta /api/mis-propiedades", () => {
  it("rechaza otro origen y peticiones sin sesión", async () => {
    expect((await POST(request({ op: "status", id: ID, action: "pause" }, { origin: "https://evil.example" }))).status).toBe(403);
    stubs.verified.mockResolvedValue({ client: null, user: null });
    expect((await POST(request({ op: "status", id: ID, action: "pause" }))).status).toBe(401);
    expect(stubs.rpc).not.toHaveBeenCalled();
  });
  it("edita con datos validados y llama solo a la función controlada", async () => {
    const response = await POST(request({ op: "edit", id: ID, fields: valid }));
    expect(response.status).toBe(200);
    expect(stubs.rpc).toHaveBeenCalledWith("owner_update_listing", { p_id: ID, p_fields: expect.objectContaining({ price: 250000, contact_phone: "+51987654321" }) });
  });
  it("no edita anuncios que no son del usuario", async () => {
    stubs.row.mockResolvedValue({ data: null, error: null });
    const response = await POST(request({ op: "edit", id: ID, fields: valid }));
    expect(response.status).toBe(404); expect(stubs.rpc).not.toHaveBeenCalled();
  });
  it("devuelve el error de validación sin llamar a la base", async () => {
    const response = await POST(request({ op: "edit", id: ID, fields: { ...valid, price: "-1" } }));
    expect(response.status).toBe(400); expect((await response.json()).code).toBe("VALIDATION_ERROR"); expect(stubs.rpc).not.toHaveBeenCalled();
  });
  it.each([[{ op: "status", id: ID, action: "publish" }], [{ op: "status", id: "x", action: "pause" }], [{ op: "status", id: ID, action: "pause", extra: 1 }], [{ op: "nuke", id: ID }]])(
    "rechaza solicitudes malformadas %j", async body => {
      expect((await POST(request(body))).status).toBe(400); expect(stubs.rpc).not.toHaveBeenCalled();
    });
  it("traduce los errores de la base de datos sin filtrar detalles", async () => {
    stubs.rpc.mockResolvedValue({ data: null, error: { message: "INVALID_TRANSITION", code: "P0001" } });
    let response = await POST(request({ op: "status", id: ID, action: "mark_sold" }));
    expect(response.status).toBe(409); expect((await response.json()).code).toBe("INVALID_TRANSITION");
    stubs.rpc.mockResolvedValue({ data: null, error: { message: "secret SQL detail", code: "XX000" } });
    response = await POST(request({ op: "status", id: ID, action: "mark_sold" }));
    const body = await response.json();
    expect(response.status).toBe(503); expect(JSON.stringify(body)).not.toContain("secret");
  });
  it("elimina en dos fases borrando solo fotos de su propia carpeta", async () => {
    stubs.rpc.mockImplementation(async (name: string) => name === "owner_begin_listing_deletion"
      ? { data: { paths: [`${OWNER}/${ID}/a.png`, `otro/${ID}/b.png`] }, error: null } : { data: { deleted: true }, error: null });
    const response = await POST(request({ op: "delete", id: ID }));
    expect(response.status).toBe(200);
    expect(stubs.remove).toHaveBeenCalledWith([`${OWNER}/${ID}/a.png`]);
    expect(stubs.rpc.mock.calls.map(c => c[0])).toEqual(["owner_begin_listing_deletion", "owner_finish_listing_deletion"]);
  });
  it("si no se pueden borrar las fotos, no completa la eliminación", async () => {
    stubs.rpc.mockResolvedValue({ data: { paths: [`${OWNER}/${ID}/a.png`] }, error: null });
    stubs.remove.mockResolvedValue({ data: null, error: { message: "denied" } });
    const response = await POST(request({ op: "delete", id: ID }));
    expect(response.status).toBe(502);
    expect(stubs.rpc.mock.calls.map(c => c[0])).toEqual(["owner_begin_listing_deletion"]);
  });
});

describe("botones de gestión", () => {
  const props = { id: ID, title: "Casa", slug: "casa", status: "published", listingType: "sale", isReserved: false, ownerPaused: false, deletionRequestedAt: null, publishedAt: "2026-11-14" };
  it("muestra las acciones del estado y pide confirmación antes de vender", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ListingActions {...props} />);
    for (const name of ["Ver ficha", "Editar"]) expect(screen.getByRole("link", { name })).toBeTruthy();
    for (const name of ["Marcar como vendido", "Marcar como reservado", "Pausar anuncio", "Eliminar"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Marcar como vendido" }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(stubs.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toEqual({ op: "status", id: ID, action: "mark_sold" });
  });
  it("no envía nada si el usuario cancela la eliminación", () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ListingActions {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("un borrador se descarta con la cancelación verificada del servidor, tras confirmar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, requestId: ID, state: "CANCELLED" }), { status: 200 })));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ListingActions {...props} status="draft" publishedAt={null} />);
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
    expect(screen.getByText(/No terminó de publicarse/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
    expect(confirm.mock.calls[0][0]).toContain("«Casa»");
    await waitFor(() => expect(screen.getByText("Borrador descartado.")).toBeTruthy());
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/publicar/cancelar");
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toEqual({ requestId: ID, action: "cancel" });
    expect(stubs.refresh).toHaveBeenCalled();
  });
  it("no descarta un borrador si el usuario no confirma, y avisa si falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "RECONCILIATION_UNAVAILABLE" }), { status: 503 })));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ListingActions {...props} status="draft" publishedAt={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
    await waitFor(() => expect(screen.getByText(/No pudimos descartarlo/)).toBeTruthy());
    expect(confirm).toHaveBeenCalledTimes(2);
  });
  it("un anuncio vendido ofrece volver a publicar y no muestra la ficha", () => {
    render(<ListingActions {...props} status="sold" />);
    expect(screen.getByRole("button", { name: "Volver a publicar" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Ver ficha" })).toBeNull();
  });
});

describe("migración de gestión", () => {
  const sql = readFileSync("supabase/migrations/20261115210000_owner_listing_management.sql", "utf8");
  it("no concede nada a anon y todas las funciones fijan search_path vacío", () => {
    expect(sql).not.toMatch(/grant [^;]* to [^;]*anon/i);
    const definers = sql.match(/security definer/g)?.length ?? 0;
    expect(definers).toBe(5);
    expect(sql.match(/security definer set search_path = ''/g)?.length).toBe(definers);
  });
  it("el borrado de fotos exige eliminación solicitada y titularidad", () => {
    expect(sql).toMatch(/for delete to authenticated[\s\S]*p\.owner_id = \(select auth\.uid\(\)\)[\s\S]*p\.deletion_requested_at is not null/);
  });
  it("se niega a eliminar si hay fotos fuera del bucket privado (no deja huérfanas)", () => {
    expect(sql).toMatch(/storage_bucket is distinct from 'property-images-private'\) then\s+raise exception 'LEGACY_IMAGES'/);
  });
  it("no da UPDATE directo sobre properties al dueño", () => {
    expect(sql).not.toMatch(/create policy[^;]*on public\.properties[^;]*for update/i);
    expect(sql).not.toMatch(/grant update/i);
  });
});
