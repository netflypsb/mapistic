import { NextRequest, NextResponse } from "next/server";
import { searchMalaysianPlaces } from "@dawnistic/geo-my";
import { checkRateLimit } from "@/lib/rate-limit";
import { getApprovedCommunityPoisAsPlaceRecords } from "@/lib/store";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  const rl = await checkRateLimit(`search:${ip}`, 90);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded" },
      { status: 429, headers: { "x-ratelimit-backend": rl.backend } }
    );
  }

  const q = req.nextUrl.searchParams.get("q") || "";
  const limit = Number(req.nextUrl.searchParams.get("limit") || 8);
  const communityPois = await getApprovedCommunityPoisAsPlaceRecords().catch(() => []);

  try {
    const data = await searchMalaysianPlaces(q, communityPois, limit);
    return NextResponse.json(
      {
        ok: true,
        cost_credits: 0,
        attribution: "© OpenStreetMap contributors (ODbL) · Overture Maps (CDLA-Permissive-2.0)",
        ...data,
      },
      {
        headers: {
          "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
          "x-ratelimit-backend": rl.backend,
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Geocoding error" },
      { status: 503 }
    );
  }
}
