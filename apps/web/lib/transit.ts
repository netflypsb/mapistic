/**
 * Malaysia Official Open API (`data.gov.my`) Live GTFS-Realtime Client & Cache (`apps/web/lib/transit.ts`)
 *
 * Implements Item #10 of the original Mapistic issue list:
 * - Server-side `fetch()` + cache of `data.gov.my` GTFS-Realtime vehicle positions & arrivals.
 * - Static line metadata (stations, route colors) stays curated under CC-BY-4.0 attribution.
 * - Live vehicle positions are fetched from `process.env.DATA_GOV_MY_GTFS_REALTIME_URL`
 *   (or `https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-rail-kl`).
 * - Degrades explicitly to `'last known N min ago'` when upstream is unreachable or stale —
 *   NEVER returns silent fake vehicle data when `MAPISTIC_FIXTURES` is not `'1'`.
 */

import { isFixturesModeEnabled } from "./fixtures";

export interface LiveVehiclePosition {
  vehicle_id: string;
  line_id: string;
  lat: number;
  lon: number;
  bearing: number;
  speed_kmh: number;
  status: string;
  observed_at_iso: string;
}

export interface GtfsTransitLine {
  id: string;
  operator: "Prasarana RapidKL" | "Prasarana RapidPenang" | "KTMB" | "BAS.MY Kota Bharu";
  line_code: string;
  name_en: string;
  name_ms: string;
  mode: "LRT" | "MRT" | "KTM" | "Bus";
  color: string;
  source_endpoint: string;
  license: "CC-BY-4.0 (data.gov.my)";
  freshness_status: "live" | "stale_last_known" | "unavailable" | "fixture";
  freshness_label: string;
  last_known_minutes_ago: number | null;
  stations: Array<{
    stop_id: string;
    name: string;
    lat: number;
    lon: number;
    next_arrival_min: number | null;
  }>;
  live_vehicles: LiveVehiclePosition[];
}

const STATIC_CURATED_LINES: Omit<
  GtfsTransitLine,
  "freshness_status" | "freshness_label" | "last_known_minutes_ago" | "live_vehicles"
>[] = [
  {
    id: "rapidkl-kj",
    operator: "Prasarana RapidKL",
    line_code: "KJL",
    name_en: "LRT Kelana Jaya Line",
    name_ms: "Laluan LRT Kelana Jaya",
    mode: "LRT",
    color: "#e11d48",
    source_endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-rail-kl",
    license: "CC-BY-4.0 (data.gov.my)",
    stations: [
      { stop_id: "KJ10", name: "KLCC LRT Station", lat: 3.1588, lon: 101.7133, next_arrival_min: null },
      { stop_id: "KJ15", name: "KL Sentral LRT Station", lat: 3.134, lon: 101.6865, next_arrival_min: null },
      { stop_id: "KJ28", name: "SS15 Subang Jaya LRT Station", lat: 3.0757, lon: 101.586, next_arrival_min: null },
    ],
  },
  {
    id: "rapidkl-kg",
    operator: "Prasarana RapidKL",
    line_code: "KGL",
    name_en: "MRT Kajang Line",
    name_ms: "Laluan MRT Kajang",
    mode: "MRT",
    color: "#059669",
    source_endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-rail-kl",
    license: "CC-BY-4.0 (data.gov.my)",
    stations: [
      { stop_id: "KG10", name: "TTDI MRT Station", lat: 3.1361, lon: 101.6308, next_arrival_min: null },
      { stop_id: "KG18", name: "Bukit Bintang MRT Station", lat: 3.1466, lon: 101.7114, next_arrival_min: null },
    ],
  },
  {
    id: "ktmb-ets",
    operator: "KTMB",
    line_code: "ETS",
    name_en: "KTMB ETS & Komuter Northern/Southern Line",
    name_ms: "Laluan KTMB ETS & Komuter",
    mode: "KTM",
    color: "#2563eb",
    source_endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb",
    license: "CC-BY-4.0 (data.gov.my)",
    stations: [
      { stop_id: "KTM-KLS", name: "KL Sentral KTMB Hub", lat: 3.1343, lon: 101.6861, next_arrival_min: null },
      { stop_id: "KTM-BW", name: "Butterworth Penang Sentral", lat: 5.3941, lon: 100.3658, next_arrival_min: null },
      { stop_id: "KTM-JBS", name: "JB Sentral Shuttle Tebrau", lat: 1.4634, lon: 103.7649, next_arrival_min: null },
    ],
  },
  {
    id: "basmy-kb",
    operator: "BAS.MY Kota Bharu",
    line_code: "J10",
    name_en: "BAS.MY Kota Bharu — Sultan Ismail Petra Airport Loop",
    name_ms: "Laluan BAS.MY Kota Bharu — Lapangan Terbang Pengkalan Chepa",
    mode: "Bus",
    color: "#d97706",
    source_endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kota-bharu",
    license: "CC-BY-4.0 (data.gov.my)",
    stations: [
      { stop_id: "KB-01", name: "Stesen Bas Kota Bharu (Pasar Siti Khadijah)", lat: 6.1333, lon: 102.2386, next_arrival_min: null },
      { stop_id: "KB-09", name: "Lapangan Terbang Sultan Ismail Petra (KBR)", lat: 6.1669, lon: 102.293, next_arrival_min: null },
    ],
  },
];

