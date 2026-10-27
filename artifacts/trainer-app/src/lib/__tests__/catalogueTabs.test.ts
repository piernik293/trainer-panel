import { describe, it, expect } from "vitest";
import { splitByTab } from "../catalogueTabs";

const list = [
  { id: 1, role: "główne" }, { id: 2, role: "pomocnicze" }, { id: 3, role: "rozgrzewka" },
  { id: 4, role: "rozciąganie" }, { id: 5, role: null }, { id: 6, role: "technika biegu" },
];
describe("zakładki katalogu", () => {
  it("rozgrzewka i rozciąganie są osobno od ćwiczeń treningowych", () => {
    expect(splitByTab(list, "warmup").map((e) => e.id)).toEqual([3, 4]);
    expect(splitByTab(list, "training").map((e) => e.id)).toEqual([1, 2, 5, 6]);
  });
  it("brak danych → puste listy", () => {
    expect(splitByTab(undefined, "training")).toEqual([]);
  });
});
