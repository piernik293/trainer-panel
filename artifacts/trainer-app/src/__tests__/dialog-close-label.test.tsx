/** @vitest-environment happy-dom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";

afterEach(cleanup);
describe("okna dialogowe", () => {
  it("przycisk zamykania ma polską nazwę dla czytników ekranu (nie „Close”)", () => {
    render(<Dialog open><DialogContent><DialogHeader><DialogTitle>Tytuł</DialogTitle><DialogDescription>Opis</DialogDescription></DialogHeader></DialogContent></Dialog>);
    expect(screen.getByRole("button", { name: "Zamknij" })).toBeTruthy();
    expect(screen.queryByText("Close")).toBeNull();
  });
});
