/**
 * `@dawnistic/geo-my` — Real Valhalla & Photon HTTP Client + Malaysian Geospatial Utilities
 * (`packages/geo-my/index.ts`)
 *
 * Implements Items #6 & #8 of the original Mapistic issue list:
 * - `computeMalaysianRoute` is an async HTTP client over `process.env.VALHALLA_INTERNAL_URL`:
 *   1. Runs the landmass `CROSS_SEA_DISCONNECT` pre-check (`detectMalaysianLandmass`).
 *   2. Calls `POST ${process.env.VALHALLA_INTERNAL_URL}/route` with Valhalla's costing JSON (`auto`, `motorcycle`, `bicycle`, `pedestrian`) and `costing_options`.
 *   3. Decodes Valhalla's precision-6 encoded polyline (`trip.legs[].shape`) into real multi-point `[lon, lat]` geometry and maps Valhalla `maneuvers` into turn-by-turn steps.
 *   4. Falls back to offline fixture math ONLY when `process.env.MAPISTIC_FIXTURES === "1"`.
 * - `searchMalaysianPlaces` & `reverseGeocodeMalaysia` query `process.env.PHOTON_INTERNAL_URL` (`/api` and `/reverse`),
 *   running `normalizeMalaysianQuery` first and falling back to `FIXTURE_MALAYSIAN_GAZETTEER` ONLY when `process.env.MAPISTIC_FIXTURES === "1"`.
 * - Retains `exportApprovedEditsToOsmOsc` for upstream OpenStreetMap `.osc` v0.6 XML exports.
 */

import { FIXTURE_MALAYSIAN_GAZETTEER } from "./fixtures";

export type LandmassRegion =
  | "PENINSULAR_MY_SG"
  | "BORNEO_MY_BN"
  | "LANGKAWI_ISLAND"
  | "LABUAN_ISLAND";

export interface PlaceRecord {
  id: string;
  osm_id: string;
  source_table: "osm_overture_public_pois" | "mapistic_community_pois";
  license: "ODbL-1.0" | "CDLA-Permissive-2.0" | "CC0-1.0";
  name: string;
  name_ms: string;
  name_en: string;
  name_zh?: string;
  name_ta?: string;
  category:
    | "landmark"
    | "airport"
    | "transit_station"
    | "hospital"
    | "university"
    | "food_court"
    | "border_crossing"
    | "rural_settlement"
    | "worship";
  address: string;
  postcode: string;
  district: string;
  state: string;
  country: "MY" | "SG" | "BN";
  lat: number;
  lon: number;
  landmass: LandmassRegion;
}

const BM_ABBREVIATION_MAP: Array<[RegExp, string]> = [
  [/\bjln\.?\b/gi, "jalan"],
  [/\blrg\.?\b/gi, "lorong"],
  [/\btmn\.?\b/gi, "taman"],
  [/\bpsn\.?\b/gi, "persiaran"],
  [/\bkg\.?\b/gi, "kampung"],
  [/\bkpg\.?\b/gi, "kampung"],
  [/\bbdr\.?\b/gi, "bandar"],
  [/\blbh\.?\b/gi, "lebuh"],
  [/\blbhr\.?\b/gi, "lebuhraya"],
  [/\bbt\.?\b/gi, "batu"],
  [/\bsg\.?\b/gi, "sungai"],
  [/\bbkt\.?\b/gi, "bukit"],
  [/\btg\.?\b/gi, "tanjung"],
  [/\bp\.?\s*pinang\b/gi, "pulau pinang"],
  [/\bjb\b/gi, "johor bahru"],
  [/\bkk\b/gi, "kota kinabalu"],
  [/\bkb\b/gi, "kota bharu"],
  [/\bkl\b/gi, "kuala lumpur"],
];

