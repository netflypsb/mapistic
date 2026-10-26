/**
 * `@dawnistic/map-style` — Custom MapLibre GL JS Style Specification (Light & Dark Solaris Themes)
 *
 * Designed specifically for Malaysian, Singaporean & Bruneian cartography:
 * - Distinct styling for Toll Expressways (PLUS, MEX, LDP, KESAS, LPT in solar amber `#d97706`)
 * - Federal Roads (`FT1`, `FT2`, `AH150` Pan-Borneo Highway)
 * - Dedicated Motorcycle Lanes (`motorroad=yes` / `motorcycle=designated` dashed emerald)
 * - Kampung & Rural Unpaved Roads (`surface=unpaved` stippled)
 * - RapidKL / KTMB Rail Lines & Stations
 * - Mandatory ODbL Attribution (`© OpenStreetMap contributors`)
 */

const OFM_SOURCE_URL =
  process.env.NEXT_PUBLIC_OFM_TILES_URL?.trim() || "https://tiles.openfreemap.org/planet";

const OFM_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

/**
 * Style built on the OpenFreeMap public planet vector tiles (OpenMapTiles schema,
 * rebuilt weekly from the latest OSM). No self-hosted tiles, no pmtiles protocol.
 * Keeps the Mapistic MY/SG/BN identity palette (solar toll amber, motorcycle
 * lanes, rail blue) and adds landuse/buildings/labels for richer rendering.
 */
