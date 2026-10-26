import { NextRequest, NextResponse } from "next/server";
import { computeMalaysianRoute, type TravelMode } from "@dawnistic/geo-my";
import { pdpaSafeCoordLog, signFlyProxyRequest } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  const rl = await checkRateLimit(`route:${ip}`, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded" },
      { status: 429, headers: { "x-ratelimit-backend": rl.backend } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    fromLat?: number;
    fromLon?: number;
    fromLabel?: string;
    toLat?: number;
    toLon?: number;
    toLabel?: string;
    mode?: TravelMode;
    avoidToll?: boolean;
  };

  if (
    typeof body.fromLat !== "number" ||
    typeof body.fromLon !== "number" ||
    typeof body.toLat !== "number" ||
    typeof body.toLon !== "number"
  ) {
    return NextResponse.json(
      { ok: false, error: "fromLat, fromLon, toLat, and toLon are required numbers." },
      { status: 400 }
    );
  }

  // PDPA: log only 3-decimal truncated coordinates
  const pdpaOriginGrid = pdpaSafeCoordLog(body.fromLat, body.fromLon);
  const pdpaDestGrid = pdpaSafeCoordLog(body.toLat, body.toLon);

  try {
    const routeResult = await computeMalaysianRoute({
      fromLat: body.fromLat,
      fromLon: body.fromLon,
      fromLabel: body.fromLabel,
      toLat: body.toLat,
      toLon: body.toLon,
      toLabel: body.toLabel,
      mode: body.mode || "car",
      avoidToll: Boolean(body.avoidToll),
    });

    return NextResponse.json(
      {
        ...routeResult,
        cost_credits: 0,
        pdpa_log_grid: `${pdpaOriginGrid}->${pdpaDestGrid}`,
        internal_proxy_signature: signFlyProxyRequest("/route").slice(0, 16),
        safety_disclaimer:
          "Advisory planning route only — always obey physical JKR/LLM road signs, flood warnings, and traffic rules.",
      },
      { headers: { "x-ratelimit-backend": rl.backend } }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Valhalla routing error" },
      { status: 503 }
    );
  }
}
