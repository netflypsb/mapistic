/**
 * Mapistic Read-Side Session Resolution Contract (`apps/web/lib/session-resolver.ts`)
 *
 * Implements Item #2 of the original Mapistic issue list:
 * - Defines the `SessionResolver` interface so a deployer can point it at any Better Auth identity service
 *   session resolution endpoint or internal RPC in a single file without touching any route or page.
 * - Default implementation (`HubGetSessionResolver`) calls `${HUB_URL}/api/auth/get-session`
 *   forwarding the incoming `Cookie` header (matching `linkistic/web/lib/session.ts`).
 */

import type { DawnisticSessionUser } from "@dawnistic/mapistic-db";

export interface SessionResolver {
  resolveFromCookieHeader(cookieHeader: string | null): Promise<DawnisticSessionUser | null>;
}

export class HubGetSessionResolver implements SessionResolver {
  async resolveFromCookieHeader(cookieHeader: string | null): Promise<DawnisticSessionUser | null> {
    if (!cookieHeader || !cookieHeader.trim()) {
      return null;
    }

    const hubUrl = (process.env.HUB_URL || process.env.NEXT_PUBLIC_HUB_URL || "").replace(
      /\/$/,
      ""
    );
    const endpoint = process.env.DAWNISTIC_SESSION_ENDPOINT || `${hubUrl}/api/auth/get-session`;

    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          Cookie: cookieHeader,
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { user?: DawnisticSessionUser | null };
      if (!data?.user?.id || !data?.user?.email) {
        return null;
      }
      return {
        id: String(data.user.id),
        email: String(data.user.email),
        name: data.user.name ?? null,
      };
    } catch {
      return null;
    }
  }
}

let activeResolver: SessionResolver = new HubGetSessionResolver();

export function getSessionResolver(): SessionResolver {
  return activeResolver;
}

export function setSessionResolver(resolver: SessionResolver): void {
  activeResolver = resolver;
}
