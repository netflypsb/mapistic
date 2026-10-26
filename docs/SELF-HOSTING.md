# Self-Hosting Mapistic

Mapistic is a Next.js monorepo (`pnpm` + Turborepo). This guide gives the minimum
infrastructure for a production-like deployment for the Malaysia–Singapore–Brunei region.

```
┌─────────────┐   HTTP    ┌──────────────┐
│ Browser/APP │ ────────▶ │  Next.js app │──▶ Postgres 17 + PostGIS 3.5
└─────────────┘           │  (apps/web)  │
                          └───┬──────┬───┘
        ┌─────────────────────┘      └───────────────┐
        ▼                                            ▼
   Routing HTTP API                          Geocoder / POI search
   (GraphHopper or OSRM, or a                (Photon, or the hosted
    Valhalla-compatible endpoint)             MYmap API)
        ▼
   Vector tiles: OpenFreeMap (free) or your tile server
```

## 1. Database — Postgres 17 + PostGIS 3.5

Any Postgres 17+ with the PostGIS 3.5 extension. [Neon](https://neon.tech) (serverless,
branching) is the recommended hosted option; a plain self-hosted instance works identically.

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- schema migrations live in packages/db — run on first boot
```

`DATABASE_URL` is the single app connection string (use a pooler endpoint for serverless).

## 2. Basemap tiles — zero cost by default

The app renders **OpenFreeMap** vector tiles (`https://tiles.openfreemap.org/planet`) by
default — free, no API key, OSM-derived (ODbL attribution is shown in-app).
To self-host: tileserver serving MapLibre-compatible tiles, set
`NEXT_PUBLIC_OFM_TILES_URL`. A self-hosted **Tilemaker/Planetiler planet extract** also
works. Raw PMTiles sources are still supported by `packages/map-style` if you pass an
explicit `pmtilesUrl`.

## 3. Routing

Recommended: **GraphHopper** — configurable speed profiles (CH) plus per-request custom
models, no graph rebuild when you tweak rules. **OSRM** is the simpler alternative
(pre-built profiles; good for standard car/bike/walk routing).

`packages/geo-my` speaks a small Valhalla-compatible JSON contract:
`POST {VALHALLA_INTERNAL_URL}/route` with `costing` = `auto|motorcycle|bicycle|pedestrian`.
Any server honoring that shape works — including a real Valhalla deployment.

⚠️ Practical note: we found raw Valhalla's Malaysia road-network data quality wanting for
primary navigation in early prototypes; GraphHopper with tuned custom models and more
current OSM extracts is the safer default. Your mileage is welcome to differ.

## 4. Geocoder & POI search

Two paths:

1. **Hosted (preferred): MYmap API** — set `MYMAP_API_URL` and `MYMAP_API_KEY`.
   [mymap.dawnistic.com](https://mymap.dawnistic.com) serves 1.79M+ open Malaysian
   commercial POIs (Foursquare + Overture conflate) with per-call credit billing and an
   MCP wrapper. Mapistic detects the env vars and uses MYmap as the primary provider.
2. **Self-hosted fallback: Photon** — Java-based, indexes an OSM `.pbf` extract:

```bash
mkdir photon-data
wget https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf
docker run -v "$PWD/photon-data:/photon/photon_data" ghcr.io/komoot/photon:latest \
  -nometadata -o -n 4 \
  -i https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf
# then serve:
docker run -p 2322:2322 -v "$PWD/photon-data:/photon/photon_data" ghcr.io/komoot/photon:latest
```

`PHOTON_INTERNAL_URL="http://localhost:2322"` is all the app needs.
`MAPISTIC_FIXTURES=1` replaces both geocoder and routing with tiny bundled fixtures —
useful for CI, tests, and demos only.

## 5. Identity service (optional)

Account features (sign-in, saved places, moderation console) need a Better Auth-compatible
identity service: set `HUB_URL` + `NEXT_PUBLIC_HUB_URL`. Unset = the app runs without
accounts.

## 6. Transit feeds (no work needed)

`api.data.gov.my` GTFS static + realtime for Prasarana / KTMB / BAS.MY is public and
unauthenticated; set `DATA_GOV_MY_GTFS_REALTIME_URL` if you mirror it.

## 7. Deployment notes

- One Next.js deployment (single region is fine for a private instance; ap-southeast-1
  keeps latency to MY users low).
- Rate limiting: in-memory per process by default; set `RATE_LIMIT_REDIS_URL` for
  multi-instance.
- Never proxy production traffic through public OSM demo servers
  (`tile.openstreetmap.org`, `nominatim.openstreetmap.org`, `router.project-osrm.org`) —
  against usage policy and unstable.

## Data licensing notes

OpenStreetMap-derived layers are **ODbL**: if you distribute a database including OSM
data, the whole database is share-alike — keep community/user-submitted layers in
separate schemas so they remain separable. See ATTRIBUTION.md.