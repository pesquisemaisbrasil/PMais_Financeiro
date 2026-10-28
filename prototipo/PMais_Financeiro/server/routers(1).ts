import { TRPCError } from "@trpc/server";
import type { User } from "../drizzle/schema";
import { publicProcedure, router } from "./_core/trpc";
import { getDeploymentStatus } from "./services/deployment";

export const UNAVAILABLE_MESSAGE = "Área protegida indisponível. A autenticação, o MFA e as operações financeiras estão adiados nesta etapa.";

function unavailable(): never {
  throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: UNAVAILABLE_MESSAGE });
}

export const appRouter = router({
  deployment: router({ status: publicProcedure.query(() => getDeploymentStatus()) }),
  auth: router({
    me: publicProcedure.query((): User | null => unavailable()),
    login: publicProcedure.mutation(unavailable),
    refresh: publicProcedure.mutation(unavailable),
    logout: publicProcedure.mutation((): { success: true } => unavailable()),
    mfa: publicProcedure.mutation(unavailable),
  }),
  admin: router({
    users: publicProcedure.query(unavailable),
    audit: publicProcedure.query(unavailable),
    createUser: publicProcedure.mutation(unavailable),
    updateUser: publicProcedure.mutation(unavailable),
  }),
  finance: router({
    summary: publicProcedure.query(unavailable),
    list: publicProcedure.query(unavailable),
    create: publicProcedure.mutation(unavailable),
    confirm: publicProcedure.mutation(unavailable),
  }),
});

export type AppRouter = typeof appRouter;
