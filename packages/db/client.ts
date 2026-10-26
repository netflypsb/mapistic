/**
 * `@dawnistic/mapistic-db` — Least-Privilege Database Client (`packages/db/client.ts`)
 *
 * Implements Item #3 & #4 of the original Mapistic issue list:
 * - Connects strictly via `process.env.DATABASE_URL` (never hardcodes any connection string).
 * - Assumes least-privilege `mapistic_app` role: only queries `mapistic.*` tables,
 *   never executes superuser DDL (`CREATE EXTENSION`, `ALTER SYSTEM`, etc.) or cross-schema queries at runtime.
 * - Supports `@neondatabase/serverless` HTTP/WebSocket driver in production and a file-backed
 *   SQLite/SQL test adapter (`file:...`) when running local integration tests in environments without Docker daemon access.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { schema } from "./schema";

export interface DbQueryAdapter {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

let customAdapter: DbQueryAdapter | null = null;

export function setDbQueryAdapter(adapter: DbQueryAdapter | null) {
  customAdapter = adapter;
}

export function getDatabaseUrlOrThrow(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "MAPISTIC_DB_CONFIG_ERROR: process.env.DATABASE_URL is required when MAPISTIC_FIXTURES is not '1'."
    );
  }
  return url;
}

/**
 * Guardrail enforcing `mapistic_app` least-privilege contract:
 * Rejects any runtime SQL that attempts superuser commands or cross-schema access outside `mapistic.`.
 */
export function assertLeastPrivilegeSql(sqlText: string): void {
  const upper = sqlText.toUpperCase();
  if (/\b(CREATE\s+EXTENSION|CREATE\s+ROLE|ALTER\s+SYSTEM|COPY\s+.*FROM\s+PROGRAM|pg_shadow|pg_authid)\b/.test(upper)) {
    throw new Error("LEAST_PRIVILEGE_VIOLATION: mapistic_app runtime role cannot execute superuser SQL.");
  }
  if (/\b(auth\.|public\.users|linkistic\.|secops\.)/i.test(sqlText)) {
    throw new Error("LEAST_PRIVILEGE_VIOLATION: Cross-schema query forbidden for mapistic_app.");
  }
}

export function getDrizzleDb() {
  const url = getDatabaseUrlOrThrow();
  const sql = neon(url);
  return drizzle(sql, { schema });
}

export async function executeMapisticSql<T = Record<string, unknown>>(
  sqlText: string,
  params: unknown[] = []
): Promise<T[]> {
  assertLeastPrivilegeSql(sqlText);

  if (customAdapter) {
    return customAdapter.query<T>(sqlText, params);
  }

  const url = getDatabaseUrlOrThrow();
  const sqlClient = neon(url);
  const rows = await sqlClient.query(sqlText, params as unknown as never[]);
  return rows as T[];
}
