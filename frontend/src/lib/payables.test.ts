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
  cleanCnpj,
  looksLikeCnpj,
  percentOf,
  seriesLabel,
  allocationDiff,
  buildAllocations,
  parseAllocations,
  parsePastedAllocations,
  parseMoney,
  periodLabel,
  toCents,
  type Project,
  filterOptions,
  replacedMessage,
  replacesNote,
  scheduleText,
  schedulesText,
  formatCnpj,
  inssAmount,
  itemPaymentLabel,
  type PayableDetail,
  formatCompetence,
  formatDateTime,
  paymentExtras,
  shareText,
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

describe("divisão entre projetos nos campos da tela", () => {
  it("aceita código e valor separados por espaço, tabulação ou ponto e vírgula", () => {
    const expected = [
      { projectId: "1", amount: "600,00" },
      { projectId: "2", amount: "400,00" },
    ];
    for (const text of ["1804;600,00\n1790;400,00", "1804 600,00\n1790 400,00", "1804\t600,00\nPRJ-1790\t400,00", " 1804   600,00 \r\n1790 400,00\r\n"]) {
      expect(parsePastedAllocations(text, PROJECTS)).toEqual({ rows: expected, error: null });
    }
  });

  it("cola sem conferir a soma, que fica para a tela", () => {
    expect(parsePastedAllocations("1804 1,00", PROJECTS).error).toBeNull();
    expect(parsePastedAllocations("1804 R$ 10", PROJECTS).error).toBe("Linha 1: use só números no valor");
    expect(parsePastedAllocations("1804", PROJECTS).error).toBe("Linha 1: use só números no valor");
    expect(parsePastedAllocations("1804 1,00\n9999 1,00", PROJECTS).error).toBe("Projeto 9999 não encontrado (linha 2)");
  });

  it("confere as linhas: projeto escolhido, valor em números, sem repetir e somando o lançamento", () => {
    expect(buildAllocations([], "10.00")).toEqual({ allocations: [], error: null });
    expect(buildAllocations([{ projectId: "", amount: "" }], "10.00")).toEqual({ allocations: [], error: null });
    expect(buildAllocations([{ projectId: "1", amount: "6,00" }, { projectId: "2", amount: "4,00" }], "10.00")).toEqual({
      allocations: [
        { projectId: 1, amount: "6.00" },
        { projectId: 2, amount: "4.00" },
      ],
      error: null,
    });
    expect(buildAllocations([{ projectId: "", amount: "5,00" }], "10.00").error).toBe("Linha 1: escolha o projeto");
    expect(buildAllocations([{ projectId: "1", amount: "R$ 5" }], "10.00").error).toBe("Linha 1: use só números no valor");
    expect(buildAllocations([{ projectId: "1", amount: "0,00" }], "10.00").error).toBe("Linha 1: use só números no valor");
    expect(
      buildAllocations([{ projectId: "1", amount: "5,00" }, { projectId: "1", amount: "5,00" }], "10.00").error
    ).toBe("O mesmo projeto aparece mais de uma vez no rateio");
    expect(buildAllocations([{ projectId: "1", amount: "9,90" }], "10.00").error).toMatch(/somam R\$\s9,90.*R\$\s10,00/);
  });

  it("a linha vazia no meio não muda o número das outras", () => {
    const rows = [
      { projectId: "1", amount: "5,00" },
      { projectId: "", amount: "" },
      { projectId: "", amount: "5,00" },
    ];
    expect(buildAllocations(rows, "10.00").error).toBe("Linha 3: escolha o projeto");
  });

  it("diz quanto falta ou passou para fechar com o valor, sem erro de arredondamento", () => {
    const rows = [
      { projectId: "1", amount: "0,10" },
      { projectId: "2", amount: "0,20" },
    ];
    expect(allocationDiff(rows, "0.30")).toEqual({ total: 30, diff: 0 });
    expect(allocationDiff(rows, "1000.00")).toEqual({ total: 30, diff: 99970 });
    expect(allocationDiff(rows, "0.20")).toEqual({ total: 30, diff: -10 });
    expect(allocationDiff(rows, "")).toBeNull();
    expect(allocationDiff([{ projectId: "1", amount: "abc" }], "1.00")).toEqual({ total: 0, diff: 100 });
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
  const health = {
    id: 1,
    code: "1804",
    title: "Pesquisa",
    projectType: "Health",
    deadlineDays: 10,
    missingDeadline: false,
    count: 3,
    total: "600.00",
  };
  const given = {
    id: 2,
    code: "1790",
    title: "Outra",
    projectType: null,
    deadlineDays: null,
    missingDeadline: false,
    count: 1,
    total: "50.00",
  };
  const group = { projectId: 1, projectCode: "1804", projectTitle: "Pesquisa", classification: "PPlus · Consumo SP" };
  const preview = {
    kind: "incentivos" as const,
    columns: ["projeto", "empresa"],
    hasProjectColumn: true,
    hasClassificationColumns: true,
    projects: [health, given],
    missingDeadline: false,
    alreadyImported: false,
    total: "650.00",
    goodCount: 4,
    errorCount: 0,
    skippedCount: 0,
    payableCount: 3,
    lines: [],
    groups: [
      { ...group, payDate: "2026-11-16", surveyDates: ["2026-10-30"], count: 1, total: "200.00", source: "calculada pelo prazo" },
      { ...group, payDate: "2026-11-20", surveyDates: [], count: 2, total: "400.00", source: "informada na planilha" },
      { projectId: 2, projectCode: "1790", projectTitle: "Outra", classification: "MC · Consumo SP", payDate: "2026-11-09", surveyDates: [], count: 1, total: "50.00", source: "informada na planilha" },
    ],
  };

  it("lista cada data, com o prazo e o total", () => {
    const text = scheduleText(preview, health);
    expect(text).toContain("PRJ-1804 Pesquisa");
    expect(text).toContain("Prazo: 10 dias úteis depois da data da pesquisa (Health)");
    expect(text).toMatch(/- Pesquisas de 30\/10: 1 incentivo → pagar 16\/11 · R\$\s200,00 \(data calculada pelo prazo\)/);
    expect(text).toMatch(/- Pesquisas: 2 incentivos → pagar 20\/11/);
    // a classificação aparece quando a planilha a trouxe em coluna
    expect(text).toContain("(data calculada pelo prazo) · PPlus · Consumo SP");
    expect(text).toMatch(/Total: 3 incentivos · R\$\s600,00$/);
    // as datas de outro projeto da mesma planilha não entram
    expect(text).not.toContain("pagar 09/11");
  });

  it("um cronograma por projeto quando a planilha traz vários", () => {
    const text = schedulesText(preview);
    expect(text).toContain("PRJ-1804 Pesquisa");
    expect(text).toContain("PRJ-1790 Outra");
    expect(text).toContain("Datas de pagamento informadas na planilha.");
    expect(text.split("Cronograma de pagamento dos incentivos")).toHaveLength(3);
    expect(text).toMatch(/- Pesquisas: 1 incentivo → pagar 09\/11/);
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

  it("a pessoa paga pelo comprovante mostra o próprio dia, mesmo em baixa parcial", () => {
    const partial = { ...base, paid: "40.00", pending: "60.00" };
    expect(itemPaymentLabel(partial, { paidOn: "2026-02-03" })).toBe("Paga em 03/02/2026");
    expect(itemPaymentLabel(partial, { paidOn: null })).toBe("Baixa parcial do lançamento");
    expect(itemPaymentLabel({ ...partial, situation: "cancelado" }, { paidOn: "2026-02-03" })).toBe("Cancelada");
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

describe("detalhes da conta", () => {
  const payment = (kind: "pagamento" | "estorno", reversed: boolean, surcharge: string, discount: string) =>
    ({ kind, reversed, surcharge, discount }) as PayableDetail["payments"][number];

  it("mostra a competência como mês/ano, ou traço sem ela", () => {
    expect(formatCompetence("2026-11")).toBe("11/2026");
    expect(formatCompetence(null)).toBe("—");
  });

  it("mostra data e hora no horário de São Paulo", () => {
    expect(formatDateTime("2026-11-06T12:45:28Z")).toBe("06/11/2026 09:45:28");
  });

  it("calcula a parte de cada projeto", () => {
    expect(shareText("600.00", "1000.00")).toBe("60,00%");
    expect(shareText("52.50", "52.50")).toBe("100,00%");
    expect(shareText("1.00", "3.00")).toBe("33,33%");
    expect(shareText("0.00", "0.00")).toBe("0,00%");
  });

  it("soma juros e desconto só das baixas que valem, sem somar com ponto flutuante", () => {
    expect(
      paymentExtras([
        payment("pagamento", false, "10.20", "0.00"),
        payment("pagamento", false, "0.10", "5.05"),
        payment("pagamento", true, "99.00", "99.00"), // estornada: não conta
        payment("estorno", false, "50.00", "50.00"), // estorno em si: não conta
      ])
    ).toEqual({ surcharge: "10.30", discount: "5.05" });
  });

  it("sem baixa, não há juros nem desconto", () => {
    expect(paymentExtras([])).toEqual({ surcharge: "0.00", discount: "0.00" });
  });
});

describe("barra de quanto já foi pago", () => {
  it("é a parte sobre o total, arredondada para o inteiro mais próximo", () => {
    expect(percentOf("400.00", "1000.00")).toBe(40);
    expect(percentOf("333.33", "1000.00")).toBe(33);
    expect(percentOf("666.67", "1000.00")).toBe(67);
  });

  it("vai de 0 a 100 e nunca passa disso, mesmo com juros pagos a mais", () => {
    expect(percentOf("0.00", "1000.00")).toBe(0);
    expect(percentOf("1000.00", "1000.00")).toBe(100);
    expect(percentOf("1050.00", "1000.00")).toBe(100);
  });

  it("sem valor a pagar não há barra (evita dividir por zero)", () => {
    expect(percentOf("0.00", "0.00")).toBe(0);
    expect(percentOf("10.00", "0.00")).toBe(0);
  });
});

describe("CNPJ digitado", () => {
  it("tira a pontuação e põe em maiúsculas", () => {
    expect(cleanCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(cleanCnpj(" 12.abc.345/01de-35 ")).toBe("12ABC34501DE35");
  });

  it("só vale a consulta quando a forma é a de um CNPJ completo (os dígitos, o servidor confere)", () => {
    expect(looksLikeCnpj("11.222.333/0001-81")).toBe(true);
    expect(looksLikeCnpj("11222333000182")).toBe(true); // forma certa, dígito errado: o servidor recusa
    expect(looksLikeCnpj("12.ABC.345/01DE-35")).toBe(true); // CNPJ com letras
    expect(looksLikeCnpj("11.222.333/0001")).toBe(false);
    expect(looksLikeCnpj("123.456.789-09")).toBe(false); // CPF
    expect(looksLikeCnpj("11222333000181 9")).toBe(false);
    expect(looksLikeCnpj("")).toBe(false);
  });
});
