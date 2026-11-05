import { describe, expect, it } from "vitest";
import {
  addDays,
  brl,
  dateFromIso,
  formatDate,
  greeting,
  isoFromDate,
  monthRange,
  nextRange,
  occurrenceEdits,
  seriesLabel,
  parseAllocations,
  parseMoney,
  periodLabel,
  toCents,
  type Project,
  filterOptions,
  replacedMessage,
  replacesNote,
  scheduleText,
  formatCnpj,
  inssAmount,
  itemPaymentLabel,
  type PayableDetail,
} from "./payables";

const PROJECTS: Project[] = [
  { id: 1, code: "1804", title: "A", status: "em_andamento", projectType: null, hasIncentive: false, incentiveDays: null },
  { id: 2, code: "1790", title: "B", status: "em_andamento", projectType: null, hasIncentive: false, incentiveDays: null },
  { id: 3, code: "1700", title: "C", status: "encerrado", projectType: null, hasIncentive: false, incentiveDays: null },
];

describe("parseMoney", () => {
  it.each([
    ["1.234,56", "1234.56"],
    ["1234,5", "1234.50"],
    ["1000", "1000.00"],
    [" 12,00 ", "12.00"],
    ["1.000.000,10", "1000000.10"],
    ["1500.50", "1500.50"],
    ["1500.5", "1500.50"],
    ["1.234", "1234.00"],
  ])("lê %s", (text, expected) => {
    expect(parseMoney(text)).toBe(expected);
  });

  it.each(["", "abc", "R$ 10", "-5", "10,999", "1.23,00", "1,2,3"])("recusa %s", (text) => {
    expect(parseMoney(text)).toBeNull();
  });
});

describe("parseAllocations", () => {
  it("aceita ponto e vírgula, tabulação e o prefixo PRJ", () => {
    const result = parseAllocations("1804;600,00\nPRJ-1790\t400,00\n", PROJECTS, "1000.00");
    expect(result).toEqual({
      allocations: [
        { projectId: 1, amount: "600.00" },
        { projectId: 2, amount: "400.00" },
      ],
      error: null,
    });
  });

  it("não precisa de projeto", () => {
    expect(parseAllocations("  \n", PROJECTS, "10.00")).toEqual({ allocations: [], error: null });
  });

  it("diz a diferença quando a soma não fecha", () => {
    expect(parseAllocations("1804;990,00", PROJECTS, "1000.00").error).toMatch(/somam R\$\s990,00.*R\$\s1\.000,00/);
  });

  it("aponta a linha do projeto que não existe", () => {
    expect(parseAllocations("1804;1,00\n9999;1,00", PROJECTS, "2.00").error).toBe(
      "Projeto 9999 não encontrado (linha 2)"
    );
  });

  it("recusa valor com R$ ou texto", () => {
    expect(parseAllocations("1804;R$ 10", PROJECTS, "10.00").error).toBe("Linha 1: use só números no valor");
  });

  it("recusa projeto encerrado", () => {
    expect(parseAllocations("1700;10,00", PROJECTS, "10.00").error).toMatch(/fechado/);
  });

  it("soma centavos sem erro de ponto flutuante", () => {
    expect(parseAllocations("1804;0,10\n1790;0,20", PROJECTS, "0.30").error).toBeNull();
  });
});

