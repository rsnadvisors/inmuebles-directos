import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PropertyGallery from "../app/inmueble/[slug]/PropertyGallery";

const images = ["Fachada", "Sala", "Patio"].map(altText => ({ url: `/fixture-${altText}.jpg`, altText }));

describe("P0 gallery updates (isolated, offline)", () => {
  it("keeps the selected image and counter valid when the image list shrinks", () => {
    const view = render(<PropertyGallery title="Casa" images={images} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver imagen 3" }));
    expect(screen.getByText("3 / 3")).toBeTruthy();
    view.rerender(<PropertyGallery title="Otra casa" images={images.slice(0, 2)} />);
    expect(screen.getByAltText("Sala").getAttribute("src")).toBe("/fixture-Sala.jpg");
    expect(screen.getByText("2 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Imagen siguiente" }));
    expect(screen.getByAltText("Fachada")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Imagen anterior" }));
    expect(screen.getByAltText("Sala")).toBeTruthy();
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  it("handles an image list becoming empty and then a single image", () => {
    const view = render(<PropertyGallery title="Casa" images={images} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver imagen 3" }));
    view.rerender(<PropertyGallery title="Casa" images={[]} />);
    expect(screen.getByRole("img", { name: "Sin fotografías de Casa" })).toBeTruthy();
    view.rerender(<PropertyGallery title="Casa" images={[{ url: "/replacement.jpg", altText: null }]} />);
    expect(screen.getByRole("img", { name: "Casa" }).getAttribute("src")).toBe("/replacement.jpg");
    expect(screen.queryByRole("button", { name: "Imagen siguiente" })).toBeNull();
  });
});
