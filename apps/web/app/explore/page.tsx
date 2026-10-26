import { getBetterAuthSessionUser } from "@/lib/auth";
import { listCustomLists, listSavedPlaces } from "@/lib/store";
import { fetchLiveMalaysianTransit } from "@/lib/transit";
import MapClient from "../map-client";

export const dynamic = "force-dynamic";

/**
 * `/explore` — full research/mapping workstation (formerly the homepage).
 * Everything that already shipped for Mapistic stays here: corridor presets,
 * BM normalizer search, multi-modal routing, saved places & lists, GTFS
 * transit layer, moderation/quality links. The homepage `/` is now the
 * simplified GPS navigation app (nav-client).
 */
export default async function ExplorePage() {
  const user = await getBetterAuthSessionUser();
  const [savedPlaces, customLists, transit] = await Promise.all([
    user ? listSavedPlaces(user.id).catch(() => []) : Promise.resolve([]),
    user ? listCustomLists(user.id).catch(() => []) : Promise.resolve([]),
    fetchLiveMalaysianTransit(),
  ]);

  return (
    <MapClient
      user={user}
      initialSavedPlaces={savedPlaces}
      initialLists={customLists}
      initialTransit={transit}
    />
  );
}