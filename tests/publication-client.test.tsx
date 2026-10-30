import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublishPage from "../app/publicar/page";
import PublicationRecovery from "../app/publicar/PublicationRecovery";
import { MAX_PHOTO_BYTES, PARTIAL_MESSAGE, validatePublication } from "../app/lib/publication";

const photo = (type = "image/png", size = 4) => new File([new Uint8Array(size)], "fixture.png", { type });
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const change = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const pick = (files: File[]) => fireEvent.change(screen.getByLabelText(/Fotos de la propiedad/), { target: { files } });
const submit = () => fireEvent.submit(field("Título del anuncio").form!);
const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Confirmar coordenadas" }));
const reply = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body });
const userId = "11111111-1111-4111-8111-111111111111";
const recoveryId = "22222222-2222-4222-8222-222222222222";
const savedReference = () => JSON.stringify({ id: recoveryId, fingerprint: "ab".repeat(32) });
const publicationView = (canPublish = true, subject = userId) => <PublicationRecovery userId={subject} canPublish={canPublish}><PublishPage /></PublicationRecovery>;
async function checkAndResume() {
  fireEvent.click(screen.getByRole("button", { name: "Comprobar el intento pendiente" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Reintentar el mismo intento" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Reintentar el mismo intento" }));
}
function ready(confirmed = true) {
  const view = render(publicationView());
  change("Teléfono de contacto", "900 000 001");
  change("Título del anuncio", "Casa de prueba"); change("Descripción", "Descripción de prueba");
  change("Dirección o sector", "Piura"); change("Región", "Piura"); change("Ciudad o provincia", "Piura"); change("Precio", "100.5");
  change("Latitud", "-5.19"); change("Longitud", "-80.63");
  pick([photo()]); if (confirmed) confirm();
  return view;
}
beforeEach(() => {
  window.sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ok: true, status: "published" })));
});

