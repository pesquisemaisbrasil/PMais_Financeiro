import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export type DatabaseState = "available" | "unavailable" | "not_configured";

export type DeploymentStatus = {
  mode: "read_only";
  application: "P+ Financeiro";
  checkedAt: string;
  database: { state: DatabaseState };
  security: {
    signingConfigured: boolean;
    mfaConfigured: boolean;
    accessEnabled: false;
  };
  connect: { validated: false };
  businessDataEnabled: false;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isDatabaseState(value: unknown): value is DatabaseState {
  return value === "available" || value === "unavailable" || value === "not_configured";
}

function parseDeploymentStatus(value: unknown): DeploymentStatus {
  const payload = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(payload)) throw new Error("Status técnico indisponível.");

  const database = isRecord(payload.database) ? payload.database : null;
  const security = isRecord(payload.security) ? payload.security : null;
  const connect = isRecord(payload.connect) ? payload.connect : null;

  if (
    payload.mode !== "read_only" ||
    payload.application !== "P+ Financeiro" ||
    typeof payload.checkedAt !== "string" ||
    Number.isNaN(new Date(payload.checkedAt).getTime()) ||
    !database ||
    !isDatabaseState(database.state) ||
    !security ||
    typeof security.signingConfigured !== "boolean" ||
    typeof security.mfaConfigured !== "boolean" ||
    security.accessEnabled !== false ||
    !connect ||
    connect.validated !== false ||
    payload.businessDataEnabled !== false
  ) {
    throw new Error("Status técnico indisponível.");
  }

  return {
    mode: "read_only",
    application: "P+ Financeiro",
    checkedAt: payload.checkedAt,
    database: { state: database.state },
    security: {
      signingConfigured: security.signingConfigured,
      mfaConfigured: security.mfaConfigured,
      accessEnabled: false,
    },
    connect: { validated: false },
    businessDataEnabled: false,
  };
}

async function fetchDeploymentStatus(signal?: AbortSignal): Promise<DeploymentStatus> {
  const response = await fetch("/api/deployment/status", {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "omit",
    cache: "no-store",
    signal,
  });

  if (!response.ok) throw new Error("Não foi possível consultar o estado técnico.");
  return parseDeploymentStatus(await response.json());
}

export function useDeploymentStatus() {
  return useQuery<DeploymentStatus, Error>({
    queryKey: ["deployment-status"],
    queryFn: ({ signal }) => fetchDeploymentStatus(signal),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

export function formatCheckedAt(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

export function databaseStateLabel(state: DatabaseState) {
  if (state === "available") return "Disponível";
  if (state === "unavailable") return "Indisponível";
  return "Não configurado";
}