export function normalizeMalaysianQuery(rawQuery: string): {
  original: string;
  normalized: string;
  extractedPostcode: string | null;
  tokens: string[];
} {
  let text = (rawQuery || "").trim();
  const postcodeMatch = text.match(/\b(\d{5,6})\b/);
  const extractedPostcode = postcodeMatch ? postcodeMatch[1] : null;

  for (const [pattern, replacement] of BM_ABBREVIATION_MAP) {
    text = text.replace(pattern, replacement);
  }

  const normalized = text
    .toLowerCase()
    .replace(/[,.;/\\()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized.split(" ").filter(Boolean);
  return {
    original: rawQuery,
    normalized,
    extractedPostcode,
    tokens,
  };
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100;
}

export function detectMalaysianLandmass(lat: number, lon: number): LandmassRegion {
  if (lat >= 6.25 && lat <= 6.5 && lon >= 99.6 && lon <= 99.95) {
    return "LANGKAWI_ISLAND";
  }
  if (lat >= 5.2 && lat <= 5.4 && lon >= 115.15 && lon <= 115.35) {
    return "LABUAN_ISLAND";
  }
  if (lon >= 109.0) {
    return "BORNEO_MY_BN";
  }
  return "PENINSULAR_MY_SG";
}

/**
 * Encode/Decode Valhalla Precision-6 Polyline (`1e-6` coordinate scaling).
 */
export function encodeValhallaPolyline6(coordsLonLat: Array<[number, number]>): string {
  let lastLat = 0;
  let lastLon = 0;
  let result = "";

  const encodeSignedNumber = (num: number) => {
    let sgnNum = num << 1;
    if (num < 0) sgnNum = ~sgnNum;
    let out = "";
    while (sgnNum >= 0x20) {
      out += String.fromCharCode((0x20 | (sgnNum & 0x1f)) + 63);
      sgnNum >>= 5;
    }
    out += String.fromCharCode(sgnNum + 63);
    return out;
  };

  for (const [lon, lat] of coordsLonLat) {
    const ilat = Math.round(lat * 1e6);
    const ilon = Math.round(lon * 1e6);
    result += encodeSignedNumber(ilat - lastLat);
    result += encodeSignedNumber(ilon - lastLon);
    lastLat = ilat;
    lastLon = ilon;
  }
  return result;
}

export function decodeValhallaPolyline6(encoded: string): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let b = 0;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlon = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lon += dlon;

    coords.push([Number((lon / 1e6).toFixed(6)), Number((lat / 1e6).toFixed(6))]);
  }
  return coords;
}

interface PhotonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    osm_id?: number | string;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    "name:ms"?: string;
    "name:en"?: string;
    "name:zh"?: string;
    "name:ta"?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    state?: string;
    countrycode?: string;
  };
}

function mapPhotonFeatureToPlaceRecord(f: PhotonFeature, idx: number): PlaceRecord {
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties || {};
  const osmType = p.osm_type === "W" ? "way" : p.osm_type === "R" ? "relation" : "node";
  const osmId = `${osmType}/${p.osm_id || idx + 1}`;
  const name = p.name || p["name:ms"] || p["name:en"] || p.street || "Point of Interest";
  const streetPart = [p.housenumber, p.street, p.district || p.city].filter(Boolean).join(", ");
  const countryCode = (p.countrycode || "MY").toUpperCase();
  const country: "MY" | "SG" | "BN" =
    countryCode === "SG" ? "SG" : countryCode === "BN" ? "BN" : "MY";

  return {
    id: `photon-${p.osm_id || idx + 1}`,
    osm_id: osmId,
    source_table: "osm_overture_public_pois",
    license: "ODbL-1.0",
    name,
    name_ms: p["name:ms"] || name,
    name_en: p["name:en"] || name,
    name_zh: p["name:zh"],
    name_ta: p["name:ta"],
    category: p.osm_value === "aerodrome" ? "airport" : p.osm_value === "station" ? "transit_station" : "landmark",
    address: streetPart || name,
    postcode: p.postcode || "",
    district: p.district || p.city || "",
    state: p.state || "",
    country,
    lat,
    lon,
    landmass: detectMalaysianLandmass(lat, lon),
  };
}

