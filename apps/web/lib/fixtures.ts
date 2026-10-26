/**
 * Mapistic Development Fixtures (`apps/web/lib/fixtures.ts`)
 *
 * Implements Items #5 & #10 of the original Mapistic issue list:
 * - All seed arrays live here and are ONLY read when `process.env.MAPISTIC_FIXTURES === "1"` (default OFF).
 */

import type { CustomPlaceList, PoiEditSubmission, SavedPlaceItem } from "./store";

export function isFixturesModeEnabled(): boolean {
  return process.env.MAPISTIC_FIXTURES === "1";
}

export const FIXTURE_SAVED_PLACES: SavedPlaceItem[] = [
  {
    id: 1,
    user_id: "fixture_user",
    label: "Home",
    place_name: "Taman Tun Dr Ismail (TTDI)",
    address: "Jalan Wan Kadir, Taman Tun Dr Ismail",
    postcode: "60000",
    state: "Kuala Lumpur",
    lat: 3.1361,
    lon: 101.6308,
  },
  {
    id: 2,
    user_id: "fixture_user",
    label: "Office",
    place_name: "Petronas Twin Towers (KLCC)",
    address: "Jalan Ampang, Kuala Lumpur City Centre",
    postcode: "50088",
    state: "Kuala Lumpur",
    lat: 3.1579,
    lon: 101.7116,
  },
];

export const FIXTURE_CUSTOM_LISTS: CustomPlaceList[] = [
  {
    id: 1,
    slug: "malaysia-iconic-corridors",
    title: "Iconic Malaysia & Borneo Landmarks",
    description: "Fixture list (MAPISTIC_FIXTURES=1)",
    places: [
      { name: "Petronas Twin Towers (KLCC)", state: "Kuala Lumpur", lat: 3.1579, lon: 101.7116 },
      { name: "Pasar Siti Khadijah, Kota Bharu", state: "Kelantan", lat: 6.1333, lon: 102.2386 },
    ],
  },
];

export const FIXTURE_COMMUNITY_EDITS: PoiEditSubmission[] = [
  {
    id: 1,
    submitted_by: "fixture@localhost",
    edit_type: "new_poi",
    name_ms: "Klinik Komuniti Wakaf Che Yeh",
    name_en: "Wakaf Che Yeh Community Clinic",
    category: "clinic",
    notes: "24-hour clinic along Jalan Kuala Krai, Kota Bharu.",
    postcode: "15100",
    state: "Kelantan",
    lat: 6.0912,
    lon: 102.2395,
    moderation_status: "approved",
    created_at: "2026-10-22 14:20:00",
  },
];
