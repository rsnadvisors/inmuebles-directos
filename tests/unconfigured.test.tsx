import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "../app/page";
vi.mock("../app/lib/supabase", () => ({ supabase: null }));
vi.mock("../app/lib/auth-client", () => ({ getBrowserClient: () => null }));
it("shows a neutral error without a configured client or demo inventory", async () => {
  render(<Home />);
  expect((await screen.findByRole("alert")).textContent).toBe("No pudimos cargar las propiedades en este momento.");
  expect(screen.queryAllByRole("article")).toHaveLength(0);
});
