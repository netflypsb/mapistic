/**
 * Mapistic Model Context Protocol (MCP) Server Tools (`apps/web/lib/mcp-tools.ts`)
 */

import {
  computeMalaysianRoute,
  haversineKm,
  reverseGeocodeMalaysia,
  searchMalaysianPlaces,
  type TravelMode,
} from "@dawnistic/geo-my";
import { getApprovedCommunityPoisAsPlaceRecords } from "./store";
import { fetchLiveMalaysianTransit } from "./transit";

export const MCP_TOOL_DEFINITIONS = [
  {
    name: "geocode",
    description:
      "Search places and addresses across Malaysia, Singapore, and Brunei via Photon HTTP geocoder with Bahasa Malaysia abbreviation normalization (Jln, Tmn, Lrg, Psn, Kg, postcodes).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Place name, street address, or 5-digit postcode" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "reverse_geocode",
    description:
      "Convert latitude and longitude into the nearest Malaysian/Singaporean/Bruneian street address, postcode, district, state, and landmass via Photon.",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number" },
        lon: { type: "number" },
      },
      required: ["lat", "lon"],
    },
  },
  {
    name: "route",
    description:
      "Calculate turn-by-turn directions, multi-point polyline geometry, distance, ETA, and toll estimates via Valhalla HTTP routing engine.",
    inputSchema: {
      type: "object",
      properties: {
        from_lat: { type: "number" },
        from_lon: { type: "number" },
        from_label: { type: "string" },
        to_lat: { type: "number" },
        to_lon: { type: "number" },
        to_label: { type: "string" },
        mode: { type: "string", enum: ["car", "motorcycle", "bicycle", "walking"] },
        avoid_toll: { type: "boolean" },
      },
      required: ["from_lat", "from_lon", "to_lat", "to_lon"],
    },
  },
  {
    name: "search_nearby",
    description: "Find nearby POIs around a coordinate within a radius in kilometres.",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number" },
        lon: { type: "number" },
        radius_km: { type: "number", description: "Search radius in km (default 25)" },
      },
      required: ["lat", "lon"],
    },
  },
  {
    name: "get_place",
    description: "Fetch multilingual metadata and ODbL source provenance for a place query or ID.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_transit_arrivals",
    description:
      "Fetch live Malaysian public transport GTFS-Realtime vehicle positions and arrivals from data.gov.my (CC-BY-4.0).",
    inputSchema: {
      type: "object",
      properties: {
        operator_filter: { type: "string" },
      },
    },
  },
];

export async function executeMapisticMcpTool(
  toolName: string,
  args: Record<string, unknown>
) {
  const extraPois = await getApprovedCommunityPoisAsPlaceRecords().catch(() => []);

  switch (toolName) {
    case "geocode": {
      const res = await searchMalaysianPlaces(
        String(args.query || ""),
        extraPois,
        typeof args.limit === "number" ? args.limit : 5
      );
      return { ok: true, cost_credits: 0, ...res };
    }

    case "reverse_geocode": {
      const rev = await reverseGeocodeMalaysia(
        Number(args.lat || 3.1579),
        Number(args.lon || 101.7116),
        extraPois
      );
      return { ok: true, cost_credits: 0, ...rev };
    }

    case "route": {
      const routed = await computeMalaysianRoute({
        fromLat: Number(args.from_lat),
        fromLon: Number(args.from_lon),
        fromLabel: typeof args.from_label === "string" ? args.from_label : undefined,
        toLat: Number(args.to_lat),
        toLon: Number(args.to_lon),
        toLabel: typeof args.to_label === "string" ? args.to_label : undefined,
        mode: (args.mode as TravelMode) || "car",
        avoidToll: Boolean(args.avoid_toll),
      });
      return { cost_credits: 0, ...routed };
    }

    case "search_nearby": {
      const lat = Number(args.lat || 3.1579);
      const lon = Number(args.lon || 101.7116);
      const radiusKm = Number(args.radius_km || 25);
      const rev = await reverseGeocodeMalaysia(lat, lon, extraPois);
      return {
        ok: true,
        cost_credits: 0,
        nearby: [{ ...rev.place, distance_km: haversineKm(lat, lon, rev.place.lat, rev.place.lon) }].filter(
          (p) => p.distance_km <= radiusKm
        ),
      };
    }

    case "get_place": {
      const found = await searchMalaysianPlaces(String(args.query || "KLCC"), extraPois, 1);
      return { ok: true, cost_credits: 0, place: found.results[0] || null };
    }

    case "get_transit_arrivals": {
      const transit = await fetchLiveMalaysianTransit();
      return { ok: true, cost_credits: 0, ...transit };
    }

    default:
      throw new Error(`Unknown Mapistic MCP tool: ${toolName}`);
  }
}