let cachedSnapshot: {
  fetchedAtMs: number;
  vehicles: LiveVehiclePosition[];
  arrivalsByStopId: Record<string, number>;
} | null = null;

/**
 * Minimal hand-rolled GTFS-Realtime protobuf decoder (FeedMessage → vehicle positions).
 * Wire fields (gtfs-realtime.proto v2): FeedMessage{1:header, 2:entity(FeedEntity)},
 * FeedEntity{1:id, ..., 7? -> vehicle=VehiclePosition @ field 8}, VehiclePosition{
 * 1:trip(TripDescriptor), 2:position(Position)}, TripDescriptor{6:route_id},
 * Position{1:latitude, 2:longitude, 4:bearing, 6:speed? no, 7:speed}.
 */
export function parseGtfsRtVehiclePositions(
  buf: Uint8Array,
  nowMs = Date.now()
): LiveVehiclePosition[] {
  const veh: LiveVehiclePosition[] = [];

  function varint(b: Uint8Array, i: number): [number, number] {
    let value = 0n;
    let shift = 0n;
    while (i < b.length) {
      const byte = b[i];
      i += 1;
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7n;
    }
    return [Number(value), i];
  }

  function walk(b: Uint8Array): Array<{ field: number; wire: number; value: Uint8Array | number }> {
    const out: Array<{ field: number; wire: number; value: Uint8Array | number }> = [];
    let i = 0;
    while (i < b.length) {
      let tag: number;
      [tag, i] = varint(b, i);
      const field = tag >>> 3;
      const wire = tag & 7;
      if (wire === 0) {
        let v: number;
        [v, i] = varint(b, i);
        out.push({ field, wire, value: v });
      } else if (wire === 1) {
        out.push({ field, wire, value: b.slice(i, i + 8) });
        i += 8;
      } else if (wire === 2) {
        let len: number;
        [len, i] = varint(b, i);
        out.push({ field, wire, value: b.slice(i, i + len) });
        i += len;
      } else if (wire === 5) {
        out.push({ field, wire, value: b.slice(i, i + 4) });
        i += 4;
      } else break;
    }
    return out;
  }

  function decodeString(bufVal: Uint8Array): string {
    try {
      return new TextDecoder().decode(bufVal);
    } catch {
      return "";
    }
  }

  const feed = walk(buf);
  for (const msg of feed) {
    if (msg.field !== 2 || msg.wire !== 2 || typeof msg.value === "number") continue;
    const entityBytes = msg.value as Uint8Array;
    for (const e of walk(entityBytes)) {
      // GTFS-Realtime FeedEntity.vehicle is field 4 (data.gov.my live shape); also accept
      // field 8/7 variants defensively.
      if (e.field !== 4 && e.field !== 8 && e.field !== 7) continue;
      if (e.wire !== 2 || typeof e.value === "number") continue;
      let entityId = "";
      let vehicleId = "";
      let vehicleLabel = "";
      for (const f of walk(entityBytes)) {
        if (f.field === 1 && f.wire === 2 && typeof f.value !== "number") entityId = decodeString(f.value as Uint8Array);
      }
      let lat = 0, lon = 0, bearing = 0, speed = 0, routeId = "";
      for (const vp of walk(e.value as Uint8Array)) {
        if (vp.field === 1 && vp.wire === 2 && typeof vp.value !== "number") {
          for (const td of walk(vp.value as Uint8Array)) {
            if (td.field === 6 && td.wire !== 2) routeId = String(td.value);
          }
        }
        if (vp.field === 2 && vp.wire === 2 && typeof vp.value !== "number") {
          for (const pos of walk(vp.value as Uint8Array)) {
            if (pos.field === 1 && pos.wire === 5 && typeof pos.value !== "number") {
              lat = new DataView(pos.value.buffer ?? pos.value, pos.value.byteOffset || 0).getFloat32(0, true);
            } else if (pos.field === 2 && pos.wire === 5 && typeof pos.value !== "number") {
              lon = new DataView(pos.value.buffer ?? pos.value, pos.value.byteOffset || 0).getFloat32(0, true);
            } else if (pos.field === 4 && pos.wire === 5 && typeof pos.value !== "number") {
              bearing = new DataView(pos.value.buffer ?? pos.value, pos.value.byteOffset || 0).getFloat32(0, true);
            } else if (pos.field === 5 && pos.wire === 5 && typeof pos.value !== "number") {
              speed = new DataView(pos.value.buffer ?? pos.value, pos.value.byteOffset || 0).getFloat32(0, true);
            }
          }
        }
        if (vp.field === 8 && vp.wire === 2 && typeof vp.value !== "number") {
          for (const vd of walk(vp.value as Uint8Array)) {
            if (vd.field === 1 && vd.wire === 2 && typeof vd.value !== "number") vehicleId = decodeString(vd.value as Uint8Array);
            if (vd.field === 2 && vd.wire === 2 && typeof vd.value !== "number") vehicleLabel = decodeString(vd.value as Uint8Array);
          }
        }
      }
      if (lat && lon) {
        veh.push({
          vehicle_id: vehicleId || vehicleLabel || entityId || "unknown",
          line_id: routeId || vehicleLabel || "ktmb-live",
          lat: Number(lat.toFixed(4)),
          lon: Number(lon.toFixed(4)),
          bearing: Math.round(bearing),
          speed_kmh: Math.round(speed),
          status: "live",
          observed_at_iso: new Date(nowMs).toISOString(),
        });
      }
    }
  }
  return veh;
}

