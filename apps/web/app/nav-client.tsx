"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type StyleSpecification, type AddLayerObject } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildMapisticOfmStyle } from "@dawnistic/map-style";
import type { PlaceRecord, TravelMode } from "@dawnistic/geo-my";

/**
 * Mapistic Navigation App (`/`)
 * Google-Maps-style: one search box + one live map.
 * - Real GPS via navigator.geolocation.watchPosition (live blue dot that follows movement)
 * - Pick a destination → route drawn from YOUR current GPS position, with ETA card
 * - Start Navigation: the camera follows you as you move; auto re-route when
 *   you drift >120 m off the route; "arrived" announced within ~60 m.
 *
 * All previously shipped Mapistic features (saved places, lists, POI
 * moderation, data quality, MCP docs, transit) remain at /explore and /dashboard.
 */

const MODES: { id: TravelMode; icon: string; label: string }[] = [
  { id: "car", icon: "🚗", label: "Car" },
  { id: "motorcycle", icon: "🏍️", label: "Bike" },
  { id: "bicycle", icon: "🚲", label: "Cycle" },
  { id: "walking", icon: "🚶", label: "Walk" },
];

type GpsStatus = "idle" | "requesting" | "live" | "denied" | "error";

interface UserFix {
  lat: number;
  lon: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
}

interface RouteResult {
  status: string;
  distance_km: number;
  duration_min: number;
  geometry_coords: Array<[number, number]>; // [lon, lat]
  advisory_banner: string | null;
  steps: { instruction_en: string; distance_km: number; duration_min: number }[];
}

interface DestPoint {
  lat: number;
  lon: number;
  name: string;
  address?: string;
  postcode?: string;
  state?: string;
  country?: string;
}

const ROUTE_SOURCE = "mapistic-route";
const USER_SOURCE = "mapistic-user";
const DEST_SOURCE = "mapistic-dest";

function lineFeature(coords: Array<[number, number]>) {
  return { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } };
}
function pointFeature(c: [number, number]) {
  return { type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: c } };
}
function emptyLineSet() {
  return { type: "FeatureCollection" as const, features: [] };
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function boundsOf(coords: Array<[number, number]>): [[number, number], [number, number]] {
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}

function accuracyRadiusPx(zoom: number, meters: number) {
  const metersPerPixel = (156543.03 * Math.cos((3 * Math.PI) / 180)) / Math.pow(2, zoom);
  return Math.min(Math.max((meters * 2.2) / metersPerPixel / 2, 6), 90);
}

const OSM_FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a> (ODbL)',
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#e8e2d8" } },
    { id: "osm", type: "raster", source: "osm" },
  ],
};

const INITIAL_CENTER: [number, number] = [101.6869, 3.139]; // KL

