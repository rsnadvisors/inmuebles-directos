import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublishPage from "../app/publicar/page";
import { MAX_PHOTO_BYTES, PARTIAL_MESSAGE, validatePublication } from "../app/lib/publication";

const photo = (type = "image/png", size = 4) => new File([new Uint8Array(size)], "fixture.png", { type });
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const change = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const pick = (files: File[]) => fireEvent.change(screen.getByLabelText(/Fotos de la propiedad/), { target: { files } });
const submit = () => fireEvent.submit(field("Título del anuncio").form!);
const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Confirmar coordenadas" }));
const reply = (body: unknown, status = 200) => ({ ok: status < 400, json: async () => body });
function ready(confirmed = true) {
  render(<PublishPage />);
  change("Título del anuncio", "Casa de prueba"); change("Descripción", "Descripción de prueba");
  change("Dirección o sector", "Piura"); change("Región", "Piura"); change("Ciudad o provincia", "Piura"); change("Precio", "100.5");
  change("Latitud", "-5.19"); change("Longitud", "-80.63");
  pick([photo()]); if (confirmed) confirm();
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ok: true, status: "published" }))));

describe("publication client guards", () => {
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
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Publicando…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(field("Título del anuncio").disabled).toBe(true);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/publicar"); expect(options?.method).toBe("POST");
    const payload = options?.body as FormData; expect(payload.getAll("images")).toHaveLength(1);
    expect(payload.get("coordinatesConfirmed")).toBe("true"); expect(payload.has("status")).toBe(false);
    await act(async () => resolve(reply({ ok: true, status: "published" })));
    expect(field("Título del anuncio").value).toBe("");
    expect(screen.queryByText("1 foto(s) seleccionada(s).")).toBeNull();
    expect(screen.getByText(/Coordenadas sin confirmar/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Publicar propiedad" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("Propiedad publicada");
  });
  it.each(["PARTIAL_OR_UNCERTAIN", "UNKNOWN"])("preserves form for %s and never retries", async code => {
    ready(); vi.mocked(fetch).mockResolvedValue(reply({ ok: false, code, message: "PRIVATE INTERNALS" }, 502) as Response);
    submit(); expect((await screen.findByRole("alert")).textContent).toBe(PARTIAL_MESSAGE);
    expect(field("Título del anuncio").value).toBe("Casa de prueba"); expect(screen.getByText("1 foto(s) seleccionada(s).")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Publicar propiedad" }) as HTMLButtonElement).disabled).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1); expect(screen.queryByText(/PRIVATE/)).toBeNull();
  });
  it.each(["PUBLICATION_FAILED", "VALIDATION_ERROR"])("releases lock after normalized %s", async code => {
    ready(); vi.mocked(fetch).mockResolvedValue(reply({ ok: false, code }, 503) as Response);
    submit(); await waitFor(() => expect(screen.getByRole("status").textContent).not.toBe("Publicando…"));
    expect(screen.queryByRole("alert")).toBeNull(); expect(field("Título del anuncio").value).toBe("Casa de prueba");
    submit(); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
  it.each(["network", "json"])("releases lock and preserves data after %s exception", async failure => {
    ready();
    if (failure === "network") vi.mocked(fetch).mockRejectedValue(new Error("PRIVATE"));
    else vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => { throw new Error("PRIVATE"); } } as unknown as Response);
    submit(); expect((await screen.findByRole("alert")).textContent).toBe(PARTIAL_MESSAGE);
    expect(field("Título del anuncio").value).toBe("Casa de prueba"); expect(fetch).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Publicar propiedad" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
