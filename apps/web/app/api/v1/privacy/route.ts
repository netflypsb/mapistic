import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPdpaPrivacyExport, purgePdpaUserHistory } from "@/lib/store";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req.headers.get("cookie"));
  const data = await getPdpaPrivacyExport(user.id);
  return NextResponse.json({ ok: true, ...data });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req.headers.get("cookie"));
  const purged = await purgePdpaUserHistory(user.id);
  return NextResponse.json(purged);
}
