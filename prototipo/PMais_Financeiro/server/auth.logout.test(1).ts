import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createContext, type TrpcContext } from "./_core/context";

function context(user: TrpcContext["user"] = null): TrpcContext {
  return { user, req: { headers: { cookie: "webdev_app_session=test-fixture" } } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

const pretendAdmin: NonNullable<TrpcContext["user"]> = {
  id: 1, openId: "test-fixture", email: "fixture@example.invalid", name: "Fixture",
  loginMethod: "manus", role: "admin", createdAt: new Date(0), updatedAt: new Date(0), lastSignedIn: new Date(0),
};

describe("adiamento seguro das áreas protegidas", () => {
  it("o contexto não resolve nem concede identidade pelo cookie do starter", async () => {
    const ctx = await createContext({ req: context().req, res: context().res } as never);
    expect(ctx.user).toBeNull();
  });
  for (const [title, operation] of [
    ["consulta de identidade", (caller: ReturnType<typeof appRouter.createCaller>) => caller.auth.me()],
    ["logout", (caller: ReturnType<typeof appRouter.createCaller>) => caller.auth.logout()],
    ["login", (caller: ReturnType<typeof appRouter.createCaller>) => caller.auth.login()],
    ["MFA", (caller: ReturnType<typeof appRouter.createCaller>) => caller.auth.mfa()],
    ["refresh", (caller: ReturnType<typeof appRouter.createCaller>) => caller.auth.refresh()],
    ["usuários", (caller: ReturnType<typeof appRouter.createCaller>) => caller.admin.users()],
    ["auditoria", (caller: ReturnType<typeof appRouter.createCaller>) => caller.admin.audit()],
    ["criação de usuário", (caller: ReturnType<typeof appRouter.createCaller>) => caller.admin.createUser()],
    ["alteração de usuário", (caller: ReturnType<typeof appRouter.createCaller>) => caller.admin.updateUser()],
    ["resumo financeiro", (caller: ReturnType<typeof appRouter.createCaller>) => caller.finance.summary()],
    ["lista financeira", (caller: ReturnType<typeof appRouter.createCaller>) => caller.finance.list()],
    ["lançamento", (caller: ReturnType<typeof appRouter.createCaller>) => caller.finance.create()],
    ["confirmação de baixa", (caller: ReturnType<typeof appRouter.createCaller>) => caller.finance.confirm()],
  ] as const) {
    it(`recusa ${title} mesmo com contexto de admin fornecido`, async () => {
      await expect(operation(appRouter.createCaller(context(pretendAdmin)))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    });
  }
});