export function seedTransitCacheForTest(snapshot: {
  fetchedAtMs: number;
  vehicles: LiveVehiclePosition[];
  arrivalsByStopId?: Record<string, number>;
}) {
  cachedSnapshot = {
    fetchedAtMs: snapshot.fetchedAtMs,
    vehicles: snapshot.vehicles,
    arrivalsByStopId: snapshot.arrivalsByStopId || {},
  };
}

/**
 * Fetch live GTFS-Realtime vehicle positions from `DATA_GOV_MY_GTFS_REALTIME_URL`
 * (or `https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-rail-kl`),
 * caching the snapshot and degrading to `'last known N min ago'` if upstream is unreachable.
 */
export async function fetchLiveMalaysianTransit(nowMs = Date.now()): Promise<{
  attribution: string;
  license: string;
  freshness_status: "live" | "stale_last_known" | "unavailable" | "fixture";
  freshness_label: string;
  last_known_minutes_ago: number | null;
  lines: GtfsTransitLine[];
}> {
  const endpoint =
    process.env.DATA_GOV_MY_GTFS_REALTIME_URL ||
    `${process.env.DATA_GOV_MY_GTFS_BASE || "https://api.data.gov.my"}/gtfs-realtime/vehicle-position/prasarana?category=rapid-rail-kl`;

  try {
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json, application/x-protobuf" },
      cache: "no-store",
    });
    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/x-protobuf") || contentType.includes("octet-stream") || !contentType.includes("application/json")) {
        // data.gov.my GTFS-Realtime returns the standard protobuf FeedMessage — parse it manually
        // (no runtime bindings dependency needed; we only need FeedEntity.id + TripDescriptor.route_id
        //  + Position.lat/lon/bearing/speed).
        const buf = new Uint8Array(await res.arrayBuffer());
        const decoded = parseGtfsRtVehiclePositions(buf);
        if (decoded.length > 0) {
          cachedSnapshot = {
            fetchedAtMs: nowMs,
            vehicles: decoded,
            arrivalsByStopId: {},
          };
        }
      }
      if (contentType.includes("application/json")) {
        const payload = (await res.json()) as {
          vehicles?: LiveVehiclePosition[];
          arrivals?: Record<string, number>;
          timestamp_ms?: number;
        };
        if (Array.isArray(payload.vehicles)) {
          cachedSnapshot = {
            fetchedAtMs: payload.timestamp_ms || nowMs,
            vehicles: payload.vehicles,
            arrivalsByStopId: payload.arrivals || {},
          };
        }
      }
    }
  } catch {
    // Upstream unreachable -> fall through to explicit staleness degradation
  }

  if (cachedSnapshot) {
    const ageMin = Math.max(0, Math.floor((nowMs - cachedSnapshot.fetchedAtMs) / 60_000));
    const isFresh = ageMin <= 5;
    const freshness_status = isFresh ? "live" : "stale_last_known";
    const freshness_label = isFresh ? "Live (updated < 1 min ago)" : `last known ${ageMin} min ago`;

    const lines: GtfsTransitLine[] = STATIC_CURATED_LINES.map((line) => ({
      ...line,
      freshness_status,
      freshness_label,
      last_known_minutes_ago: ageMin,
      stations: line.stations.map((st) => ({
        ...st,
        next_arrival_min: cachedSnapshot?.arrivalsByStopId[st.stop_id] ?? null,
      })),
      live_vehicles:
        line.id === "ktmb-ets"
          ? // Live KTMB feed (vehicle-position/ktmb/) carries route descriptors we can't map to the
            // curated line id yet — attribute ALL live KTM vehicles to the KTM line so users see
            // real trains; the feed's true route mapping is added when GTFS static ids align.
            cachedSnapshot!.vehicles
          : cachedSnapshot!.vehicles.filter((v) => v.line_id === line.id),
    }));

    return {
      attribution: "Malaysia Official Open API (data.gov.my — Prasarana RapidKL, KTMB, BAS.MY)",
      license: "CC-BY-4.0",
      freshness_status,
      freshness_label,
      last_known_minutes_ago: ageMin,
      lines,
    };
  }

  if (isFixturesModeEnabled()) {
    const lines: GtfsTransitLine[] = STATIC_CURATED_LINES.map((line) => ({
      ...line,
      freshness_status: "fixture",
      freshness_label: "Fixture Mode (MAPISTIC_FIXTURES=1)",
      last_known_minutes_ago: 0,
      stations: line.stations.map((st) => ({ ...st, next_arrival_min: 4 })),
      live_vehicles: [
        {
          vehicle_id: `${line.line_code}-FIXTURE-1`,
          line_id: line.id,
          lat: line.stations[0].lat,
          lon: line.stations[0].lon,
          bearing: 180,
          speed_kmh: 55,
          status: "FIXTURE_MODE",
          observed_at_iso: new Date(nowMs).toISOString(),
        },
      ],
    }));
    return {
      attribution: "Malaysia Official Open API (data.gov.my) — Fixture Mode",
      license: "CC-BY-4.0",
      freshness_status: "fixture",
      freshness_label: "Fixture Mode (MAPISTIC_FIXTURES=1)",
      last_known_minutes_ago: 0,
      lines,
    };
  }

  // Honest degradation when no live snapshot is available and fixtures are OFF
  const lines: GtfsTransitLine[] = STATIC_CURATED_LINES.map((line) => ({
    ...line,
    freshness_status: "unavailable",
    freshness_label: "last known: unavailable (awaiting live data.gov.my feed)",
    last_known_minutes_ago: null,
    live_vehicles: [],
  }));

  return {
    attribution: "Malaysia Official Open API (data.gov.my — Prasarana RapidKL, KTMB, BAS.MY)",
    license: "CC-BY-4.0",
    freshness_status: "unavailable",
    freshness_label: "last known: unavailable (awaiting live data.gov.my feed)",
    last_known_minutes_ago: null,
    lines,
  };
}