/**
 * Geocode against `process.env.PHOTON_INTERNAL_URL` (`/api?q=...`).
 * Falls back to `FIXTURE_MALAYSIAN_GAZETTEER` ONLY when `process.env.MAPISTIC_FIXTURES === "1"`.
 */
export async function searchMalaysianPlaces(
  query: string,
  extraCommunityPois: PlaceRecord[] = [],
  limit = 8
): Promise<{
  query_normalized: string;
  extracted_postcode: string | null;
  geocoder_source: "mymap_http" | "photon_http" | "fixtures_fallback";
  results: Array<PlaceRecord & { score: number }>;
}> {
  const norm = normalizeMalaysianQuery(query);
  const photonBase = process.env.PHOTON_INTERNAL_URL?.trim()?.replace(/\/$/, "");
  const fixturesMode = process.env.MAPISTIC_FIXTURES === "1";
  const mymapBase = process.env.MYMAP_API_URL?.trim()?.replace(/\/$/, "");
  const mymapKey = process.env.MYMAP_API_KEY?.trim();

  if (mymapBase && mymapKey) {
    // MYmap is the primary data provider (Dawnistic Malaysia POI corpus, FSQ/Overture-derived).
    const res = await fetch(`${mymapBase}/api/v1/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${mymapKey}`,
        cache: "no-store",
      },
      body: JSON.stringify({ q: norm.normalized || query, limit }),
    });
    const mymapBody = (await res.json()) as {
      ok: boolean;
      results?: Array<{ id: string; name: string; lat: number; lon: number; address?: string; postcode?: string; locality?: string; region?: string; tel?: string; website?: string; category?: string; source?: string }>;
      remaining_trial_credits?: number;
      wallet_balance?: number;
    };
    if (!mymapBody.ok) {
      const retryInfo = mymapBody.remaining_trial_credits === 0 ? "" : "";
      throw new Error(`MYmap API HTTP ${res.status}${retryInfo}`);
    }
    const catMap: Record<string, PlaceRecord["category"]> = {
      restaurant: "food_court", dining: "food_court", food: "food_court", cafe: "food_court",
      hospital: "hospital", medical: "hospital", health: "hospital",
      airport: "airport", "public transit": "transit_station", transit: "transit_station",
      "transport stations": "transit_station",
      university: "university", college: "university", education: "university", school: "university",
    };
    const mymapPlaces: Array<PlaceRecord & { score: number }> = (mymapBody.results || []).map((p, i) => {
      const catKey = (p.category || "").split(">")[0].trim().toLowerCase();
      const category = catMap[catKey] || "landmark";
      return {
        id: p.id,
        osm_id: p.id.replace(/^fsq-/, ""),
        source_table: "osm_overture_public_pois" as const,
        license: "CDLA-Permissive-2.0" as const,
        name: p.name,
        name_ms: "",
        name_en: p.name,
        category,
        address: p.address || p.locality || "",
        postcode: p.postcode || "",
        district: p.locality || "",
        state: p.region || "",
        country: "MY" as const,
        lat: p.lat,
        lon: p.lon,
        landmass: detectMalaysianLandmass(p.lat, p.lon),
        score: 100 - i * 5,
      };
    });
    return {
      query_normalized: norm.normalized,
      extracted_postcode: norm.extractedPostcode,
      geocoder_source: "mymap_http",
      results: mymapPlaces.slice(0, limit),
    };
  }

  if (photonBase) {
    const url = `${photonBase}/api?q=${encodeURIComponent(norm.normalized || query)}&limit=${limit}&lang=en`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Photon HTTP ${res.status} from ${photonBase}/api`);
    }
    const geojson = (await res.json()) as { features?: PhotonFeature[] };
    const photonPlaces = (geojson.features || []).map((f, i) => ({
      ...mapPhotonFeatureToPlaceRecord(f, i),
      score: 100 - i * 5,
    }));
    const communityMatches = extraCommunityPois
      .filter((c) =>
        normalizeMalaysianQuery(`${c.name} ${c.name_ms} ${c.postcode} ${c.state}`).normalized.includes(
          norm.normalized
        )
      )
      .map((c) => ({ ...c, score: 95 }));

    return {
      query_normalized: norm.normalized,
      extracted_postcode: norm.extractedPostcode,
      geocoder_source: "photon_http",
      results: [...communityMatches, ...photonPlaces].slice(0, limit),
    };
  }

  if (!fixturesMode) {
    throw new Error(
      "MAPISTIC_GEOCODER_CONFIG_ERROR: process.env.PHOTON_INTERNAL_URL is not configured and MAPISTIC_FIXTURES is not '1'."
    );
  }

  const pool = [...extraCommunityPois, ...FIXTURE_MALAYSIAN_GAZETTEER];
  const scored = pool
    .map((place) => {
      const hay = normalizeMalaysianQuery(
        `${place.name} ${place.name_ms} ${place.name_en} ${place.address} ${place.postcode} ${place.state}`
      ).normalized;
      let score = 0;
      if (norm.extractedPostcode && place.postcode === norm.extractedPostcode) score += 60;
      if (hay.includes(norm.normalized)) score += 50;
      for (const tok of norm.tokens) {
        if (hay.includes(tok)) score += 15;
      }
      return { ...place, score: score || 1 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    query_normalized: norm.normalized,
    extracted_postcode: norm.extractedPostcode,
    geocoder_source: "fixtures_fallback",
    results: scored,
  };
}

/**
 * Reverse geocode against `process.env.PHOTON_INTERNAL_URL/reverse?lat=...&lon=...`.
 */
export async function reverseGeocodeMalaysia(
  lat: number,
  lon: number,
  extraCommunityPois: PlaceRecord[] = []
) {
  const photonBase = process.env.PHOTON_INTERNAL_URL?.trim()?.replace(/\/$/, "");
  const fixturesMode = process.env.MAPISTIC_FIXTURES === "1";

  if (photonBase) {
    const url = `${photonBase}/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(
      String(lon)
    )}&lang=en`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Photon reverse HTTP ${res.status} from ${photonBase}/reverse`);
    }
    const geojson = (await res.json()) as { features?: PhotonFeature[] };
    const topFeature = geojson.features?.[0];
    if (!topFeature) {
      throw new Error(`Photon returned 0 reverse-geocode features for (${lat.toFixed(3)}, ${lon.toFixed(3)})`);
    }
    const place = mapPhotonFeatureToPlaceRecord(topFeature, 0);
    return {
      lat,
      lon,
      distance_km: haversineKm(lat, lon, place.lat, place.lon),
      landmass: detectMalaysianLandmass(lat, lon),
      geocoder_source: "photon_http" as const,
      place,
      formatted_address: `${place.name_ms} (${place.address}, ${place.postcode} ${place.district}, ${place.state})`,
      attribution: "© OpenStreetMap contributors (ODbL)",
    };
  }

  if (!fixturesMode) {
    throw new Error(
      "MAPISTIC_GEOCODER_CONFIG_ERROR: process.env.PHOTON_INTERNAL_URL is not configured and MAPISTIC_FIXTURES is not '1'."
    );
  }

  const pool = [...extraCommunityPois, ...FIXTURE_MALAYSIAN_GAZETTEER];
  let best = pool[0];
  let minKm = Infinity;
  for (const p of pool) {
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < minKm) {
      minKm = d;
      best = p;
    }
  }
  return {
    lat,
    lon,
    distance_km: minKm,
    landmass: detectMalaysianLandmass(lat, lon),
    geocoder_source: "fixtures_fallback" as const,
    place: best,
    formatted_address: `${best.name_ms} (${best.address}, ${best.postcode} ${best.district}, ${best.state})`,
    attribution: "© OpenStreetMap contributors (ODbL)",
  };
}

