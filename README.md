# Mapistic

Web-based navigation platform for **Malaysia, Singapore & Brunei** — POI search, turn-by-turn
routing, transit feeds, community POI editing, and an MCP server for AI agents.

Mapistic is the **open-source navigation app** of the [MYmap](https://mymap.dawnistic.com)
data ecosystem: the app itself is free to self-host, and the *data layer* it consumes is
pluggable. Run it fully self-hosted with open data, or point it at the hosted
**MYmap Malaysia local-data API** (POIs, geocoding, places) for higher-quality Malaysian
results.

> This repository is freshly seeded from the 2026 build of Mapistic; internal operating
> history is deliberately not included. See [ATTRIBUTION.md](./ATTRIBUTION.md) and
> [DATA_SOURCES.md](./DATA_SOURCES.md) for data licensing.

## Features

- **POI search, geocoding & reverse geocoding** — MYmap API (preferred, if a key is configured) or self-hosted Photon
- **Turn-by-turn routing** — car / motorcycle (lane + toll awareness) / bicycle / pedestrian over a Valhalla-compatible HTTP routing endpoint
- **Malaysia official transit** — GTFS static + realtime via data.gov.my (Prasarana, KTMB, BAS.MY)
- **Community POI edits** — moderated edits table with OSMChange (`.osc`) export back to OpenStreetMap
- **Free MCP server** — 6 tools at `/api/mcp` (JSON-RPC 2.0) or standalone via `packages/mcp-server`
- **Privacy-first logging** — coordinates truncated to 3 decimal places in server logs (≈110 m grid)

## Quick start (self-hosted, open data)

```bash
pnpm install
cp .env.example apps/web/.env.local   # then edit values
pnpm --filter @dawnistic/mapistic-web build
pnpm --filter @dawnistic/mapistic-web start
```

Minimum viable config: `DATABASE_URL`, `PHOTON_INTERNAL_URL`, `VALHALLA_INTERNAL_URL`.
Or run fully offline against bundled fixtures with `MAPISTIC_FIXTURES=1`.
The complete infrastructure guide (Postgres/PostGIS, Photon, Valhalla/OSRM/GraphHopper,
tiles) is in [`docs/SELF-HOSTING.md`](./docs/SELF-HOSTING.md).

## Data providers

| Layer | Preferred (hosted) | Self-hosted fallback |
|---|---|---|
| Malaysian POIs & places | **MYmap API** (`MYMAP_API_URL` + `MYMAP_API_KEY`) | Photon over OSM |
| Geocoding | MYmap | Photon |
| Basemap tiles | — | OpenFreeMap (free) or your tile server |
| Routing | — | GraphHopper (preferred), OSRM, Valhalla-compatible endpoint |

Everything degrades gracefully: unset the optional variables and Mapistic runs entirely on
open data you host yourself.

## Packages

- `apps/web` — Next.js web app + `/api/v1/*` data API + `/api/mcp` MCP endpoint
- `packages/geo-my` — geocoder/routing/POI client library (provider-abstracted)
- `packages/map-style` — OpenFreeMap-based vector tile styles (light/dark)
- `packages/db` — Postgres/PostGIS data access
- `packages/mcp-server` — standalone MCP binary (`mapistic-mcp`)

## License

Apache-2.0 application code. Map/data layers carry separate attribution — OpenStreetMap
content is **ODbL © OpenStreetMap contributors**. See
[ATTRIBUTION.md](./ATTRIBUTION.md).