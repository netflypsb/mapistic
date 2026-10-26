# Architecture

```
 Browser / AI-agent (MCP client)
        │
        ▼
 ┌───────────────────────────────┐
 │  Next.js app  (apps/web)      │
 │  • UI (map workstation)       │
 │  • /api/v1/*  REST data API   │
 │  • /api/mcp   JSON-RPC 2.0    │
 └───────┬──────────────┬────────┘
         ▼              ▼
 ┌──────────────┐  ┌────────────────────────────────────┐
 │ Postgres 17  │  │ packages/geo-my (provider-abstract)│
 │ + PostGIS    │  │  POI search / geocode / route      │
 └──────────────┘  └───────┬──────────────┬─────────────┘
                           ▼              ▼
                 Routing HTTP API    Geocoder / POIs
                 GraphHopper/OSRM/   Photon or
                 Valhalla-compatible hosted MYmap API
                           ▼
                 Vector tiles: OpenFreeMap (default) or self-hosted
```

## Layers

- **apps/web** — the full application: map workstation UI, REST API (`/api/v1/*`), MCP
  endpoint (`/api/mcp`), moderation dashboard, transit views. Zod-validated request
  handling, rate-limited (in-memory or Redis).
- **packages/geo-my** — the data-layer client library. Provider selection at runtime:
  `MYMAP_API_URL`+`MYMAP_API_KEY` (hosted paid data) → else `PHOTON_INTERNAL_URL`/`VALHALLA_INTERNAL_URL`
  (self-hosted) → else `MAPISTIC_FIXTURES=1` (offline fixtures, CI/demo only).
- **packages/db** — typed Postgres access; saved places, POI edits (with OSMChange
  `.osc` export), search-history (opt-in).
- **packages/map-style** — OpenFreeMap vector styles, light/dark, attribution baked in.
- **packages/mcp-server** — standalone MCP binary wrapping the same 6 tools.

## Data provenance

Every POI row carries a `source` tag (`osm | overture | fsq | data.gov.my |
user-submitted`) so layers stay separable for ODbL share-alike compliance. See
DATA_SOURCES.md.

## Privacy notes

- Server-side coordinate logs truncate to 3 decimals (~110 m grid); no breadcrumb storage.
- Search history is opt-in, exportable, purgable in one call.