export type TravelMode = "car" | "motorcycle" | "bicycle" | "walking";

export interface RouteStep {
  instruction_en: string;
  instruction_ms: string;
  road_name: string;
  distance_km: number;
  duration_min: number;
  is_toll?: boolean;
  is_motorcycle_lane?: boolean;
  is_unpaved_advisory?: boolean;
}

export interface ComputedRouteResult {
  ok: boolean;
  status: "ROUTABLE" | "CROSS_SEA_DISCONNECT";
  routing_engine: "valhalla_http" | "cross_sea_precheck" | "fixtures_fallback";
  mode: TravelMode;
  avoid_toll: boolean;
  from: { lat: number; lon: number; label: string; landmass: LandmassRegion };
  to: { lat: number; lon: number; label: string; landmass: LandmassRegion };
  distance_km: number;
  duration_min: number;
  estimated_toll_myr: number;
  has_rural_unpaved_advisory: boolean;
  advisory_banner: string | null;
  geometry_coords: Array<[number, number]>;
  steps: RouteStep[];
  alternatives: Array<{
    summary: string;
    distance_km: number;
    duration_min: number;
    estimated_toll_myr: number;
  }>;
}

interface ValhallaManeuver {
  instruction: string;
  street_names?: string[];
  length: number;
  time: number;
  toll?: boolean;
  rough?: boolean;
}

