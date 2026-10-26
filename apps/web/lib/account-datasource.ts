/**
 * Account Button Cross-Origin Data Source Contract (`apps/web/lib/account-datasource.ts`)
 *
 * Implements Item #14 of the original Mapistic issue list:
 * - Keeps the account button's data source behind a clean interface (`AccountButtonDataSource`)
 *   that reads the configured Better Auth identity service `get-session` endpoint cross-origin (`credentials: "include"`).
 * - operator wires the final URL/headers in this single file.
 */

import type { DawnisticSessionUser } from "@dawnistic/mapistic-db";

export interface AccountSessionSnapshot {
  user: DawnisticSessionUser | null;
  hubSignInUrl: string;
  hubAccountUrl: string;
  dashboardPath: string;
}

export interface AccountButtonDataSource {
  getSessionSnapshot(): Promise<AccountSessionSnapshot>;
}

export class HubCrossOriginAccountDataSource implements AccountButtonDataSource {
  private readonly hubUrl: string;

  constructor(hubUrl?: string) {
    this.hubUrl = (hubUrl || process.env.NEXT_PUBLIC_HUB_URL || "").replace(/\/$/, "");
  }

  async getSessionSnapshot(): Promise<AccountSessionSnapshot> {
    const hubSignInUrl = `${this.hubUrl}/sign-in`;
    const hubAccountUrl = `${this.hubUrl}/account`;
    const dashboardPath = "/dashboard";

    try {
      const res = await fetch(`${this.hubUrl}/api/auth/get-session`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        return { user: null, hubSignInUrl, hubAccountUrl, dashboardPath };
      }
      const data = (await res.json()) as { user?: DawnisticSessionUser | null };
      return {
        user: data?.user?.id ? data.user : null,
        hubSignInUrl,
        hubAccountUrl,
        dashboardPath,
      };
    } catch {
      return { user: null, hubSignInUrl, hubAccountUrl, dashboardPath };
    }
  }
}

export const defaultAccountDataSource: AccountButtonDataSource = new HubCrossOriginAccountDataSource();
