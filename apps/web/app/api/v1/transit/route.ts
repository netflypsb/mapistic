import { NextResponse } from "next/server";
import { fetchLiveMalaysianTransit } from "@/lib/transit";

export async function GET() {
  const transit = await fetchLiveMalaysianTransit();
  return NextResponse.json({
    ok: true,
    cost_credits: 0,
    ...transit,
  });
}