interface ValhallaTripResponse {
  trip: {
    summary: {
      length: number;
      time: number;
      has_toll?: boolean;
      has_highway?: boolean;
    };
    legs: Array<{
      shape: string;
      maneuvers: ValhallaManeuver[];
    }>;
  };
  alternates?: Array<{
    trip: {
      summary: {
        length: number;
        time: number;
        has_toll?: boolean;
      };
    };
  }>;
}

/**
 * Compute a route by calling `POST ${process.env.VALHALLA_INTERNAL_URL}/route`.
 * Keeps the `CROSS_SEA_DISCONNECT` landmass pre-check first.
 * Falls back to offline fixture math ONLY when `process.env.MAPISTIC_FIXTURES === "1"`.
 */
export async function computeMalaysianRoute(input: {
  fromLat: number;
  fromLon: number;
  fromLabel?: string;
  toLat: number;
  toLon: number;
  toLabel?: string;
  mode?: TravelMode;
  avoidToll?: boolean;
}): Promise<ComputedRouteResult> {
  const mode: TravelMode = input.mode || "car";
  const avoidToll = Boolean(input.avoidToll);
  const fromLandmass = detectMalaysianLandmass(input.fromLat, input.fromLon);
  const toLandmass = detectMalaysianLandmass(input.toLat, input.toLon);
  const straightKm = haversineKm(input.fromLat, input.fromLon, input.toLat, input.toLon);

  const fromObj = {
    lat: input.fromLat,
    lon: input.fromLon,
    label: input.fromLabel || `${input.fromLat.toFixed(3)}, ${input.fromLon.toFixed(3)}`,
    landmass: fromLandmass,
  };
  const toObj = {
    lat: input.toLat,
    lon: input.toLon,
    label: input.toLabel || `${input.toLat.toFixed(3)}, ${input.toLon.toFixed(3)}`,
    landmass: toLandmass,
  };

  // 1. Pre-check Peninsular <-> Borneo / Island Cross-Sea Disconnect
  if (fromLandmass !== toLandmass) {
    return {
      ok: false,
      status: "CROSS_SEA_DISCONNECT",
      routing_engine: "cross_sea_precheck",
      mode,
      avoid_toll: avoidToll,
      from: fromObj,
      to: toObj,
      distance_km: straightKm,
      duration_min: 0,
      estimated_toll_myr: 0,
      has_rural_unpaved_advisory: false,
      advisory_banner: `Separated by maritime barrier (${fromLandmass} ↔ ${toLandmass}, ${straightKm} km across the South China Sea / Malacca Strait). Direct road routing is unavailable — please use an air corridor (KUL ↔ BKI / KCH) or passenger ferry.`,
      geometry_coords: [
        [input.fromLon, input.fromLat],
        [input.toLon, input.toLat],
      ],
      steps: [],
      alternatives: [],
    };
  }

  // 2. Call Real Valhalla HTTP API (`process.env.VALHALLA_INTERNAL_URL/route`)
  const valhallaBase = process.env.VALHALLA_INTERNAL_URL?.trim()?.replace(/\/$/, "");
  const fixturesMode = process.env.MAPISTIC_FIXTURES === "1";

  if (valhallaBase) {
    const valhallaCosting =
      mode === "car"
        ? "auto"
        : mode === "motorcycle"
        ? "motorcycle"
        : mode === "bicycle"
        ? "bicycle"
        : "pedestrian";

    const valhallaReqBody = {
      locations: [
        { lat: input.fromLat, lon: input.fromLon },
        { lat: input.toLat, lon: input.toLon },
      ],
      costing: valhallaCosting,
      costing_options: {
        [valhallaCosting]: {
          use_tolls: avoidToll ? 0.0 : 1.0,
          use_highways: mode === "motorcycle" ? 0.9 : 1.0,
        },
      },
      alternates: 2,
      directions_options: {
        units: "kilometers",
        language: "en-US",
      },
    };

    const res = await fetch(`${valhallaBase}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(valhallaReqBody),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Valhalla HTTP ${res.status} from ${valhallaBase}/route`);
    }

    const data = (await res.json()) as ValhallaTripResponse;
    const leg = data.trip.legs[0];
    const decodedCoords = decodeValhallaPolyline6(leg.shape);
    const distance_km = Math.round(data.trip.summary.length * 10) / 10;
    const duration_min = Math.max(1, Math.round(data.trip.summary.time / 60));
    const hasToll = Boolean(data.trip.summary.has_toll) && !avoidToll && mode === "car";
    const estimated_toll_myr = hasToll ? Math.round(distance_km * 0.115 * 100) / 100 : 0;

    const steps: RouteStep[] = (leg.maneuvers || []).map((m) => {
      const road = m.street_names?.join(" / ") || "Local Road";
      const unpaved = Boolean(m.rough) || /AH150|FT22|Telupid|Pan Borneo/i.test(road);
      const bikeLane = mode === "motorcycle" && /FT2|Persekutuan|Federal/i.test(road);
      return {
        instruction_en: m.instruction,
        instruction_ms: m.instruction
          .replace(/^Drive /i, "Pandu ")
          .replace(/^Continue on /i, "Teruskan di ")
          .replace(/^Turn right onto /i, "Belok kanan ke ")
          .replace(/^Turn left onto /i, "Belok kiri ke ")
          .replace(/^Arrive at /i, "Tiba di "),
        road_name: road,
        distance_km: Math.round(m.length * 10) / 10,
        duration_min: Math.max(1, Math.round(m.time / 60)),
        is_toll: Boolean(m.toll),
        is_motorcycle_lane: bikeLane,
        is_unpaved_advisory: unpaved,
      };
    });

    const has_rural_unpaved_advisory =
      steps.some((s) => s.is_unpaved_advisory) || (fromLandmass === "BORNEO_MY_BN" && distance_km > 80);

    const alternatives = (data.alternates || []).map((alt, idx) => {
      const altKm = Math.round(alt.trip.summary.length * 10) / 10;
      const altMin = Math.max(1, Math.round(alt.trip.summary.time / 60));
      const altToll = alt.trip.summary.has_toll && mode === "car" ? Math.round(altKm * 0.115 * 100) / 100 : 0;
      return {
        summary: `Valhalla Alternative #${idx + 1} (${alt.trip.summary.has_toll ? "Toll Expressway" : "Toll-Free Federal Route"})`,
        distance_km: altKm,
        duration_min: altMin,
        estimated_toll_myr: altToll,
      };
    });

    return {
      ok: true,
      status: "ROUTABLE",
      routing_engine: "valhalla_http",
      mode,
      avoid_toll: avoidToll,
      from: fromObj,
      to: toObj,
      distance_km,
      duration_min,
      estimated_toll_myr,
      has_rural_unpaved_advisory,
      advisory_banner: has_rural_unpaved_advisory
        ? "⚠️ Sabah / Sarawak Interior Advisory: Valhalla flagged unpaved/rough segments along FT22 / Pan-Borneo Highway."
        : mode === "motorcycle"
        ? "🏍️ Valhalla Motorcycle Costing Active: Prioritizing dedicated motorcycle lanes (Lorong Motosikal) with RM 0.00 highway toll."
        : null,
      geometry_coords: decodedCoords,
      steps,
      alternatives,
    };
  }

  if (!fixturesMode) {
    throw new Error(
      "MAPISTIC_ROUTING_CONFIG_ERROR: process.env.VALHALLA_INTERNAL_URL is not configured and MAPISTIC_FIXTURES is not '1'."
    );
  }

  // 3. Offline Fixture Fallback (ONLY active when MAPISTIC_FIXTURES=1)
  const distance_km = Math.max(1.2, Math.round(straightKm * 1.28 * 10) / 10);
  const duration_min = Math.max(3, Math.round((distance_km / 75) * 60));
  return {
    ok: true,
    status: "ROUTABLE",
    routing_engine: "fixtures_fallback",
    mode,
    avoid_toll: avoidToll,
    from: fromObj,
    to: toObj,
    distance_km,
    duration_min,
    estimated_toll_myr: avoidToll || mode === "motorcycle" ? 0 : Math.round(distance_km * 0.11 * 100) / 100,
    has_rural_unpaved_advisory: fromLandmass === "BORNEO_MY_BN" && distance_km > 80,
    advisory_banner: "Offline Fixture Route Active (MAPISTIC_FIXTURES=1)",
    geometry_coords: [
      [input.fromLon, input.fromLat],
      [(input.fromLon + input.toLon) / 2, (input.fromLat + input.toLat) / 2],
      [input.toLon, input.toLat],
    ],
    steps: [
      {
        instruction_en: `Depart ${fromObj.label} toward ${toObj.label}`,
        instruction_ms: `Bertolak dari ${fromObj.label} ke ${toObj.label}`,
        road_name: "Fixture Route",
        distance_km,
        duration_min,
      },
    ],
    alternatives: [],
  };
}

