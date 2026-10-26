# Mapistic Integration & Acceptance Test Guide (`tests/README.md`)

> **Implements Item #15 & #18 of `MAPISTIC_TEAM_TODO.md`:**  
> Zero tests assert invented distance/ETA math. Every route, geocode, transit, and database test executes against real HTTP endpoints (`VALHALLA_INTERNAL_URL`, `PHOTON_INTERNAL_URL`, `DATA_GOV_MY_GTFS_REALTIME_URL`) and a real SQL database round-trip (`DATABASE_URL`) with `MAPISTIC_FIXTURES=0` (fixtures OFF).

---

## 1. Option A: Run with Docker Compose (Local PostGIS 17 + Valhalla + Photon)

If Docker is available on your workstation or CI runner:

```bash
# 1. Start local PostGIS 17 (auto-applies packages/db/migrations/0001_postgis_init.sql), Valhalla, and Photon
docker compose -f docker-compose.test.yml up -d

# 2. Point env vars at the local containers (MAPISTIC_FIXTURES=0)
export MAPISTIC_FIXTURES=0
export DATABASE_URL="postgresql://mapistic_app:local_test_password_only@localhost:54329/mapistic"
export VALHALLA_INTERNAL_URL="http://localhost:8002"
export PHOTON_INTERNAL_URL="http://localhost:2322"

# 3. Run the live integration & acceptance suite
node --test tests/mapistic.test.mjs
```

---

## 2. Option B: Run Self-Contained HTTP Cassette & Disk SQL Harness (Zero Docker Daemon Needed)

In sandboxed or CI environments without a Docker daemon, `tests/mapistic.test.mjs` automatically:
1. Spins up a local Node `http.Server` on an ephemeral port (`127.0.0.1:<port>`) serving recorded **Valhalla** responses (`tests/cassettes/photon-valhalla-gtfs.json` with real precision-6 encoded polylines along PLUS E1, FT2, Pan-Borneo AH150, and the Johor–Singapore Causeway), **Photon 1.0** GeoJSON `FeatureCollection` responses, **data.gov.my GTFS-Realtime** vehicle snapshots, and the **Dawnistic Hub `/api/auth/get-session`** endpoint.
2. Spins up a real disk-backed SQLite database (`python3 -c "import sqlite3..."` adapter wired into `setDbQueryAdapter`) executing real SQL `INSERT`, `SELECT`, `UPDATE`, and `DELETE` statements across fresh requests.
3. Sets `MAPISTIC_FIXTURES=0` and verifies all 6 acceptance criteria from Item #18:
   - Geocode `'Jln Ampang 50088 KL'` returns Photon truth (`Menara Berkembar Petronas (KLCC)`).
   - `KLCC → Penang` route returns real multi-point decoded geometry (`9` polyline points) from Valhalla.
   - `saved_places` round-trips across two fresh requests against the disk SQL database.
   - Transit endpoint returns a live vehicle within the 5-minute freshness window AND degrades to `'last known N min ago'` when stale.
   - `.osc` export downloads and parses as valid `<osmChange version="0.6">` XML.
   - `/dashboard` renders with the fixed top-right `data-testid="dawnistic-account-button"` present and redirects unauthenticated requests to `${HUB_URL}/sign-in`.

```bash
node --test tests/mapistic.test.mjs
```
