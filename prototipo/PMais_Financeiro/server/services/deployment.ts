import mysql, { type Pool } from "mysql2/promise";

export type DatabaseState = "available" | "unavailable" | "not_configured";
export type DeploymentStatus = {
  mode: "read_only";
  application: "P+ Financeiro";
  checkedAt: string;
  database: { state: DatabaseState };
  security: { signingConfigured: boolean; mfaConfigured: boolean; accessEnabled: false };
  connect: { validated: false };
  businessDataEnabled: false;
};

let pool: Pool | undefined;
let lastDatabaseCheck: { state: DatabaseState; checkedAt: number } | undefined;
let inFlight: Promise<DatabaseState> | undefined;

/** No schema reads, writes, migrations or personal data are involved in this probe. */
async function checkDatabase(): Promise<DatabaseState> {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) return "not_configured";
  const now = Date.now();
  if (lastDatabaseCheck && now - lastDatabaseCheck.checkedAt < 10_000) {
    return lastDatabaseCheck.state;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      pool ??= mysql.createPool({ uri: dsn, connectionLimit: 2, connectTimeout: 4_000 });
      await pool.query({ sql: "SELECT 1", timeout: 4_000 });
      lastDatabaseCheck = { state: "available", checkedAt: Date.now() };
    } catch {
      // Never emit DSN, driver error, SQL parameters or credentials in public output/logs.
      lastDatabaseCheck = { state: "unavailable", checkedAt: Date.now() };
    }
    return lastDatabaseCheck.state;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = undefined;
  }
}

/** Pure builder useful for isolated tests; booleans do not grant access. */
export function buildDeploymentStatus(
  env: Record<string, string | undefined>,
  database: DatabaseState,
  checkedAt = new Date().toISOString(),
): DeploymentStatus {
  return {
    mode: "read_only",
    application: "P+ Financeiro",
    checkedAt,
    database: { state: database },
    security: {
      signingConfigured: Boolean(env.PMAIS_SESSION_SIGNING_SECRET),
      mfaConfigured: Boolean(env.PMAIS_MFA_ENCRYPTION_KEY),
      accessEnabled: false,
    },
    connect: { validated: false },
    businessDataEnabled: false,
  };
}

export async function getDeploymentStatus(): Promise<DeploymentStatus> {
  return buildDeploymentStatus(process.env, await checkDatabase());
}

export async function closeDeploymentPool(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
  lastDatabaseCheck = undefined;
}
