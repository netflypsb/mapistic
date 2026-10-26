import { NextRequest, NextResponse } from "next/server";
import { getBetterAuthSessionUser, getSessionUser, pdpaSafeCoordLog } from "@/lib/auth";
import {
  addSavedPlace,
  generateUpstreamOsmOscXml,
  getRegionalDataQualityMetrics,
  listCommunityEdits,
  listCustomLists,
  listSavedPlaces,
  moderateCommunityEdit,
  submitCommunityEdit,
} from "@/lib/store";

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format");
  if (format === "osc") {
    const xml = await generateUpstreamOsmOscXml();
    return new NextResponse(xml, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": 'attachment; filename="mapistic-approved-edits.osc"',
      },
    });
  }

  const user = await getBetterAuthSessionUser(req.headers.get("cookie"));
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHENTICATED: Valid Dawnistic platform session cookie required." },
      { status: 401 }
    );
  }

  const [saved_places, custom_lists, community_edits] = await Promise.all([
    listSavedPlaces(user.id),
    listCustomLists(user.id),
    listCommunityEdits(),
  ]);

  return NextResponse.json({
    ok: true,
    sso_user: user,
    saved_places,
    custom_lists,
    community_edits,
    data_quality: getRegionalDataQualityMetrics(),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers.get("cookie"));
  const body = (await req.json().catch(() => ({}))) as {
    action?: "save_place" | "submit_edit" | "moderate_edit";
    label?: string;
    place_name?: string;
    address?: string;
    postcode?: string;
    state?: string;
    lat?: number;
    lon?: number;
    edit_type?: "new_poi" | "correction" | "road_closure" | "flood_alert" | "speed_limit";
    name_ms?: string;
    name_en?: string;
    category?: string;
    notes?: string;
    edit_id?: number;
    moderation_status?: "approved" | "rejected" | "exported_to_osm";
  };

  if (body.action === "save_place") {
    const lat = Number(body.lat || 3.1579);
    const lon = Number(body.lon || 101.7116);
    const saved = await addSavedPlace(user.id, {
      label: body.label || "Favourite",
      place_name: body.place_name || "Pinned Location",
      address: body.address || "Malaysia",
      postcode: body.postcode || "50088",
      state: body.state || "Kuala Lumpur",
      lat,
      lon,
    });
    return NextResponse.json({
      ok: true,
      pdpa_log_grid: pdpaSafeCoordLog(lat, lon),
      saved,
    });
  }

  if (body.action === "moderate_edit" && typeof body.edit_id === "number") {
    const updated = await moderateCommunityEdit(body.edit_id, body.moderation_status || "approved");
    return NextResponse.json({ ok: true, edit: updated });
  }

  const lat = Number(body.lat || 6.1333);
  const lon = Number(body.lon || 102.2386);
  const submitted = await submitCommunityEdit({
    submitted_by: user.email,
    edit_type: body.edit_type || "new_poi",
    name_ms: body.name_ms || "Kedai Kopi Tempatan",
    name_en: body.name_en || body.name_ms || "Local Coffee Shop",
    category: body.category || "cafe",
    notes: body.notes || "Submitted via Mapistic Community Survey",
    postcode: body.postcode || "15000",
    state: body.state || "Kelantan",
    lat,
    lon,
  });

  return NextResponse.json({
    ok: true,
    pdpa_log_grid: pdpaSafeCoordLog(lat, lon),
    edit: submitted,
  });
}