/**
 * Export approved community POI / road fixes as a standard OpenStreetMap OSMChange (`.osc` v0.6) XML file.
 */
export function exportApprovedEditsToOsmOsc(
  edits: Array<{
    id: number;
    name_ms: string;
    name_en: string;
    category: string;
    lat: number;
    lon: number;
    postcode?: string | null;
  }>
): string {
  const nodesXml = edits
    .map(
      (e, idx) => `    <node id="-${idx + 1}" version="1" lat="${Number(e.lat).toFixed(6)}" lon="${Number(
        e.lon
      ).toFixed(6)}">
      <tag k="name" v="${e.name_ms.replace(/"/g, "&quot;")}"/>
      <tag k="name:ms" v="${e.name_ms.replace(/"/g, "&quot;")}"/>
      <tag k="name:en" v="${e.name_en.replace(/"/g, "&quot;")}"/>
      <tag k="amenity" v="${e.category}"/>
      ${e.postcode ? `<tag k="addr:postcode" v="${e.postcode}"/>` : ""}
      <tag k="source" v="Mapistic community survey (CC0/ODbL waiver)"/>
    </node>`
    )
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<osmChange version="0.6" generator="Mapistic (community OSM export)">`,
    `  <create>`,
    nodesXml,
    `  </create>`,
    `</osmChange>`,
  ].join("\n");
}

export { FIXTURE_MALAYSIAN_GAZETTEER as MALAYSIAN_GAZETTEER };
