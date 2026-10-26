# Mapistic Data Sources, Licensing & PDPA Compliance (`DATA_SOURCES.md`)

## 1. Geospatial Dataset & Licence Registry

| Dataset | Provider / Source URL | Licence | How Mapistic Uses It & Share-Alike Separation |
| :--- | :--- | :--- | :--- |
| **OpenStreetMap Malaysia, Singapore & Brunei Extract** | [Geofabrik Download Server (`malaysia-singapore-brunei-latest.osm.pbf`)](https://download.geofabrik.de/asia/malaysia-singapore-brunei.html) | **ODbL 1.0** (Open Database License) | Used to build base vector tiles (`PMTiles`), Valhalla routing graphs, and Photon geocoding indexes. Required attribution `© OpenStreetMap contributors` is permanently displayed on the map canvas and in the About/Attribution modal. |
| **Overture Maps Foundation — Places & Buildings Themes** | [Overture Maps Foundation](https://docs.overturemaps.org/attribution/) | **CDLA-Permissive-2.0** (Places) & **ODbL 1.0** (Buildings/Transportation) | Conflated with OSM POIs into `mapistic.osm_overture_public_pois`. Stored separately from user-submitted `mapistic.custom_pois` under ODbL's **Collective Database** provision so community/partner layers remain cleanly separable. |
| **Malaysia Official Public Transport GTFS (Static & Realtime)** | [data.gov.my Official Open API (`api.data.gov.my/gtfs-static` & `gtfs-realtime`)](https://developer.data.gov.my/realtime-api/gtfs-static) | **CC-BY-4.0** (Creative Commons Attribution 4.0) | Covers **Prasarana** (`rapid-rail-kl`, `rapid-bus-kl`, `rapid-penang`), **KTMB** (ETS, Komuter), and **BAS.MY** (Kota Bharu, Johor Bahru, Ipoh, Seremban, Kangar, Kuching). |
| **Mapistic Community POI & Road Edits** | User submissions via this deployment | **Dual CC0 1.0 / ODbL Contributor Waiver** | Moderated in `mapistic.poi_edits`. Approved fixes that belong in OpenStreetMap can be exported as standard **OSMChange (`.osc`) XML** files for upstream contribution. |

## 2. Strictly Prohibited Sources
- **Zero Google Maps Scraping/Tiles**: Mapistic never requests, scrapes, caches, or traces Google Maps tiles, Places API, or Directions API.
- **Zero Public OSM Demo Server Abuse**: Production and staging environments never hit `tile.openstreetmap.org`, `nominatim.openstreetmap.org`, or `router.project-osrm.org`.

## 3. Malaysia Personal Data Protection Act (PDPA) & Terms Additions

### Additions for your privacy page
1. **Location Data Minimization**: Live GPS coordinates used for "Locate Me" and turn-by-turn voice navigation are processed locally in your browser; when routing or reverse-geocoding requests are sent to Mapistic servers, operational logs truncate coordinates to 3 decimal places (~110m grid) and never store continuous GPS breadcrumbs.
2. **Opt-In Search History**: Saving recent searches (`recent_searches`) is **disabled by default (opt-in only)** and can be exported as JSON or permanently purged in one click via `DELETE /api/v1/privacy`.

### Navigation Safety Disclaimer additions for your terms page
1. **Advisory Navigation Only**: Mapistic routes, ETAs, toll estimates, motorcycle lane indicators, and flood/road-closure alerts are provided for planning assistance only. Road conditions—especially rural/unpaved roads in Sabah, Sarawak, and East Coast monsoon zones—can change without notice. Drivers and riders must always obey physical road signs, LLM/JKR traffic directives, and safe driving practices. Netflyp Sdn Bhd is not liable for delays, toll discrepancies, or route errors.
