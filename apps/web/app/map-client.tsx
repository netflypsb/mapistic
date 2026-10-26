"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { ComputedRouteResult, PlaceRecord, TravelMode } from "@dawnistic/geo-my";
import type { DawnisticSessionUser } from "@dawnistic/mapistic-db";
import type { CustomPlaceList, SavedPlaceItem } from "@/lib/store";
import type { GtfsTransitLine } from "@/lib/transit";

const PRESET_CORRIDORS = [
  {
    label: "KLCC → Penang Airport",
    fromLat: 3.1579,
    fromLon: 101.7116,
    fromLabel: "Petronas Twin Towers (KLCC)",
    toLat: 5.2971,
    toLon: 100.2769,
    toLabel: "Penang International Airport (PEN)",
    mode: "car" as TravelMode,
    avoidToll: false,
  },
  {
    label: "KK → Sandakan (Sabah)",
    fromLat: 5.9804,
    fromLon: 116.0735,
    fromLabel: "Kota Kinabalu City Centre",
    toLat: 5.8394,
    toLon: 118.1172,
    toLabel: "Sandakan Harbour Square",
    mode: "car" as TravelMode,
    avoidToll: false,
  },
  {
    label: "JB → Singapore Causeway",
    fromLat: 1.4634,
    fromLon: 103.7649,
    fromLabel: "Johor Bahru Sentral CIQ",
    toLat: 1.4457,
    toLon: 103.7689,
    toLabel: "Woodlands Checkpoint Singapore",
    mode: "car" as TravelMode,
    avoidToll: false,
  },
  {
    label: "🏍️ FT2 Bike Lane",
    fromLat: 3.1579,
    fromLon: 101.7116,
    fromLabel: "KLCC",
    toLat: 3.0757,
    toLon: 101.586,
    toLabel: "SS15 Subang Jaya",
    mode: "motorcycle" as TravelMode,
    avoidToll: false,
  },
  {
    label: "🌊 KL ↔ Kuching (Sea Check)",
    fromLat: 3.1579,
    fromLon: 101.7116,
    fromLabel: "KLCC",
    toLat: 1.5595,
    toLon: 110.3462,
    toLabel: "Kuching Waterfront",
    mode: "car" as TravelMode,
    avoidToll: false,
  },
];

