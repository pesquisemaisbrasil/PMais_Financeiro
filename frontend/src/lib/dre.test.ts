import { describe, expect, it } from "vitest";
import { yearToDate } from "./dre";

describe("DRE", () => {
  it("abre no ano até hoje", () => {
    expect(yearToDate("2026-11-25")).toEqual({ start: "2026-01-01", end: "2026-11-25" });
    expect(yearToDate("2027-01-02")).toEqual({ start: "2027-01-01", end: "2027-01-02" });
  });
});
