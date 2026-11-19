import { describe, expect, it } from "vitest";
import { openForLaunch, projectSituation, type Project } from "./payables";

// Cadastro de projeto como na tela antiga (18/11): o projeto inativo some das escolhas de lançamento
// novo, como o encerrado; as contas já lançadas continuam.
const project = (fields: Partial<Project> = {}): Project => ({
  id: 1,
  code: "1804",
  title: "Pesquisa",
  status: "em_andamento",
  projectType: null,
  hasIncentive: false,
  incentiveDays: null,
  ...fields,
});

describe("projeto aberto para lançamento", () => {
  it("aceita o projeto em andamento e ativo, e o que ainda não diz se está ativo", () => {
    expect(openForLaunch(project({ active: true }))).toBe(true);
    expect(openForLaunch(project())).toBe(true);
  });

  it("recusa o inativo e o encerrado", () => {
    expect(openForLaunch(project({ active: false }))).toBe(false);
    expect(openForLaunch(project({ status: "encerrado" }))).toBe(false);
  });

  it("mostra a situação, com o inativo na frente do encerrado", () => {
    expect(projectSituation(project())).toBe("Em andamento");
    expect(projectSituation(project({ status: "encerrado" }))).toBe("Encerrado");
    expect(projectSituation(project({ status: "encerrado", active: false }))).toBe("Inativo");
  });
});
