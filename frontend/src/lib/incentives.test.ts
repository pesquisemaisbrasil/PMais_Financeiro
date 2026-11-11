import { describe, expect, it } from "vitest";
import { groupByDay, overdueNotice, peopleText, type AgendaRow, type Bucket } from "./incentives";

const row = (id: number, dueDate: string, people: number, pending: string, situation: AgendaRow["situation"]): AgendaRow => ({
  id,
  dueDate,
  description: `Incentivos ${id}`,
  projectCodes: ["1804"],
  people,
  amount: "100.00",
  paid: "0.00",
  pending,
  situation,
});

describe("agenda de incentivos", () => {
  it("agrupa por data, em ordem, somando pessoas e o que falta pagar", () => {
    const days = groupByDay(
      [
        row(3, "2026-11-11", 3, "360.00", "a_vencer"),
        row(1, "2026-11-06", 5, "600.10", "vencido"),
        row(2, "2026-11-06", 2, "0.20", "vencido"),
      ],
      "2026-11-10",
    );
    expect(days.map((day) => day.date)).toEqual(["2026-11-06", "2026-11-11"]);
    expect(days[0]).toMatchObject({ people: 7, pending: 600.3, late: true });
    expect(days[0].rows.map((r) => r.id)).toEqual([1, 2]);
    expect(days[1]).toMatchObject({ people: 3, pending: 360, late: false });
  });

  it("data que já passou mas está toda paga não é atrasada", () => {
    const [day] = groupByDay([row(1, "2026-11-06", 5, "0.00", "pago")], "2026-11-10");
    expect(day.late).toBe(false);
  });

  it("escreve pessoa no singular e no plural", () => {
    expect(peopleText(1)).toBe("1 pessoa");
    expect(peopleText(14)).toBe("14 pessoas");
  });

  it("avisa do vencido que está fora do período à vista, e só dele", () => {
    const bucket = (count: number): Bucket => ({ count, people: count, total: "0.00" });
    expect(overdueNotice(bucket(0), bucket(0))).toBeNull();
    expect(overdueNotice(bucket(2), bucket(2))).toBeNull();
    expect(overdueNotice(bucket(3), bucket(2))).toBe("Há 1 lançamento de incentivo vencido fora deste período.");
    expect(overdueNotice(bucket(5), bucket(2))).toBe("Há 3 lançamentos de incentivo vencidos fora deste período.");
  });
});
