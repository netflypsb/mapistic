/**
 * Mapistic Auth Contract (Better Auth compatible) (`apps/web/lib/auth.ts`)
 *
 * Implements Items #1, #2, and #19 of the original Mapistic issue list:
 * - ZERO hardcoded demo-user fallback, ZERO second auth provider, ZERO local user table.
 * - `getBetterAuthSessionUser()` reads the platform cookie (`cookies().toString()`) and resolves it
 *   via `getSessionResolver()` (`apps/web/lib/session-resolver.ts`).
 * - `getSessionUser()` returns a typed `DawnisticSessionUser` or immediately redirects to Hub sign-in
 *   (`${HUB_URL}/sign-in`) / throws `UnauthorizedSessionError` on absent or invalid cookie.
 * - `pdpaSafeCoordLog(lat, lon)` truncates coordinates to 3 decimal places (~110m grid) in all server logs.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import type { DawnisticSessionUser } from "@dawnistic/mapistic-db";
import { getSessionResolver } from "./session-resolver";

export function getHubSignInUrl(): string {
  const hubUrl = (process.env.HUB_URL || process.env.NEXT_PUBLIC_HUB_URL || "").replace(
    /\/$/,
    ""
  );
  return `${hubUrl}/sign-in`;
}

export class UnauthorizedSessionError extends Error {
  public readonly redirectUrl: string;
  public readonly statusCode = 401;

  constructor(redirectUrl: string) {
    super(`UNAUTHENTICATED_SESSION: Redirecting to ${redirectUrl}`);
    this.name = "UnauthorizedSessionError";
    this.redirectUrl = redirectUrl;
  }
}

/**
 * Read-side contract: reads the platform cookie header and resolves the user via `SessionResolver`.
 * Returns `null` if the cookie is absent or invalid (never returns a fabricated user).
 */
export async function getBetterAuthSessionUser(
  cookieHeaderOverride?: string | null
): Promise<DawnisticSessionUser | null> {
  let cookieHeader = cookieHeaderOverride;
  if (cookieHeader === undefined) {
    try {
      const cookieStore = await cookies();
      cookieHeader = cookieStore.toString();
    } catch {
      cookieHeader = null;
    }
  }
  return getSessionResolver().resolveFromCookieHeader(cookieHeader ?? null);
}

/**
 * Strict server-side session guard:
 * Returns the authenticated `DawnisticSessionUser`, or redirects to `${HUB_URL}/sign-in`
 * (or throws `UnauthorizedSessionError` when called in API/test contexts where Next.js `redirect()` is trapped).
 */
export async function getSessionUser(cookieHeaderOverride?: string | null): Promise<DawnisticSessionUser> {
  const user = await getBetterAuthSessionUser(cookieHeaderOverride);
  if (!user) {
    const signInUrl = getHubSignInUrl();
    try {
      redirect(signInUrl);
    } catch (err) {
      // Preserve Next.js internal NEXT_REDIRECT error if thrown inside App Router render
      if (err && typeof err === "object" && "digest" in err && String((err as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      throw new UnauthorizedSessionError(signInUrl);
    }
    throw new UnauthorizedSessionError(signInUrl);
  }
  return user;
}

/** Sign internal proxy requests to the routing/geocoder services (HMAC) */
export function signFlyProxyRequest(path: string, body = ""): string {
  const secret = process.env.INTERNAL_PROXY_HMAC_SECRET || "";
  if (!secret) return "unsigned-dev-proxy";
  return crypto.createHmac("sha256", secret).update(`${path}:${body}`).digest("hex");
}

/**
 * Malaysia PDPA Compliance (Item #19):
 * Truncates coordinates to 3 decimal places (~110m grid) for all server logs.
 * Never log full-precision coordinates anywhere.
 */
export function pdpaSafeCoordLog(lat: number, lon: number): string {
  return `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
}
