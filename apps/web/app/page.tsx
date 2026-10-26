import { getBetterAuthSessionUser } from "@/lib/auth";
import NavigationApp from "./nav-client";

export const dynamic = "force-dynamic";

/**
 * Mapistic homepage — simplified GPS NAVIGATION APP (Google-Maps style):
 * one search box, one live map, real GPS location + live movement tracking.
 * The full workstation (transit layers, saved places, POI tools) lives at /explore.
 */
export default async function MapisticHomePage() {
  await getBetterAuthSessionUser();

  return <NavigationApp />;
}