describe("período", () => {
  it("mostra cada visão", () => {
    expect(periodLabel("dia", "2026-11-04")).toBe("04/11/2026");
    expect(periodLabel("semana", "2026-11-04")).toBe("02/11/2026 a 08/11/2026");
    expect(periodLabel("semana", "2026-11-08")).toBe("02/11/2026 a 08/11/2026");
    expect(periodLabel("mes", "2026-11-04")).toBe("novembro/2026");
    expect(periodLabel("ano", "2026-11-04")).toBe("2026");
    expect(periodLabel("tudo", "2026-11-04")).toBe("Todo o período");
  });

  it("o período livre parte do mês da data", () => {
    expect(monthRange("2026-02-18")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthRange("2026-12-31")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });

  it("soma dias atravessando o mês", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("calendário", () => {
  it("o primeiro clique marca o início, e o segundo fecha o intervalo", () => {
    const first = nextRange({}, "2026-11-04");
    expect(first).toEqual({ from: "2026-11-04" });
    expect(nextRange(first, "2026-11-10")).toEqual({ from: "2026-11-04", to: "2026-11-10" });
  });

  it("aceita escolher a data final antes da inicial", () => {
    expect(nextRange({ from: "2026-11-10" }, "2026-11-04")).toEqual({ from: "2026-11-04", to: "2026-11-10" });
  });

  it("clicar no mesmo dia duas vezes escolhe um dia só", () => {
    expect(nextRange({ from: "2026-11-04" }, "2026-11-04")).toEqual({ from: "2026-11-04", to: "2026-11-04" });
  });

  it("com o intervalo pronto, o próximo clique recomeça", () => {
    expect(nextRange({ from: "2026-11-04", to: "2026-11-10" }, "2026-11-07")).toEqual({ from: "2026-11-07" });
  });

  it("converte a data sem mudar o dia por causa do fuso", () => {
    expect(isoFromDate(new Date(2026, 10, 4, 23, 59))).toBe("2026-11-04");
    expect(isoFromDate(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
    expect(isoFromDate(dateFromIso("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("formatação", () => {
  it("mostra dinheiro e datas em pt-BR", () => {
    expect(brl("1234.5")).toMatch(/R\$\s1\.234,50/);
    expect(formatDate("2026-11-04")).toBe("04/11/2026");
    expect(formatDate(null)).toBe("—");
    expect(toCents("1234.56")).toBe(123456);
  });

  it("cumprimenta pelo horário de São Paulo, não o da máquina", () => {
    expect(greeting(new Date("2026-11-04T11:00:00Z"))).toBe("Bom dia");
    expect(greeting(new Date("2026-11-04T16:00:00Z"))).toBe("Boa tarde");
    expect(greeting(new Date("2026-11-04T23:00:00Z"))).toBe("Boa noite");
    expect(greeting(new Date("2026-11-05T01:00:00Z"))).toBe("Boa noite");
  });
});

describe("busca nas listas", () => {
  const options = [{ label: "Gráfica Ponto Certo" }, { label: "Exata Contabilidade" }];

  it("ignora maiúscula e acento", () => {
    expect(filterOptions(options, "grafica")).toEqual([options[0]]);
    expect(filterOptions(options, "  EXATA ")).toEqual([options[1]]);
  });

  it("sem termo, mostra tudo; sem resultado, lista vazia", () => {
    expect(filterOptions(options, "")).toEqual(options);
    expect(filterOptions(options, "zzz")).toEqual([]);
  });
});

describe("provisão substituída", () => {
  it("mostra a diferença sem erro de centavos", () => {
    expect(replacesNote("0.30", "0.10")).toMatch(/substitui a provisão de R\$\s0,10 \(\+R\$\s0,20\)/);
    expect(replacesNote("900.00", "1000.00")).toMatch(/\(−R\$\s100,00\)/);
    expect(replacesNote("1000.00", "1000.00")).not.toContain("(");
  });

  it("diz se o real ficou acima ou abaixo", () => {
    expect(replacedMessage("1100.00", "1000.00")).toMatch(/R\$\s100,00 acima\)\. Saiu do previsto\.$/);
    expect(replacedMessage("900.00", "1000.00")).toMatch(/R\$\s100,00 abaixo\)/);
    expect(replacedMessage("1000.00", "1000.00")).toMatch(/real de R\$\s1\.000,00\. Saiu/);
  });
});

describe("cronograma para o projeto", () => {
  it("lista cada data, com o prazo e o total", () => {
    const text = scheduleText(
      {
        kind: "incentivos",
        projectType: "Health",
        deadlineDays: 10,
        missingDeadline: false,
        alreadyImported: false,
        total: "600.00",
        goodCount: 3,
        errorCount: 0,
        lines: [],
        groups: [
          { payDate: "2026-11-16", surveyDates: ["2026-10-30"], count: 1, total: "200.00", source: "calculada pelo prazo" },
          { payDate: "2026-11-20", surveyDates: [], count: 2, total: "400.00", source: "informada na planilha" },
        ],
      },
      "1804",
      "Pesquisa"
    );
    expect(text).toContain("PRJ-1804 Pesquisa");
    expect(text).toContain("Prazo: 10 dias úteis depois da data da pesquisa (Health)");
    expect(text).toMatch(/- Pesquisas de 30\/10: 1 incentivo → pagar 16\/11 · R\$\s200,00 \(data calculada pelo prazo\)/);
    expect(text).toMatch(/- Pesquisas: 2 incentivos → pagar 20\/11/);
    expect(text).toMatch(/Total: 3 incentivos · R\$\s600,00$/);
  });
});

describe("CNPJ na tela", () => {
  it("mostra com a máscara, inclusive o alfanumérico", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });
});

describe("detalhes de cada pessoa", () => {
  const base = { situation: "a_vencer" as const, paid: "0", pending: "100.00", payments: [] };
  const payment = (paidOn: string, reversed = false) =>
    ({ kind: "pagamento", paidOn, reversed }) as PayableDetail["payments"][number];

  it("diz a pagar quando não há baixa, e cancelada quando o lançamento foi cancelado", () => {
    expect(itemPaymentLabel(base)).toBe("A pagar");
    expect(itemPaymentLabel({ ...base, situation: "cancelado" })).toBe("Cancelada");
  });

  it("usa a data da última baixa quando o lançamento foi todo pago", () => {
    const paid = {
      ...base,
      situation: "pago" as const,
      paid: "100.00",
      pending: "0",
      payments: [payment("2026-11-03"), payment("2026-11-05"), payment("2026-11-09", true)],
    };
    expect(itemPaymentLabel(paid)).toBe("Paga em 05/11/2026");
  });

  it("avisa que a baixa parcial não diz quem foi pago", () => {
    expect(itemPaymentLabel({ ...base, paid: "40.00", pending: "60.00" })).toBe("Baixa parcial do lançamento");
  });

  it("calcula o INSS pelo bruto e pelo líquido, sem erro de centavos", () => {
    expect(inssAmount("1000.00", "890.00")).toBe("110.00");
    expect(inssAmount("0.30", "0.27")).toBe("0.03");
  });
});

describe("recorrência", () => {
  const simulated = [
    { index: 1, dueDate: "2027-02-01", amount: "150.00" },
    { index: 2, dueDate: "2027-03-01", amount: "150.00" },
    { index: 3, dueDate: "2027-03-31", amount: "150.00" },
  ];

  it("manda só as linhas que a pessoa mexeu na tabela", () => {
    const edited = [
      simulated[0],
      { ...simulated[1], amount: "163.40" },
      { ...simulated[2], dueDate: "2027-04-05" },
    ];
    expect(occurrenceEdits(simulated, edited)).toEqual([
      { index: 2, dueDate: undefined, amount: "163.40" },
      { index: 3, dueDate: "2027-04-05", amount: undefined },
    ]);
  });

  it("não manda nada quando a tabela ficou como o servidor simulou", () => {
    expect(occurrenceEdits(simulated, simulated)).toEqual([]);
  });

  it("trata 150 e 150.00 como o mesmo valor", () => {
    expect(occurrenceEdits(simulated, [{ ...simulated[0], amount: "150" }, simulated[1], simulated[2]])).toEqual([]);
  });

  it("escreve o número da ocorrência na série", () => {
    const base = { id: 1, index: 3, count: 12, kind: "mensal" as const, estimated: false };
    expect(seriesLabel(base)).toBe("3/12");
    expect(seriesLabel({ ...base, estimated: true })).toBe("3/12 · estimada");
  });
});