export default function MapClient({
  user,
  initialSavedPlaces,
  initialLists,
  initialTransit,
}: {
  user: DawnisticSessionUser | null;
  initialSavedPlaces: SavedPlaceItem[];
  initialLists: CustomPlaceList[];
  initialTransit: {
    attribution: string;
    license: string;
    freshness_status: string;
    freshness_label: string;
    last_known_minutes_ago: number | null;
    lines: GtfsTransitLine[];
  };
}) {
  const [lang, setLang] = useState<"en" | "ms">("en");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [searchQuery, setSearchQuery] = useState("Jln Ampang 50088 KL");
  const [searchResults, setSearchResults] = useState<PlaceRecord[]>([]);
  const [selectedCoord, setSelectedCoord] = useState({
    lat: 3.1579,
    lon: 101.7116,
    label: "Petronas Twin Towers (KLCC)",
    postcode: "50088",
    state: "Wilayah Persekutuan Kuala Lumpur",
  });

  const [activeCorridor, setActiveCorridor] = useState(PRESET_CORRIDORS[0]);
  const [mode, setMode] = useState<TravelMode>("car");
  const [avoidToll, setAvoidToll] = useState(false);
  const [routeResult, setRouteResult] = useState<ComputedRouteResult | null>(null);
  const [showTransitLayer, setShowTransitLayer] = useState(true);
  const [voiceNavActive, setVoiceNavActive] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaceItem[]>(initialSavedPlaces);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  async function runPhotonSearch(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(searchQuery)}&limit=6`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.results)) {
        setSearchResults(data.results);
      } else {
        setStatusToast(data.error || "Photon geocoder awaiting connection");
      }
    } catch {
      setStatusToast("Failed to reach /api/v1/search");
    }
  }

  async function runValhallaRoute(corridor = activeCorridor, overrideMode = mode, overrideToll = avoidToll) {
    try {
      const res = await fetch("/api/v1/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromLat: corridor.fromLat,
          fromLon: corridor.fromLon,
          fromLabel: corridor.fromLabel,
          toLat: corridor.toLat,
          toLon: corridor.toLon,
          toLabel: corridor.toLabel,
          mode: overrideMode,
          avoidToll: overrideToll,
        }),
      });
      const data = await res.json();
      if (data.status) {
        setRouteResult(data);
      } else {
        setStatusToast(data.error || "Valhalla routing endpoint awaiting connection");
      }
    } catch {
      setStatusToast("Failed to reach /api/v1/route");
    }
  }

  async function handleReverseGeocode(lat: number, lon: number, fallbackLabel: string) {
    setSelectedCoord((prev) => ({ ...prev, lat, lon, label: fallbackLabel }));
    try {
      const res = await fetch(`/api/v1/reverse?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (data.ok && data.place) {
        setSelectedCoord({
          lat,
          lon,
          label: data.place.name_ms || data.place.name,
          postcode: data.place.postcode,
          state: data.place.state,
        });
        setStatusToast(`📍 Reverse Geocoded: ${data.formatted_address}`);
      }
    } catch {
      // ignore offline
    }
  }

  async function saveSelectedPlace() {
    const res = await fetch("/api/v1/places", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save_place",
        label: "Pinned",
        place_name: selectedCoord.label,
        address: selectedCoord.label,
        postcode: selectedCoord.postcode,
        state: selectedCoord.state,
        lat: selectedCoord.lat,
        lon: selectedCoord.lon,
      }),
    });
    if (res.status === 401) {
      window.location.href = "/dashboard";
      return;
    }
    const data = await res.json();
    if (data.ok && data.saved) {
      setSavedPlaces([data.saved, ...savedPlaces]);
      setStatusToast(`★ Saved "${selectedCoord.label}" to your Mapistic account.`);
    }
  }

  return (
    <div
      className={`min-h-screen flex flex-col ${
        theme === "dark" ? "bg-[#141210] text-stone-100" : "bg-[#faf8f5] text-[#1c1917]"
      }`}
    >
      {/* Top Solaris Navigation Bar (leaves right space for fixed DawnisticAccountButton) */}
      <header className="border-b border-[#e7e5e4] bg-[#faf8f5]/95 text-[#1c1917] backdrop-blur sticky top-0 z-30 pr-48">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-lg bg-[#d97706] text-white font-bold flex items-center justify-center">
              M
            </span>
            <div>
              <span className="font-bold text-lg tracking-tight">Mapistic</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-semibold">
                MY · SG · BN
              </span>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-1.5 text-xs">
            {PRESET_CORRIDORS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => {
                  setActiveCorridor(c);
                  setMode(c.mode);
                  setAvoidToll(c.avoidToll);
                  runValhallaRoute(c, c.mode, c.avoidToll);
                }}
                className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-amber-100 font-medium cursor-pointer"
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setLang(lang === "en" ? "ms" : "en")}
              className="px-2.5 py-1.5 rounded-lg border border-stone-300 font-semibold cursor-pointer bg-white"
            >
              🌐 {lang === "en" ? "BM" : "EN"}
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="px-2.5 py-1.5 rounded-lg border border-stone-300 font-semibold cursor-pointer bg-white"
            >
              {theme === "light" ? "🌙 Dark" : "☀️ Light"}
            </button>
            <Link href="/dashboard" className="solaris-btn-primary text-xs">
              Open Dashboard →
            </Link>
          </div>
        </div>
      </header>

      {statusToast && (
        <div className="bg-amber-50 border-b border-amber-300 text-amber-950 text-xs font-medium px-4 py-2 text-center">
          {statusToast}
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5 grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-4">
          {/* 1. Photon Search Bar */}
          <form onSubmit={runPhotonSearch} className="solaris-card p-4 text-[#1c1917] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#57534e]">
                Photon Geocoder + BM Normalizer (`Jln`, `Tmn`, `Kg`, Postcodes)
              </span>
              <Link href="/dashboard" className="text-[11px] text-amber-700 font-semibold hover:underline">
                {user ? user.email : "Saved Places →"}
              </Link>
            </div>
            <div className="flex gap-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="solaris-input text-xs"
                placeholder="e.g. Jln Ampang 50088 KL"
              />
              <button type="submit" className="solaris-btn-primary text-xs shrink-0">
                Search
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="grid gap-1.5 max-h-40 overflow-y-auto">
                {searchResults.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() =>
                      setSelectedCoord({
                        lat: place.lat,
                        lon: place.lon,
                        label: place.name,
                        postcode: place.postcode,
                        state: place.state,
                      })
                    }
                    className="p-2 rounded-lg border border-[#e7e5e4] bg-[#faf8f5] text-left text-xs flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold">{lang === "ms" ? place.name_ms : place.name_en}</div>
                      <div className="text-[10px] text-[#57534e]">
                        {place.postcode} {place.district}, {place.state} ({place.country})
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-stone-200">
                      {place.license}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>

          {/* 2. Valhalla Multi-Modal Routing Panel */}
          <div className="solaris-card p-4 text-[#1c1917] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm">
                Valhalla Multi-Modal Directions ({activeCorridor.fromLabel} → {activeCorridor.toLabel})
              </h2>
              <button
                type="button"
                onClick={() => setVoiceNavActive(!voiceNavActive)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-950 cursor-pointer"
              >
                {voiceNavActive ? "🔊 Voice Nav ON" : "🔈 Voice Nav"}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-xs">
              {(["car", "motorcycle", "bicycle", "walking"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    runValhallaRoute(activeCorridor, m, avoidToll);
                  }}
                  className={`py-1.5 rounded-lg font-semibold cursor-pointer border uppercase ${
                    mode === m
                      ? "bg-[#1c1917] text-white border-[#1c1917]"
                      : "bg-[#faf8f5] text-[#57534e] border-[#e7e5e4]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={avoidToll}
                  onChange={(e) => {
                    setAvoidToll(e.target.checked);
                    runValhallaRoute(activeCorridor, mode, e.target.checked);
                  }}
                  className="accent-[#d97706]"
                />
                Avoid Tolls (PLUS / LPT / MEX)
              </label>
              <button
                type="button"
                onClick={() => runValhallaRoute(activeCorridor, mode, avoidToll)}
                className="solaris-btn-primary text-xs"
              >
                Calculate Valhalla Route →
              </button>
            </div>

            {routeResult && (
              <div className="space-y-2.5 pt-2 border-t border-[#e7e5e4]">
                {routeResult.advisory_banner && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950">
                    {routeResult.advisory_banner}
                  </div>
                )}
                {routeResult.status === "ROUTABLE" && (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center p-2.5 rounded-xl bg-[#faf8f5] border border-[#e7e5e4] text-xs">
                      <div>
                        <div className="text-[10px] uppercase text-[#57534e]">Distance</div>
                        <div className="font-bold">{routeResult.distance_km} km</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-[#57534e]">ETA</div>
                        <div className="font-bold text-emerald-800">{routeResult.duration_min} min</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-[#57534e]">Geometry Pts</div>
                        <div className="font-bold">{routeResult.geometry_coords.length} pts</div>
                      </div>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {routeResult.steps.map((step, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-white border border-[#e7e5e4] text-xs">
                          <div className="font-semibold">
                            {idx + 1}. {lang === "ms" ? step.instruction_ms : step.instruction_en}
                          </div>
                          <div className="text-[10px] text-[#57534e]">
                            {step.road_name} · {step.distance_km} km ({step.duration_min} min)
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 3. Saved Places & Lists CTA */}
          <div className="solaris-card p-4 text-[#1c1917] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-[#57534e]">
                ★ Saved Places ({savedPlaces.length}) &amp; Lists ({initialLists.length})
              </span>
              <button
                type="button"
                onClick={saveSelectedPlace}
                className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
              >
                + Save Active Pin
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/dashboard" className="solaris-btn-secondary text-xs">
                Manage in /dashboard →
              </Link>
              <Link href="/moderation" className="solaris-btn-secondary text-xs">
                POI Moderation &amp; .OSC Export
              </Link>
            </div>
          </div>
        </div>

        {/* Right Interactive Vector Map Viewport + Live GTFS Bar */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div
            className={`solaris-card p-4 flex-1 flex flex-col justify-between relative overflow-hidden min-h-[480px] ${
              theme === "dark" ? "bg-[#0c1926] border-stone-800 text-stone-100" : "bg-[#e0f2fe] text-[#1c1917]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 z-10">
              <div className="px-3 py-1.5 rounded-xl bg-white/95 text-[#1c1917] shadow-xs text-xs font-semibold">
                🗺️ PMTiles Vector Viewport (MY · SG · BN) — Click any pin to reverse geocode
              </div>
              <label className="px-3 py-1.5 rounded-xl bg-white/95 text-[#1c1917] text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTransitLayer}
                  onChange={(e) => setShowTransitLayer(e.target.checked)}
                />
                🚆 GTFS Layer
              </label>
            </div>

            <svg
              viewBox="0 0 800 400"
              className="w-full h-auto my-auto select-none"
              role="img"
              aria-label="Interactive Map of Malaysia, Singapore, and Brunei"
            >
              <path
                d="M110,55 L175,65 L220,145 L245,250 L235,320 L185,310 L135,215 L105,120 Z"
                fill={theme === "dark" ? "#1c1917" : "#faf8f5"}
                stroke="#d97706"
                strokeWidth="2.5"
              />
              <path
                d="M410,295 L495,245 L580,170 L665,95 L745,120 L725,210 L620,285 L485,335 Z"
                fill={theme === "dark" ? "#1c1917" : "#faf8f5"}
                stroke="#d97706"
                strokeWidth="2.5"
              />
              {[
                { lat: 5.2971, lon: 100.2769, x: 125, y: 95, label: "Penang (PEN)" },
                { lat: 6.1333, lon: 102.2386, x: 192, y: 78, label: "Kota Bharu (15000)" },
                { lat: 3.1579, lon: 101.7116, x: 168, y: 215, label: "KLCC (50088)" },
                { lat: 1.4634, lon: 103.7649, x: 228, y: 308, label: "JB Sentral" },
                { lat: 1.4457, lon: 103.7689, x: 235, y: 325, label: "Singapore (Woodlands)" },
                { lat: 1.5595, lon: 110.3462, x: 440, y: 295, label: "Kuching (Sarawak)" },
                { lat: 5.9804, lon: 116.0735, x: 658, y: 112, label: "Kota Kinabalu (Sabah)" },
                { lat: 5.8394, lon: 118.1172, x: 722, y: 135, label: "Sandakan (Sabah)" },
              ].map((pin) => (
                <g
                  key={pin.label}
                  onClick={() => handleReverseGeocode(pin.lat, pin.lon, pin.label)}
                  className="cursor-pointer"
                >
                  <circle cx={pin.x} cy={pin.y} r="7" fill="#d97706" stroke="#ffffff" strokeWidth="2" />
                  <text
                    x={pin.x + 11}
                    y={pin.y + 4}
                    fill={theme === "dark" ? "#faf8f5" : "#1c1917"}
                    fontSize="10.5"
                    fontWeight="700"
                  >
                    {pin.label}
                  </text>
                </g>
              ))}
            </svg>

            <div className="flex flex-wrap items-center justify-between gap-2 z-10 bg-white/95 text-[#1c1917] p-3 rounded-xl border border-[#e7e5e4] text-xs">
              <div>
                <strong>📌 {selectedCoord.label}</strong> ({selectedCoord.lat.toFixed(3)},{" "}
                {selectedCoord.lon.toFixed(3)})
              </div>
              <div>
                ©{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-semibold"
                >
                  OpenStreetMap contributors
                </a>{" "}
                (ODbL) · Overture Maps · data.gov.my (CC-BY-4.0)
              </div>
            </div>
          </div>

          {/* 4. Live Malaysia GTFS-Realtime Panel with Explicit Freshness Window */}
          {showTransitLayer && (
            <div className="solaris-card p-4 text-[#1c1917] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase text-[#57534e]">
                  🚆 Malaysia GTFS-Realtime Public Transport (`data.gov.my` · {initialTransit.license})
                </span>
                <span
                  className={`solaris-badge ${
                    initialTransit.freshness_status === "live"
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  Status: {initialTransit.freshness_label}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
                {initialTransit.lines.map((line) => (
                  <div key={line.id} className="p-2.5 rounded-xl bg-[#faf8f5] border border-[#e7e5e4] space-y-1">
                    <div className="flex items-center justify-between font-bold">
                      <span>
                        [{line.line_code}] {lang === "ms" ? line.name_ms : line.name_en}
                      </span>
                      <span className="text-[10px] text-emerald-800">{line.operator}</span>
                    </div>
                    <div className="text-[11px] text-[#57534e]">
                      {line.live_vehicles.length > 0
                        ? `Live Vehicle ${line.live_vehicles[0].vehicle_id}: ${line.live_vehicles[0].speed_kmh} km/h (${line.live_vehicles[0].status})`
                        : line.freshness_label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
