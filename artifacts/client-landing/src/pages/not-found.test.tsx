/** @vitest-environment happy-dom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import NotFound from "./not-found";

afterEach(cleanup);
describe("portal: strona 404", () => {
  it("po polsku, bez komunikatów dla programisty, z linkiem do planu", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Nie ma takiej strony" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Page Not Found|router|Did you forget/i);
    expect(screen.getByRole("link", { name: "Przejdź do planu" }).getAttribute("href")).toMatch(/plan$/);
  });
});