export function buildMapisticOfmStyle(opts: { theme: "light" | "dark" }) {
  const isDark = opts.theme === "dark";
  const src = "openmaptiles";
  const bg = isDark ? "#141210" : "#faf8f5";
  return {
    version: 8,
    name: isDark ? "Mapistic Solaris Dark (OpenFreeMap)" : "Mapistic Solaris Light (OpenFreeMap)",
    glyphs: OFM_GLYPHS,
    metadata: {
      "mapistic:jurisdiction": "MY,SG,BN",
      "mapistic:basemap": "openfreemap-planet",
    },
    sources: {
      [src]: {
        type: "vector",
        url: OFM_SOURCE_URL,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a> (ODbL) &middot; <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a>',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": bg } },
      { id: "landcover", type: "fill", "source-layer": "landcover", paint: { "fill-color": isDark ? "#1e2b1e" : "#e7efe3", "fill-opacity": 0.75 } },
      { id: "park", type: "fill", "source-layer": "park", paint: { "fill-color": isDark ? "#22301f" : "#cfe6c4" } },
      {
        id: "water", type: "fill", "source-layer": "water",
        paint: { "fill-color": isDark ? "#0c2d48" : "#bae6fd" },
      },
      {
        id: "waterway", type: "line", "source-layer": "waterway",
        paint: { "line-color": isDark ? "#123a5c" : "#a5d8f3", "line-width": 1.2 },
      },
      {
        id: "building", type: "fill", "source-layer": "building",
        minzoom: 13,
        paint: { "fill-color": isDark ? "#25211d" : "#ece7de", "fill-outline-color": isDark ? "#3a342e" : "#dbd5cb" },
      },
      {
        id: "tunnel-roads-minor", type: "line", "source-layer": "transportation",
        minzoom: 11,
        filter: ["all", ["==", "brunnel", "tunnel"], ["!in", "class", "motorway", "trunk"]],
        paint: { "line-color": isDark ? "#4b463f" : "#d6cfc4", "line-width": 1 },
      },
      {
        id: "roads-minor", type: "line", "source-layer": "transportation",
        minzoom: 9,
        filter: ["!in", "class", "motorway", "trunk", "primary", "secondary", "rail"],
        paint: { "line-color": isDark ? "#5c554c" : "#d2cabe", "line-width": 1.4 },
      },
      {
        id: "federal-primary-roads", type: "line", "source-layer": "transportation",
        filter: ["in", "class", "primary", "secondary", "trunk"],
        paint: { "line-color": isDark ? "#f59e0b" : "#fbbf24", "line-width": 3 },
      },
      {
        id: "malaysian-toll-expressways", type: "line", "source-layer": "transportation",
        filter: ["==", "class", "motorway"],
        paint: { "line-color": "#d97706", "line-width": 4.5 },
      },
      {
        id: "malaysian-motorcycle-lanes", type: "line", "source-layer": "transportation",
        minzoom: 12,
        filter: ["==", "motorcycle", "designated"],
        paint: { "line-color": "#059669", "line-width": 2.2, "line-dasharray": [3, 1.5] },
      },
      {
        id: "kampung-unpaved-roads", type: "line", "source-layer": "transportation",
        minzoom: 10,
        filter: ["==", "surface", "unpaved"],
        paint: { "line-color": isDark ? "#78716c" : "#a8a29e", "line-width": 1.5, "line-dasharray": [2, 2] },
      },
      {
        id: "rapidkl-ktmb-rail", type: "line", "source-layer": "transportation",
        filter: ["==", "class", "rail"],
        paint: { "line-color": "#2563eb", "line-width": 2.5 },
      },
      {
        id: "country-boundary", type: "line", "source-layer": "boundary",
        minzoom: 3,
        filter: ["==", "admin_level", 2],
        paint: { "line-color": isDark ? "#8b6f47" : "#b8a587", "line-width": 1.2, "line-dasharray": [3, 2] },
      },
      {
        id: "place-labels-city", type: "symbol", "source-layer": "place",
        filter: ["in", "class", "city", "capital", "town"],
        layout: {
          "text-field": "{name}",
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 12, 12, 16],
          "text-stroke-width": 1,
        },
        paint: {
          "text-color": isDark ? "#efece5" : "#1c1917",
          "text-halo-color": isDark ? "#141210" : "#faf8f5",
          "text-halo-width": 1.2,
        },
      },
      {
        id: "place-labels-neighbourhood", type: "symbol", "source-layer": "place",
        minzoom: 12,
        filter: ["in", "class", "neighbourhood", "suburb", "village", "quarter"],
        layout: {
          "text-field": "{name}",
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: {
          "text-color": isDark ? "#c9c3b8" : "#44403c",
          "text-halo-color": isDark ? "#141210" : "#faf8f5",
          "text-halo-width": 1,
        },
      },
      {
        id: "road-labels", type: "symbol", "source-layer": "transportation_name",
        minzoom: 14,
        layout: {
          "symbol-placement": "line",
          "text-field": "{name}",
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
        },
        paint: {
          "text-color": isDark ? "#a8a29e" : "#57534e",
          "text-halo-color": isDark ? "#141210" : "#faf8f5",
          "text-halo-width": 1,
        },
      },
    ],
  };
}

export type MapisticOfmStyle = ReturnType<typeof buildMapisticOfmStyle>;

export function buildMapisticStyleJson(opts: {
  theme: "light" | "dark";
  pmtilesUrl?: string;
}) {
  const isDark = opts.theme === "dark";
  const pmtilesSourceUrl =
    opts.pmtilesUrl || "";

  return {
    version: 8,
    name: isDark ? "Mapistic Solaris Dark (MY/SG/BN)" : "Mapistic Solaris Light (MY/SG/BN)",
    metadata: {
      "mapistic:jurisdiction": "MY,SG,BN",
      "mapistic:languages": ["ms", "en", "zh", "ta"],
    },
    sources: {
      "mapistic-vector": {
        type: "vector",
        url: pmtilesSourceUrl,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a> (ODbL) &middot; Overture Maps &middot; data.gov.my (CC-BY-4.0)',
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": isDark ? "#141210" : "#faf8f5",
        },
      },
      {
        id: "water",
        type: "fill",
        source: "mapistic-vector",
        "source-layer": "water",
        paint: {
          "fill-color": isDark ? "#0c2d48" : "#bae6fd",
        },
      },
      {
        id: "kampung-unpaved-roads",
        type: "line",
        source: "mapistic-vector",
        "source-layer": "transportation",
        filter: ["==", "surface", "unpaved"],
        paint: {
          "line-color": isDark ? "#78716c" : "#a8a29e",
          "line-width": 1.5,
          "line-dasharray": [2, 2],
        },
      },
      {
        id: "federal-primary-roads",
        type: "line",
        source: "mapistic-vector",
        "source-layer": "transportation",
        filter: ["in", "class", "primary", "secondary", "trunk"],
        paint: {
          "line-color": isDark ? "#f59e0b" : "#fbbf24",
          "line-width": 3,
        },
      },
      {
        id: "malaysian-toll-expressways",
        type: "line",
        source: "mapistic-vector",
        "source-layer": "transportation",
        filter: ["==", "class", "motorway"],
        paint: {
          "line-color": "#d97706",
          "line-width": 4.5,
        },
      },
      {
        id: "malaysian-motorcycle-lanes",
        type: "line",
        source: "mapistic-vector",
        "source-layer": "transportation",
        filter: ["==", "motorcycle", "designated"],
        paint: {
          "line-color": "#059669",
          "line-width": 2.2,
          "line-dasharray": [3, 1.5],
        },
      },
      {
        id: "rapidkl-ktmb-rail",
        type: "line",
        source: "mapistic-vector",
        "source-layer": "transportation",
        filter: ["==", "class", "rail"],
        paint: {
          "line-color": "#2563eb",
          "line-width": 2.5,
        },
      },
    ],
  };
}
