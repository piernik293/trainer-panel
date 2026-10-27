import { describe, it, expect } from "vitest";
import { joinPathFromCode } from "./AccountNotice";

describe("kod trenera wpisany ręcznie", () => {
  it("normalizuje małe litery, spacje i myślniki", () => {
    expect(joinPathFromCode("abcde-23456")).toBe("/join/ABCDE23456");
    expect(joinPathFromCode(" abcde 23456 ")).toBe("/join/ABCDE23456");
  });
  it("odrzuca za krótki i z nieprawidłowymi znakami", () => {
    expect(joinPathFromCode("ABC")).toBeNull();
    expect(joinPathFromCode("ABCDE2345!")).toBeNull();
  });
});