export default function NavigationApp() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const posRef = useRef<UserFix | null>(null);
  const watchRef = useRef<number | null>(null);
  const navModeRef = useRef(false);
  const lastRerouteRef = useRef(0);
  const destRef = useRef<(DestPoint & { mode: TravelMode }) | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PlaceRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<DestPoint | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routing, setRouting] = useState(false);
  const [mode, setMode] = useState<TravelMode>("car");
  const [navMode, setNavMode] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 7000);
  }, []);

  /* ---------- overlays (created once per style, survive fallback swaps) ---------- */
  const syncOverlays = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    // reset source data until next fix/route update
    const routeSrc = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!routeSrc) {
      map.addSource(ROUTE_SOURCE, { type: "geojson", data: emptyLineSet() });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: ROUTE_SOURCE,
        paint: { "line-color": "#1c1917", "line-width": 9, "line-opacity": 0.3 },
      } as AddLayerObject);
      map.addLayer({
        id: "route-line",
        type: "line",
        source: ROUTE_SOURCE,
        paint: { "line-color": "#d97706", "line-width": 5.5, "line-opacity": 0.95 },
      });
    }
    const userSrc = map.getSource(USER_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!userSrc) {
      map.addSource(USER_SOURCE, { type: "geojson", data: emptyLineSet() });
      map.addLayer({
        id: "user-accuracy",
        type: "circle",
        source: USER_SOURCE,
        paint: { "circle-color": "#3b82f6", "circle-opacity": 0.15, "circle-stroke-color": "#3b82f6", "circle-stroke-width": 1, "circle-stroke-opacity": 0.3 },
      });
      map.addLayer({
        id: "user-dot",
        type: "circle",
        source: USER_SOURCE,
        paint: { "circle-color": "#2563eb", "circle-radius": 8, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 },
      });
      map.moveLayer("user-accuracy", "route-casing");
      map.moveLayer("user-dot");
    }
    const destSrc = map.getSource(DEST_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!destSrc) {
      map.addSource(DEST_SOURCE, { type: "geojson", data: emptyLineSet() });
      map.addLayer({
        id: "dest-pin",
        type: "circle",
        source: DEST_SOURCE,
        paint: { "circle-color": "#a4140f", "circle-radius": 7, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 },
      });
      map.moveLayer("dest-pin", "user-accuracy");
    }
    const d = destRef.current;
    if (d && destSrc) destSrc.setData(pointFeature([d.lon, d.lat]));
  }, []);

  /* ---------- map init ---------- */
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    /* Boot the OSM raster fallback IMMEDIATELY so the map is always live;
       upgrade to the OpenFreeMap vector style once its TileJSON is reachable. */
    const MAPISTIC_SOURCE = "openmaptiles";
    const boot = (style: StyleSpecification) => {
      const map = new maplibregl.Map({
        container: mapContainer.current!,
        style,
        center: INITIAL_CENTER,
        zoom: 11,
        dragRotate: false,
        attributionControl: { compact: false },
      } as maplibregl.MapOptions);
      mapRef.current = map;
      /* debug hook (dev support; harmless in prod) */
      (window as unknown as { __mapistic?: maplibregl.Map }).__mapistic = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.on("styledata", syncOverlays);
      map.on("load", syncOverlays);
      let vectorFailing = false;
      map.on("error", (e: unknown) => {
        const ev = e as { sourceId?: string };
        if (ev.sourceId === MAPISTIC_SOURCE && !vectorFailing) {
          vectorFailing = true;
          map.setStyle(OSM_FALLBACK_STYLE);
        }
      });
    };

    boot(OSM_FALLBACK_STYLE);

    /* upgrade to OpenFreeMap vector planet tiles (OpenMapTiles schema, weekly OSM) */
    {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      fetch("https://tiles.openfreemap.org/planet", { method: "GET", signal: ctrl.signal })
        .then((r) => {
          if (r.ok && mapRef.current) {
            mapRef.current.setStyle(buildMapisticOfmStyle({ theme: "light" }) as unknown as StyleSpecification);
          }
        })
        .catch(() => { /* stay on the OSM raster fallback */ })
        .finally(() => clearTimeout(timer));
    }

    return () => {
      /* no tile protocol to clean up (OpenFreeMap is a plain https vector source) */
    };
  }, [syncOverlays]);

  /* overlay sync whenever destination changes */
  useEffect(() => {
    syncOverlays();
  }, [destination, syncOverlays]);

  /* ---------- GPS watch ---------- */
  const updateUserDot = useCallback((fix: UserFix) => {
    posRef.current = fix;
    const map = mapRef.current;
    if (map) {
      syncOverlays();
      const src = map.getSource(USER_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(pointFeature([fix.lon, fix.lat]));
        if (map.getLayer("user-accuracy") && map.getZoom() > 8) {
          map.setPaintProperty("user-accuracy", "circle-radius", accuracyRadiusPx(map.getZoom(), Math.min(fix.accuracy, 150)));
        }
      }
      if (navModeRef.current) {
        map.easeTo({ center: [fix.lon, fix.lat], zoom: Math.max(map.getZoom(), 16.4), duration: 900 });
      }
    }
  }, [syncOverlays]);

  useEffect(() => {
    const hasUrlFix = (() => {
      try {
        const q = new URLSearchParams(window.location.search);
        const lat = q.get("lat"), lon = q.get("lon");
        return !!(lat && lon && Number.isFinite(+lat) && Number.isFinite(+lon));
      } catch {
        return false;
      }
    })();

    if (hasUrlFix) {
      try {
        const q = new URLSearchParams(window.location.search);
        setGpsStatus("live");
        updateUserDot({ lat: +q.get("lat")!, lon: +q.get("lon")!, accuracy: 10, heading: null, speed: null });
        /* Simulated live movement for testing (URL override mode): */
        const simListener = (ev: Event) => {
          const d = (ev as CustomEvent).detail as Record<string, unknown>;
          const slat = Number(d?.lat), slon = Number(d?.lon);
          if (Number.isFinite(slat) && Number.isFinite(slon)) {
            updateUserDot({ lat: slat, lon: slon, accuracy: Number(d.accuracy) || 10, heading: Number.isFinite(Number(d.heading)) ? Number(d.heading) : null, speed: Number.isFinite(Number(d.speed)) ? Number(d.speed) : null });
          }
        };
        window.addEventListener("mapistic:simfix", simListener);
        return;
      } catch {
        /* ignore malformed URL */
      }
    }

    setGpsStatus("idle");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("error");
      showToast("GPS is not available in this browser.");
      return;
    }
    /* Do NOT auto-request on page load: browsers auto-deny any call after the user
       has once refused, and load-time prompts feel intrusive. Request the first fix
       only on a real user gesture (enableGps() below → tap). */
  }, [showToast, updateUserDot]);

  /* user-gesture GPS request: prompts the browser permission dialog cleanly */
  const enableGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("error");
      showToast("GPS is not available in this browser.");
      return;
    }
    setGpsStatus("requesting");
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsStatus("live");
        updateUserDot({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 30, heading: pos.coords.heading, speed: pos.coords.speed });
        /* first fix acquired — now stream live movement */
        watchRef.current = navigator.geolocation.watchPosition(
          (p2) => {
            setGpsStatus("live");
            updateUserDot({ lat: p2.coords.latitude, lon: p2.coords.longitude, accuracy: p2.coords.accuracy ?? 30, heading: p2.coords.heading, speed: p2.coords.speed });
          },
          () => setGpsStatus("error"),
          { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 }
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus("denied");
          showToast("Location is blocked in this browser — see how to allow it below.");
        } else {
          setGpsStatus("error");
          showToast("Could not get a GPS fix yet: " + err.message);
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [showToast, updateUserDot]);

  const locateMe = () => {
    const fix = posRef.current;
    if (fix && mapRef.current) mapRef.current.flyTo({ center: [fix.lon, fix.lat], zoom: 15.5 });
    else showToast("Waiting for a GPS fix…");
  };

  /* ---------- search ---------- */
  function runSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}&limit=6`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.results)) setResults(data.results);
        else {
          setResults([]);
          showToast(data.error || "Search is unavailable right now.");
        }
      } catch {
        showToast("Failed to reach the search service.");
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  /* ---------- routing ---------- */
  async function computeRoute(fix: UserFix, dest: DestPoint, m: TravelMode) {
    setRouting(true);
    setRoute(null);
    try {
      const res = await fetch("/api/v1/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromLat: fix.lat,
          fromLon: fix.lon,
          fromLabel: "Your location",
          toLat: dest.lat,
          toLon: dest.lon,
          toLabel: dest.name,
          mode: m,
          avoidToll: false,
        }),
      });
      const data = await res.json();
      if (data.ok && data.status === "ROUTABLE") {
        setRoute(data);
        const map = mapRef.current;
        if (map) {
          syncOverlays();
          const routeSrc = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
          if (routeSrc) routeSrc.setData(lineFeature(data.geometry_coords));
          map.fitBounds(boundsOf(data.geometry_coords), {
            padding: { top: 130, bottom: 240, left: 40, right: 40 },
            maxZoom: 16,
            duration: 900,
          });
        }
      } else {
        showToast(data.advisory_banner || data.error || "No routable road found between these points.");
      }
    } catch {
      showToast("Failed to reach the routing service.");
    } finally {
      setRouting(false);
    }
  }

  function pickDestination(place: PlaceRecord) {
    const dest: DestPoint = { lat: place.lat, lon: place.lon, name: place.name };
    destRef.current = { ...dest, mode };
    setDestination(dest);
    setResults([]);
    setSearchQuery(place.name);
    syncOverlays();
    const fix = posRef.current;
    if (fix) computeRoute(fix, dest, mode);
    else showToast("Enable location to get directions from your position.");
  }

  /* Enter in the search box: use the first result, or search-and-pick if
     the debounced results have not arrived yet. */
  async function goFromEnter() {
    if (results[0]) {
      pickDestination(results[0]);
      return;
    }
    const query = searchQuery.trim();
    if (query.length < 2) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}&limit=6`);
      const data = await res.json();
      const first = data.ok && Array.isArray(data.results) ? data.results[0] : null;
      if (first) pickDestination(first);
      else showToast("No results found for that search.");
    } catch {
      showToast("Search failed — check your connection and try again.");
    } finally {
      setSearching(false);
    }
  }

  function changeMode(m: TravelMode) {
    setMode(m);
    if (destRef.current) destRef.current.mode = m;
    const fix = posRef.current;
    if (destination && fix) computeRoute(fix, destination, m);
  }

  function startNavigation() {
    if (!posRef.current) return;
    setNavMode(true);
    navModeRef.current = true;
    mapRef.current?.easeTo({
      center: [posRef.current.lon, posRef.current.lat],
      zoom: 16.8,
      duration: 900,
    });
    showToast("Navigation started — the map follows your live movement.");
  }

  function stopNavigation() {
    setNavMode(false);
    navModeRef.current = false;
    mapRef.current?.easeTo({ duration: 500 });
  }

  function clearDestination() {
    setDestination(null);
    setRoute(null);
    setSearchQuery("");
    setResults([]);
    destRef.current = null;
    setNavMode(false);
    navModeRef.current = false;
    const map = mapRef.current;
    if (map) {
      (map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource)?.setData(emptyLineSet());
      (map.getSource(DEST_SOURCE) as maplibregl.GeoJSONSource)?.setData(emptyLineSet());
    }
  }

  /* auto re-route + arrival detection in nav mode */
  useEffect(() => {
    if (!navMode || !route || !posRef.current || !destination) return;
    const fix = posRef.current;
    let minM = Infinity;
    for (const [lon, lat] of route.geometry_coords) {
      const d = haversineM(fix.lat, fix.lon, lat, lon);
      if (d < minM) minM = d;
    }
    const toDest = haversineM(fix.lat, fix.lon, destination.lat, destination.lon);
    if (toDest < 60) {
      showToast("🏁 You have arrived — " + destination.name);
      return;
    }
    if (minM > 120 && Date.now() - lastRerouteRef.current > 20000) {
      lastRerouteRef.current = Date.now();
      showToast("You are off route — recalculating…");
      computeRoute(fix, destination, mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posRef.current?.lat, posRef.current?.lon]);

  return (
    <div
      className="relative w-full overflow-hidden bg-[#e8e2d8] text-[#1c1917]"
      style={{ height: "100dvh", minHeight: "100svh" }}
    >
      <div ref={mapContainer} className="absolute inset-0" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />

      {/* Top: search box + results (Google-Maps style) */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-col gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 max-w-lg">
          <div className="flex-1 flex items-center bg-white rounded-full shadow-lg border border-[#e7e5e4] pl-4 pr-2 py-2 gap-2">
            {destination && (
              <button onClick={clearDestination} className="text-stone-500 px-1 text-lg leading-none cursor-pointer" aria-label="Clear destination">
                ←
              </button>
            )}
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                runSearch(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void goFromEnter();
                }
              }}
              placeholder="Search for a place to go…"
              className="flex-1 outline-none text-sm bg-transparent min-w-0"
              autoComplete="off"
            />
            {searching && <span className="text-xs text-[#57534e] animate-pulse">…</span>}
            <button
              onClick={() => results[0] && pickDestination(results[0])}
              className="px-3 py-1.5 rounded-full bg-[#1c1917] text-white text-xs font-semibold cursor-pointer shrink-0"
            >
              Go
            </button>
          </div>
        </div>

        {results.length > 0 && (
          <div className="pointer-events-auto bg-white rounded-2xl shadow-lg border border-[#e7e5e4] overflow-hidden max-h-72 overflow-y-auto max-w-lg">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => pickDestination(p)}
                className="w-full text-left px-4 py-2.5 hover:bg-[#faf8f5] cursor-pointer border-b border-[#f1eee9] last:border-0"
              >
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-[11px] text-[#57534e]">
                  {[p.address, p.postcode, p.district, p.state, p.country].filter(Boolean).join(", ")}
                </div>
              </button>
            ))}
          </div>
        )}

        {(gpsStatus === "denied" || gpsStatus === "idle" || gpsStatus === "error") && (
          <div className="pointer-events-auto bg-white border border-[#e7e5e4] text-[#1c1917] text-xs rounded-xl px-4 py-3 shadow-lg self-start max-w-xs space-y-2">
            <div className="font-bold">📍 {gpsStatus === "denied" ? "Location is blocked" : "Use your location"}</div>
            {gpsStatus === "denied" ? (
              <ol className="text-[11px] text-[#57534e] space-y-0.5 list-decimal pl-4">
                <li>Tap the 🔒 / settings icon <strong>in your browser's address bar</strong></li>
                <li>Set <strong>Location → Allow</strong> (not "Temporary")</li>
                <li>Reload the page, then tap "Try again"</li>
              </ol>
            ) : (
              <div className="text-[11px] text-[#57534e]">
                Allow the browser's permission popup so navigation can start from your position.
              </div>
            )}
            <button
              onClick={enableGps}
              className="w-full py-2 rounded-lg bg-[#1a7f37] text-white text-xs font-bold cursor-pointer"
            >
              {gpsStatus === "denied" ? "↻ Try again" : "📍 Enable location"}
            </button>
          </div>
        )}
      </div>

      {/* Locate + GPS chip */}
      <div className="absolute left-3 bottom-3 z-20 flex flex-col items-start gap-2">
        <button
          onClick={locateMe}
          className="bg-white shadow-lg rounded-full w-11 h-11 flex items-center justify-center text-lg border border-[#e7e5e4] cursor-pointer"
          title="Center map on my live location"
        >
          ⌖
        </button>
        <button
          onClick={enableGps}
          className={`px-2.5 py-1 rounded-full text-[10px] font-semibold shadow cursor-pointer ${
            gpsStatus === "live"
              ? "bg-emerald-600 text-white"
              : gpsStatus === "requesting"
                ? "bg-white text-[#57534e]"
                : gpsStatus === "idle"
                  ? "bg-[#1c1917] text-white"
                  : "bg-amber-100 text-amber-950"
          }`}
        >
          {gpsStatus === "live"
            ? "● GPS live"
            : gpsStatus === "requesting"
              ? "Locating…"
              : gpsStatus === "denied"
                ? "Location blocked · tap"
                : gpsStatus === "idle"
                  ? "📍 Use my location"
                  : "GPS off · tap to retry"}
        </button>
      </div>

      {/* Bottom directions card */}
      {(destination || routing) && (
        <div className="absolute bottom-3 right-3 left-3 sm:left-auto sm:w-[380px] z-30">
          <div className="bg-white rounded-2xl shadow-xl border border-[#e7e5e4] p-4 space-y-3">
            {destination && (
              <div className="text-sm">
                <span className="text-[#a4140f] font-bold">Destination:</span> <strong>{destination.name}</strong>
                <div className="text-[11px] text-[#57534e]">
                  {[destination.address, destination.postcode, destination.state, destination.country].filter(Boolean).join(", ")}
                </div>
              </div>
            )}
            {route && (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-2xl font-bold leading-none">{Math.round(route.duration_min)} min</div>
                    <div className="text-xs text-[#57534e] mt-1">{route.distance_km.toFixed(1)} km · best route</div>
                  </div>
                  {navMode && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">NAVIGATING</span>}
                </div>
                {route.steps.length > 0 && !navMode && (
                  <div className="max-h-24 overflow-y-auto space-y-1 border-t border-[#f1eee9] pt-2">
                    {route.steps.slice(0, 4).map((s, i) => (
                      <div key={i} className="text-[11px] text-[#57534e]">
                        {i + 1}. {s.instruction_en} <span className="text-[#a8a29e]">({s.distance_km} km)</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-1.5">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => changeMode(m.id)}
                      className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${
                        mode === m.id ? "bg-[#1c1917] text-white border-[#1c1917]" : "bg-[#faf8f5] text-[#57534e] border-[#e7e5e4]"
                      }`}
                    >
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
                {route.advisory_banner && (
                  <div className="text-[11px] text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                    {route.advisory_banner}
                  </div>
                )}
                {navMode ? (
                  <button onClick={stopNavigation} className="w-full py-2.5 rounded-xl bg-[#a4140f] text-white text-sm font-bold cursor-pointer">
                    Stop navigation
                  </button>
                ) : (
                  <button
                    onClick={startNavigation}
                    disabled={!posRef.current}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold cursor-pointer ${
                      posRef.current ? "bg-[#1a7f37] text-white" : "bg-stone-200 text-stone-500 cursor-not-allowed"
                    }`}
                  >
                    {posRef.current ? "▶ Start navigation" : "Waiting for GPS fix…"}
                  </button>
                )}
              </>
            )}
            {routing && <div className="text-xs text-[#57534e] animate-pulse">Calculating route from your location…</div>}
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-[#1c1917] text-white text-xs px-4 py-2 rounded-full shadow-lg max-w-[90vw] text-center">
          {toast}
        </div>
      )}

      {/* keep the full workstation reachable — everything stays available */}
      <a href="/explore" className="absolute bottom-16 left-3 z-20 text-[10px] font-semibold text-[#57534e] hover:underline">
        Explore · saved · transit →
      </a>
      <a href="/dashboard" className="absolute bottom-6 left-3 z-20 text-[10px] font-semibold text-[#57534e] hover:underline">
        Dashboard →
      </a>

      {/* Powered by Mapistic badge — links back to the hub */}
      <a
        href={process.env.NEXT_PUBLIC_HUB_URL || "#"}
        target="_blank"
        rel="noopener"
        className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 bg-white/90 backdrop-blur border border-[#e7e5e4] shadow-sm rounded-full px-3 py-1.5 text-[11px] font-semibold text-[#1c1917] hover:bg-white cursor-pointer"
      >
        <span className="inline-block w-3.5 h-3.5 rounded-full bg-[#1c1917] text-white text-[9px] leading-[14px] text-center font-bold">M</span>
        Powered by Mapistic
      </a>
    </div>
  );
}