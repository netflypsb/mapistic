import { NextRequest, NextResponse } from "next/server";
import { reverseGeocodeMalaysia } from "@dawnistic/geo-my";
import { pdpaSafeCoordLog } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getApprovedCommunityPoisAsPlaceRecords } from "@/lib/store";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  const rl = await checkRateLimit(`rev:${ip}`, 90);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded" },
      { status: 429, headers: { "x-ratelimit-backend": rl.backend } }
    );
  }

  const lat = Number(req.nextUrl.searchParams.get("lat") || 3.1579);
  const lon = Number(req.nextUrl.searchParams.get("lon") || 101.7116);
  // PDPA: log only 3-decimal truncated coordinates (~110m grid)
  const pdpaGrid = pdpaSafeCoordLog(lat, lon);

  try {
    const extraPois = await getApprovedCommunityPoisAsPlaceRecords().catch(() => []);
    const res = await reverseGeocodeMalaysia(lat, lon, extraPois);
    return NextResponse.json(
      {
        ok: true,
        cost_credits: 0,
        pdpa_log_grid: pdpaGrid,
        ...res,
      },
      { headers: { "x-ratelimit-backend": rl.backend } }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, pdpa_log_grid: pdpaGrid, error: err instanceof Error ? err.message : "Reverse geocoding error" },
      { status: 503 }
    );
  }
}