describe("publication client guards", () => {
  it.each(["", "123", "abc", "javascript:alert(1)"])("rejects invalid contact phone %s before request", value => {
    ready(); change("Teléfono de contacto", value); submit(); expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("teléfono de contacto válido");
  });
  it("discloses public contact and preserves input on failure", async () => {
    ready(); const phone = field("Teléfono de contacto");
    expect(phone.type).toBe("tel"); expect(phone.inputMode).toBe("tel"); expect(phone.required).toBe(true);
    expect(screen.getByText(/Este número será público/)).toBeTruthy();
    vi.mocked(fetch).mockResolvedValue(reply({ ok: false, code: "PUBLICATION_FAILED", message: "No disponible" }, 503) as Response);
    submit(); await waitFor(() => expect(screen.getByRole("status").textContent).toContain("No disponible"));
    expect(phone.value).toBe("900 000 001");
    expect((vi.mocked(fetch).mock.calls[0][1]?.body as FormData).get("contact_phone")).toBe("900 000 001");
  });
  it.each(["Título del anuncio", "Descripción", "Dirección o sector"])("rejects blank %s before request", name => {
    ready(); change(name, ""); submit(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["Título del anuncio", "Descripción", "Dirección o sector"])("rejects whitespace %s before request", name => {
    ready(); change(name, "   "); submit(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["", "0", "-1", "NaN", "Infinity", "1000000001"])("rejects price %s", value => {
    ready(); change("Precio", value); submit(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["Operación", "Tipo de propiedad"])("rejects tampered enum %s", name => {
    ready(); const select = field(name); const option = document.createElement("option");
    option.value = "unknown"; select.append(option); change(name, "unknown"); submit(); expect(fetch).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation despite valid visual defaults", () => {
    ready(false); submit(); expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Confirma las coordenadas");
  });
  it.each(["", "NaN", "Infinity", "-19.1", "1.1"])("rejects latitude %s", value => {
    ready(); change("Latitud", value); confirm(); submit(); expect(fetch).not.toHaveBeenCalled();
  });
  it("invalidates confirmation after editing either coordinate", () => {
    ready(); change("Longitud", "-80.5"); submit(); expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Confirma");
  });
  it.each([0, 6])("rejects %i photos", count => {
    ready(); pick(Array.from({ length: count }, () => photo())); submit();
    expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByText(/foto\(s\) seleccionada/)).toBeNull();
  });
  it.each([["image/gif", 4], ["image/png", 0], ["image/png", MAX_PHOTO_BYTES + 1]] as const)("clears previous valid selection after %s size %i", (type, size) => {
    ready(); expect(screen.getByText("1 foto(s) seleccionada(s).")).toBeTruthy();
    pick([photo(type, size)]); expect(screen.queryByText("1 foto(s) seleccionada(s).")).toBeNull();
    submit(); expect(fetch).not.toHaveBeenCalled();
  });
  it("revalidates photos immediately at submit", () => {
    ready(); const file = photo(); pick([file]);
    Object.defineProperty(file, "size", { value: MAX_PHOTO_BYTES + 1 });
    submit(); expect(fetch).not.toHaveBeenCalled();
  });
  it("shared contract rejects raw non-finite values independently of numeric HTML coercion", () => {
    ready(); const data = new FormData(field("Título del anuncio").form!);
    data.set("latitude", "-5"); data.set("longitude", "-80"); data.set("coordinatesConfirmed", "true"); data.append("images", photo());
    for (const price of ["NaN", "Infinity", "", " ", "0", "-1"]) { data.set("price", price); expect(() => validatePublication(data)).toThrow(); }
  });
});

describe("geolocation confirmation", () => {
  function geo() { const getCurrentPosition = vi.fn(); vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } }); return getCurrentPosition; }
  it("rejects out-of-area geolocation without announcing success", () => {
    ready(); const location = geo(); fireEvent.click(screen.getByRole("button", { name: "Usar mi ubicación actual" }));
    act(() => location.mock.calls[0][0]({ coords: { latitude: 10, longitude: -77 } }));
    expect(screen.getByRole("status").textContent).toContain("fuera del área");
    submit(); expect(fetch).not.toHaveBeenCalled();
  });
  it("accepts successful in-area location as explicit confirmation", async () => {
    ready(false); const location = geo(); fireEvent.click(screen.getByRole("button", { name: "Usar mi ubicación actual" }));
    act(() => location.mock.calls[0][0]({ coords: { latitude: -5.2, longitude: -80.6 } }));
    submit(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
  it.each([1, 2, 3])("failure code %i unconfirms and preserves manual coordinates", code => {
    ready(); change("Latitud", "-5.3"); confirm(); const location = geo();
    fireEvent.click(screen.getByRole("button", { name: "Usar mi ubicación actual" }));
    act(() => location.mock.calls[0][1]({ code })); expect(field("Latitud").value).toBe("-5.3");
    submit(); expect(fetch).not.toHaveBeenCalled();
  });
  it("unsupported geolocation cannot keep previous confirmation", () => {
    ready(); vi.stubGlobal("navigator", {}); fireEvent.click(screen.getByRole("button", { name: "Usar mi ubicación actual" }));
    expect(screen.getByRole("status").textContent).toContain("no admite"); submit(); expect(fetch).not.toHaveBeenCalled();
  });
  it("ignores an obsolete geolocation callback after manual edit", () => {
    ready(); const location = geo(); fireEvent.click(screen.getByRole("button", { name: "Usar mi ubicación actual" }));
    change("Latitud", "-5.3");
    act(() => location.mock.calls[0][0]({ coords: { latitude: -5.1, longitude: -80.5 } }));
    expect(field("Latitud").value).toBe("-5.3"); submit(); expect(fetch).not.toHaveBeenCalled();
  });
});

describe("submission lifecycle", () => {
  it("two immediate events issue exactly one POST, disable the button and reset safely after await", async () => {
    ready(); let resolve!: (value: unknown) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(done => { resolve = done; }) as Promise<Response>);
    const form = field("Título del anuncio").form!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("button", { name: "Publicando…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(field("Título del anuncio").disabled).toBe(true);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/publicar"); expect(options?.method).toBe("POST");
    expect((options?.headers as Record<string, string>)["X-Publication-Request-Id"]).toMatch(/^[0-9a-f-]{36}$/);
    const payload = options?.body as FormData; expect(payload.getAll("images")).toHaveLength(1);
    expect(payload.get("coordinatesConfirmed")).toBe("true"); expect(payload.has("status")).toBe(false);
    await act(async () => resolve(reply({ ok: true, status: "published" })));
    expect(field("Título del anuncio").value).toBe("");
    expect(screen.queryByText("1 foto(s) seleccionada(s).")).toBeNull();
    expect(screen.getByText(/Coordenadas sin confirmar/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Publicar propiedad" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Iniciar nueva publicación" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Propiedad publicada");
  });
  it.each(["PARTIAL_OR_UNCERTAIN", "UNKNOWN"])("preserves form for %s and never retries", async code => {
    ready(); vi.mocked(fetch).mockResolvedValue(reply({ ok: false, code, message: "PRIVATE INTERNALS" }, 502) as Response);
    submit(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE));
    expect(field("Título del anuncio").value).toBe("Casa de prueba"); expect(screen.getByText("1 foto(s) seleccionada(s).")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Publicar propiedad" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1); expect(screen.queryByText(/PRIVATE/)).toBeNull();
  });
  it.each(["PUBLICATION_FAILED", "VALIDATION_ERROR"])("releases the operation lock but requires recovery after normalized %s", async code => {
    ready(); vi.mocked(fetch).mockResolvedValue(reply({ ok: false, code }, 503) as Response);
    submit(); await waitFor(() => expect(screen.getByRole("status").textContent).not.toBe("Publicando…"));
    expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE); expect(field("Título del anuncio").value).toBe("Casa de prueba");
    expect((screen.getByRole("button", { name: "Comprobar el intento pendiente" }) as HTMLButtonElement).disabled).toBe(false);
    submit(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["network", "json"])("releases lock and preserves data after %s exception", async failure => {
    ready();
    if (failure === "network") vi.mocked(fetch).mockRejectedValue(new Error("PRIVATE"));
    else vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => { throw new Error("PRIVATE"); } } as unknown as Response);
    submit(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE));
    expect(field("Título del anuncio").value).toBe("Casa de prueba"); expect(fetch).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Publicar propiedad" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps one request ID across an ambiguous response and retains it after confirmed publication", async () => {
    ready();
    vi.mocked(fetch).mockResolvedValueOnce(reply({ ok: false, code: "UNKNOWN" }, 502) as Response)
      .mockImplementationOnce(async (_url, options) => reply({ ok: true, state: "ACTIVE", requestId: JSON.parse(options?.body as string).requestId }) as Response)
      .mockResolvedValueOnce(reply({ ok: true, status: "published", imageDelivery: "unconfirmed" }) as Response);
    submit(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE));
    const firstId = (vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>)["X-Publication-Request-Id"];
    expect(JSON.parse(window.sessionStorage.getItem("publicationAttempt")!).id).toBe(firstId);
    await checkAndResume();
    submit(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const secondId = (vi.mocked(fetch).mock.calls[2][1]?.headers as Record<string, string>)["X-Publication-Request-Id"];
    expect(secondId).toBe(firstId);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Propiedad publicada"));
    expect(screen.getByRole("status").textContent).toContain("imagen");
    expect(JSON.parse(window.sessionStorage.getItem("publicationAttempt")!).id).toBe(firstId);
  });
  it("replays the same normalized intent and identical photo bytes after the page remounts", async () => {
    const view = ready();
    vi.mocked(fetch).mockResolvedValueOnce(reply({ ok: false, code: "UNKNOWN" }, 502) as Response)
      .mockImplementationOnce(async (_url, options) => reply({ ok: true, state: "ACTIVE", requestId: JSON.parse(options?.body as string).requestId }) as Response)
      .mockResolvedValueOnce(reply({ ok: true, status: "published", imageDelivery: "not_checked" }) as Response);
    submit(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE));
    const firstId = (vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>)["X-Publication-Request-Id"];
    view.unmount(); ready();
    change("Título del anuncio", "  Casa de prueba  "); change("Precio", "100.500");
    submit(); expect(fetch).toHaveBeenCalledTimes(1);
    await checkAndResume();
    submit(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const nextId = (vi.mocked(fetch).mock.calls[2][1]?.headers as Record<string, string>)["X-Publication-Request-Id"];
    expect(nextId).toBe(firstId);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Propiedad publicada"));
    expect(JSON.parse(window.sessionStorage.getItem("publicationAttempt")!).id).toBe(firstId);
  });
  const bytesPhoto = (bytes: number[], type = "image/png") => new File([new Uint8Array(bytes)], "fixture.png", { type });
  it.each([
    ["title", () => {}, () => change("Título del anuncio", "Otra casa")],
    ["price", () => {}, () => change("Precio", "200")],
    ["photo bytes", () => {}, () => pick([bytesPhoto([1, 2, 3, 4])])],
    ["photo MIME type", () => {}, () => pick([photo("image/jpeg")])],
    ["photo order", () => pick([bytesPhoto([1]), bytesPhoto([2])]), () => pick([bytesPhoto([2]), bytesPhoto([1])])],
  ] as const)("blocks changed %s until server-confirmed cancellation", async (_label, initial, edit) => {
    ready(); initial();
    vi.mocked(fetch).mockResolvedValueOnce(reply({ ok: false, code: "UNKNOWN" }, 502) as Response)
      .mockImplementationOnce(async (_url, options) => reply({ ok: true, state: "ACTIVE", requestId: JSON.parse(options?.body as string).requestId }) as Response)
      .mockImplementationOnce(async () => reply({ ok: true, state: "CANCELLED", requestId: JSON.parse(window.sessionStorage.getItem("publicationAttempt")!).id }) as Response)
      .mockResolvedValueOnce(reply({ ok: true, status: "published" }) as Response);
    submit(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE));
    const firstAttempt = window.sessionStorage.getItem("publicationAttempt");
    const firstId = (vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>)["X-Publication-Request-Id"];
    await checkAndResume();
    edit(); submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("publicación anterior pendiente"));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(firstAttempt);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar el intento pendiente" }));
    await waitFor(() => expect(window.sessionStorage.getItem("publicationAttempt")).toBeNull());
    expect(vi.mocked(fetch).mock.calls[2][0]).toBe("/api/publicar/cancelar");
    expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as string)).toEqual({ requestId: firstId, action: "cancel" });
    submit(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    const nextId = (vi.mocked(fetch).mock.calls[3][1]?.headers as Record<string, string>)["X-Publication-Request-Id"];
    expect(nextId).not.toBe(firstId);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Propiedad publicada"));
  });
});

describe("publication recovery after mounting", () => {
  const check = () => fireEvent.click(screen.getByRole("button", { name: "Comprobar el intento pendiente" }));
  const cancel = () => fireEvent.click(screen.getByRole("button", { name: "Cancelar el intento pendiente" }));
  const publishButton = () => screen.getByRole("button", { name: "Publicar propiedad" }) as HTMLButtonElement;
  function restore(raw = savedReference(), canPublish = true) {
    window.sessionStorage.setItem("publicationAttempt", raw);
    return render(publicationView(canPublish));
  }
  it("restores before form validation without photos, automatic requests or UUID allocation", () => {
    const uuid = vi.spyOn(crypto, "randomUUID");
    restore();
    expect(field("Título del anuncio").value).toBe("");
    expect((screen.getByLabelText(/Fotos de la propiedad/) as HTMLInputElement).files).toHaveLength(0);
    expect(screen.getByText(/Comprobar puede completar una cancelación/)).toBeTruthy();
    expect(publishButton().disabled).toBe(true);
    submit(); expect(fetch).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled();
  });
  it("checks an existing own attempt using only its ID while the form remains empty", async () => {
    restore();
    vi.mocked(fetch).mockResolvedValue(reply({ ok: true, requestId: recoveryId, state: "ACTIVE" }) as Response);
    check();
    await screen.findByRole("button", { name: "Reintentar el mismo intento" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/publicar/cancelar");
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toEqual({ requestId: recoveryId, action: "reconcile" });
    expect(publishButton().disabled).toBe(true);
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(savedReference());
  });
  it("cancels explicitly without validating or submitting a new publication", async () => {
    restore(); vi.mocked(fetch).mockResolvedValue(reply({ ok: true, requestId: recoveryId, state: "CANCELLED" }) as Response);
    cancel(); await waitFor(() => expect(window.sessionStorage.getItem("publicationAttempt")).toBeNull());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toEqual({ requestId: recoveryId, action: "cancel" });
    expect(publishButton().disabled).toBe(false);
  });
  it("keeps a pending cancellation frozen", async () => {
    restore(); vi.mocked(fetch).mockResolvedValue(reply({ ok: true, requestId: recoveryId, state: "CANCEL_PENDING" }) as Response);
    check(); await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("cancelación sigue pendiente"));
    expect(publishButton().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Reintentar el mismo intento" })).toBeNull();
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(savedReference());
  });
  it("R06: retains a terminal reference on the documented correlated 409", async () => {
    restore(); vi.mocked(fetch).mockResolvedValue(reply({ ok: false, code: "PUBLICATION_ALREADY_FINALIZED" }, 409) as Response);
    check(); await screen.findByRole("button", { name: "Iniciar nueva publicación" });
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(savedReference());
    expect(publishButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("ya fue registrada");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    [403, { ok: false, code: "AUTH_REQUIRED", owner: "PRIVATE" }],
    [404, { ok: false, code: "PUBLICATION_NOT_FOUND" }],
    [200, { ok: true, requestId: recoveryId, state: "FINALIZED" }],
    [200, { ok: true, requestId: "44444444-4444-4444-8444-444444444444", state: "CANCELLED" }],
    [200, { ok: false, code: "PUBLICATION_ALREADY_FINALIZED" }],
    [409, { ok: true, code: "PUBLICATION_ALREADY_FINALIZED" }],
    [409, { ok: false, code: "PUBLICATION_ALREADY_FINALIZED", requestId: "44444444-4444-4444-8444-444444444444" }],
    [200, { ok: true, requestId: recoveryId, state: "CANCELLED", code: "PUBLICATION_ALREADY_FINALIZED" }],
    [200, null],
  ] as const)("preserves uncertain or contradictory response %s %j", async (status, body) => {
    restore(); vi.mocked(fetch).mockResolvedValue(reply(body, status) as Response);
    check(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE));
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(savedReference());
    expect(publishButton().disabled).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/PRIVATE/)).toBeNull();
  });
  it.each(["network", "json"])("R04: keeps the reference after recovery %s failure without automatic retry", async failure => {
    restore();
    if (failure === "network") vi.mocked(fetch).mockRejectedValue(new Error("PRIVATE"));
    else vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("PRIVATE"); } } as unknown as Response);
    check(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE));
    expect(fetch).toHaveBeenCalledTimes(1); expect(window.sessionStorage.getItem("publicationAttempt")).toBe(savedReference());
    expect(publishButton().disabled).toBe(true);
  });
  it.each(["not-json", "null", JSON.stringify({ id: "invalid", fingerprint: "ab".repeat(32) }),
    JSON.stringify({ id: recoveryId, fingerprint: "ab".repeat(32), padding: "á".repeat(600) })])("blocks malformed or oversized reference %s", raw => {
    restore(raw); submit();
    expect(screen.getByRole("alert").textContent).toContain("referencia local no es válida");
    expect(screen.queryByRole("button", { name: "Comprobar el intento pendiente" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled(); expect(publishButton().disabled).toBe(true);
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(raw);
  });
  it("allows ID-only recovery for a bad fingerprint without repairing it or allowing publication", async () => {
    const raw = JSON.stringify({ id: recoveryId, fingerprint: "bad", owner: "untrusted", state: "FINALIZED" });
    restore(raw); vi.mocked(fetch).mockResolvedValue(reply({ ok: true, requestId: recoveryId, state: "ACTIVE" }) as Response);
    check(); await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("intento sigue pendiente"));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toEqual({ requestId: recoveryId, action: "reconcile" });
    expect(screen.queryByRole("button", { name: "Reintentar el mismo intento" })).toBeNull();
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(raw); expect(publishButton().disabled).toBe(true);
  });
  it("blocks new publication when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("unavailable"); });
    ready(); submit(); expect(fetch).not.toHaveBeenCalled(); expect(publishButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("almacenamiento");
  });
  it("never POSTs if the generated attempt cannot be persisted", async () => {
    ready(); const uuid = vi.spyOn(crypto, "randomUUID");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
    submit(); await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("No enviamos la publicación"));
    submit(); expect(fetch).not.toHaveBeenCalled(); expect(uuid).toHaveBeenCalledOnce();
  });
  it("keeps the local block if terminal reference deletion fails", async () => {
    restore(); vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("unavailable"); });
    vi.mocked(fetch).mockResolvedValue(reply({ ok: true, requestId: recoveryId, state: "CANCELLED" }) as Response);
    cancel(); await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("no pudimos cerrar la referencia local"));
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(savedReference()); expect(publishButton().disabled).toBe(true);
  });
  it("blocks a second synchronous recovery action", async () => {
    restore(); let done!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { done = resolve; }));
    const button = screen.getByRole("button", { name: "Comprobar el intento pendiente" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => done(reply({ ok: true, requestId: recoveryId, state: "ACTIVE" }) as Response));
  });
  it.each(["replacement", "unmount", "identity"])("does not clear a later reference after %s", async changeContext => {
    const view = restore(); let done!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { done = resolve; }));
    check();
    const later = JSON.stringify({ id: "44444444-4444-4444-8444-444444444444", fingerprint: "cd".repeat(32) });
    window.sessionStorage.setItem("publicationAttempt", later);
    if (changeContext === "unmount") view.unmount();
    if (changeContext === "identity") view.rerender(publicationView(false, "55555555-5555-4555-8555-555555555555"));
    await act(async () => done(reply({ ok: true, requestId: recoveryId, state: "CANCELLED" }) as Response));
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(later); expect(fetch).toHaveBeenCalledTimes(1);
    if (changeContext === "replacement") expect(publishButton().disabled).toBe(true);
  });
  it("does not clear a newer reference after an old publication response arrives", async () => {
    const view = ready(); let done!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { done = resolve; }));
    submit(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1)); view.unmount();
    const later = savedReference(); window.sessionStorage.setItem("publicationAttempt", later);
    await act(async () => done(reply({ ok: true, status: "published" }) as Response));
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(later);
  });
  it("does not query or allocate IDs on repeated remounts", () => {
    const uuid = vi.spyOn(crypto, "randomUUID");
    for (let count = 0; count < 3; count++) { const view = restore(); expect(publishButton().disabled).toBe(true); view.unmount(); }
    expect(fetch).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled();
  });
  it("shows recovery alone for a noneligible verified identity and retains a denied foreign reference", async () => {
    restore(savedReference(), false);
    expect(screen.queryByRole("button", { name: "Publicar propiedad" })).toBeNull();
    expect(screen.queryByLabelText("Título del anuncio")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue(reply({ ok: false, code: "PUBLICATION_NOT_FOUND" }, 404) as Response);
    check(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE));
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(savedReference());
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("allows limited own-attempt cancellation without exposing a new-publication form", async () => {
    restore(savedReference(), false);
    vi.mocked(fetch).mockResolvedValue(reply({ ok: true, requestId: recoveryId, state: "CANCELLED" }) as Response);
    cancel(); await waitFor(() => expect(window.sessionStorage.getItem("publicationAttempt")).toBeNull());
    expect(screen.queryByLabelText("Título del anuncio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Publicar propiedad" })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/publicar/cancelar");
  });
});

