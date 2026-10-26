# Data Licensing & Attribution

Mapistic application code is Apache-2.0. The **data layers** it consumes and displays have
their own licenses — attribution requirements below apply to any deployment.

| Layer | Source | License | Required attribution |
|---|---|---|---|
| Basemap vector tiles (default) | OpenFreeMap | ODbl-derived (free service) | © OpenStreetMap contributors (ODbL) · OpenFreeMap — rendered in-app |
| Routing/road network | OpenStreetMap extract (Geofabrik MY/SG/BN) | ODbL 1.0 | © OpenStreetMap contributors |
| Hosted POI layer (optional) | MYmap API — Foursquare Open Source Places + Overture Places | Apache-2.0 / CDLA-Permissive-2.0 | © Foursquare / © Overture Maps Foundation, per response metadata |
| Malaysia transit GTFS | data.gov.my | CC-BY-4.0 | Malaysia Ministry of Transport / data.gov.my |
| Community POI edits | Mapistic community | CC0 / ODbL contributor waiver | Exported upstream as OSMChange XML |

## ODbL share-alike rule (important for self-hosters)

OpenStreetMap data is ODbL: any **derivative database** containing OSM data must be
distributed under ODbL with visible attribution. Keep community/user-submitted POI layers
in **separate schemas/tables** from OSM-derived layers so they remain cleanly separable;
the app's moderation + OSMChange export keeps your contributions returnable upstream.

## Prohibited sources (project policy)

- No Google Maps scraping, tiling, or API tracing of any kind.
- No production traffic to public OSM demo/usage-limited servers
  (`tile.openstreetmap.org`, `nominatim.openstreetmap.org`, `router.project-osrm.org`).

## If you use MYmap

MYmap responses may be cached for 48 hours or streamed to the end user, never re-hosted as
a dataset copy. Terms of use: https://mymap.dawnistic.com/terms