describe("F01/F02 regression transitions", () => {
  const check = () => fireEvent.click(screen.getByRole("button", { name: "Comprobar el intento pendiente" }));
  const publishButton = () => screen.getByRole("button", { name: "Publicar propiedad" }) as HTMLButtonElement;
  const rejected = (id: string, overrides: Record<string, unknown> = {}, status = 400) => reply({
    ok: false, code: "VALIDATION_ERROR", message: "Corrige los datos.", preparation: "NOT_STARTED",
    requestId: id, subject: userId, ...overrides,
  }, status) as Response;
  async function recoverFinalized() {
    const view = ready();
    vi.mocked(fetch).mockResolvedValueOnce(reply({ ok: false, code: "UNKNOWN" }, 503) as Response)
      .mockResolvedValueOnce(reply({ ok: false, code: "PUBLICATION_ALREADY_FINALIZED" }, 409) as Response);
    submit(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE));
    const raw = window.sessionStorage.getItem("publicationAttempt")!;
    check(); await screen.findByRole("button", { name: "Iniciar nueva publicación" });
    return { view, raw };
  }
  it("R01: releases only a new correlated pre-preparation rejection and preserves the form", async () => {
    ready(); const uuid = vi.spyOn(crypto, "randomUUID");
    vi.mocked(fetch).mockImplementationOnce(async (_url, options) => rejected(
      (options?.headers as Record<string, string>)["X-Publication-Request-Id"]));
    submit(); await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Corrige los datos."));
    expect(window.sessionStorage.getItem("publicationAttempt")).toBeNull();
    expect(field("Título del anuncio").value).toBe("Casa de prueba");
    expect(screen.getByText("1 foto(s) seleccionada(s).")).toBeTruthy();
    expect(publishButton().disabled).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1); expect(uuid).toHaveBeenCalledOnce();
    const firstId = (vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>)["X-Publication-Request-Id"];
    change("Título del anuncio", "Casa corregida");
    vi.mocked(fetch).mockResolvedValueOnce(reply({ ok: true, status: "published" }) as Response);
    submit(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(uuid).toHaveBeenCalledTimes(2);
    expect((vi.mocked(fetch).mock.calls[1][1]?.headers as Record<string, string>)["X-Publication-Request-Id"]).not.toBe(firstId);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Propiedad publicada"));
  });
  it.each(["same-mount", "restored"])("R02/R05: keeps an uncertain %s reference after a later rejection", async context => {
    const view = ready();
    vi.mocked(fetch).mockResolvedValueOnce(reply({ ok: false, code: "UNKNOWN" }, 503) as Response)
      .mockImplementationOnce(async (_url, options) => reply({ ok: true, state: "ACTIVE",
        requestId: JSON.parse(options?.body as string).requestId }) as Response)
      .mockImplementationOnce(async (_url, options) => rejected((options?.headers as Record<string, string>)["X-Publication-Request-Id"]));
    submit(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE));
    const raw = window.sessionStorage.getItem("publicationAttempt");
    if (context === "restored") { view.unmount(); ready(); }
    await checkAndResume(); submit();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Corrige los datos."));
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(raw);
    expect(publishButton().disabled).toBe(true);
    const first = (vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>)["X-Publication-Request-Id"];
    expect((vi.mocked(fetch).mock.calls[2][1]?.headers as Record<string, string>)["X-Publication-Request-Id"]).toBe(first);
  });
  it.each([
    [{ subject: "55555555-5555-4555-8555-555555555555" }, 400],
    [{ requestId: "44444444-4444-4444-8444-444444444444" }, 400],
    [{ preparation: undefined }, 400],
    [{}, 200],
    [{ code: "PUBLICATION_NOT_FOUND" }, 404],
  ] as const)("R03: does not release an unproven rejection %j/%s", async (overrides, status) => {
    ready();
    vi.mocked(fetch).mockImplementationOnce(async (_url, options) => rejected(
      (options?.headers as Record<string, string>)["X-Publication-Request-Id"], overrides, status));
    submit(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(PARTIAL_MESSAGE));
    expect(window.sessionStorage.getItem("publicationAttempt")).not.toBeNull();
    expect(publishButton().disabled).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("R01: keeps the block if removing a conclusively rejected reference fails", async () => {
    ready(); vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("unavailable"); });
    vi.mocked(fetch).mockImplementationOnce(async (_url, options) => rejected(
      (options?.headers as Record<string, string>)["X-Publication-Request-Id"]));
    submit(); await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Corrige los datos."));
    expect(window.sessionStorage.getItem("publicationAttempt")).not.toBeNull();
    expect(publishButton().disabled).toBe(true); submit(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("R06/R07: a recovered finalization never resubmits the retained form", async () => {
    const uuid = vi.spyOn(crypto, "randomUUID");
    const { raw } = await recoverFinalized();
    expect(field("Título del anuncio").value).toBe("Casa de prueba");
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(raw);
    expect(publishButton().disabled).toBe(true);
    submit(); expect(fetch).toHaveBeenCalledTimes(2); expect(uuid).toHaveBeenCalledOnce();
  });
  it("R08/R10: explicit new publication resets once without allocating an ID or sending", async () => {
    const uuid = vi.spyOn(crypto, "randomUUID");
    const { raw } = await recoverFinalized();
    const button = screen.getByRole("button", { name: "Iniciar nueva publicación" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(window.sessionStorage.getItem("publicationAttempt")).toBeNull();
    expect(field("Título del anuncio").value).toBe(""); expect(field("Teléfono de contacto").value).toBe("");
    expect(field("Latitud").value).toBe(""); expect(field("Longitud").value).toBe("");
    expect(screen.queryByText("1 foto(s) seleccionada(s).")).toBeNull();
    expect(screen.getByText(/Coordenadas sin confirmar/)).toBeTruthy();
    expect(publishButton().disabled).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2); expect(uuid).toHaveBeenCalledOnce();
    change("Teléfono de contacto", "900000001"); change("Título del anuncio", "Nueva casa");
    change("Descripción", "Nueva descripción"); change("Dirección o sector", "Piura");
    change("Región", "Piura"); change("Ciudad o provincia", "Piura"); change("Precio", "200");
    change("Latitud", "-5.19"); change("Longitud", "-80.63"); pick([photo()]); confirm();
    vi.mocked(fetch).mockResolvedValueOnce(reply({ ok: true, status: "published" }) as Response);
    submit(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(uuid).toHaveBeenCalledTimes(2);
    expect((vi.mocked(fetch).mock.calls[2][1]?.headers as Record<string, string>)["X-Publication-Request-Id"]).not.toBe(JSON.parse(raw).id);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Propiedad publicada"));
  });
  it("R06: remounting a finalized reference stays blocked without an automatic request", async () => {
    const { view, raw } = await recoverFinalized();
    view.unmount(); render(publicationView());
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(raw);
    expect(publishButton().disabled).toBe(true); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("R08: failed terminal-reference deletion never resets the form or permits submission", async () => {
    const { raw } = await recoverFinalized();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("unavailable"); });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar nueva publicación" }));
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(raw);
    expect(field("Título del anuncio").value).toBe("Casa de prueba");
    expect(publishButton().disabled).toBe(true); expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert").textContent).toContain("Conservamos el bloqueo");
  });
  it("R09: an old conclusive rejection cannot clear a reference after identity changes", async () => {
    const view = ready(); let done!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { done = resolve; }));
    submit(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const raw = window.sessionStorage.getItem("publicationAttempt")!;
    view.rerender(publicationView(true, "55555555-5555-4555-8555-555555555555"));
    await act(async () => done(rejected(JSON.parse(raw).id)));
    expect(window.sessionStorage.getItem("publicationAttempt")).toBe(raw);
    expect(publishButton().disabled).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
