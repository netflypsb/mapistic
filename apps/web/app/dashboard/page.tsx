import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { listCommunityEdits, listCustomLists, listSavedPlaces } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Mapistic Authenticated User Dashboard (`/dashboard`)
 *
 * Implements Items #1, #12, #13, and #18 of the original Mapistic issue list:
 * - Exports `dynamic = "force-dynamic"`.
 * - Calls `await getSessionUser()` which redirects to Dawnistic Hub Sign-In (`${HUB_URL}/sign-in`)
 *   when the platform session cookie is absent or invalid (never returns a fabricated user).
 * - Renders the user's saved places, custom lists, community POI submissions, and PDPA data controls.
 * - Fixed top-right `<DawnisticAccountButton />` is inherited from `apps/web/app/layout.tsx`.
 */
export default async function MapisticDashboardPage() {
  const user = await getSessionUser();
  const [savedPlaces, customLists, communityEdits] = await Promise.all([
    listSavedPlaces(user.id).catch(() => []),
    listCustomLists(user.id).catch(() => []),
    listCommunityEdits().catch(() => []),
  ]);

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 pt-16 pb-12 space-y-8">
      <header className="solaris-card p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="solaris-badge bg-emerald-100 text-emerald-900">
            Dawnistic Shared SSO · Mapistic Personal Workspace
          </span>
          <h1 className="font-serif text-3xl mt-1">Mapistic Dashboard</h1>
          <p className="text-xs text-[#57534e] mt-0.5">
            Signed in as <strong>{user.email}</strong> ({user.id}) · Synced across Dawnistic products
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <Link href="/" className="solaris-btn-primary text-xs">
            🗺️ Open Interactive Map
          </Link>
          <Link href="/moderation" className="solaris-btn-secondary text-xs">
            POI Moderation &amp; .OSC Export
          </Link>
          <Link href="/quality" className="solaris-btn-secondary text-xs">
            Data Quality
          </Link>
          <Link href="/docs/mcp" className="solaris-btn-secondary text-xs">
            MCP Docs
          </Link>
        </nav>
      </header>

      <section className="grid md:grid-cols-3 gap-6">
        <div className="solaris-card p-6 space-y-3">
          <h2 className="font-bold text-lg">Saved Places ({savedPlaces.length})</h2>
          <p className="text-xs text-[#57534e]">
            Stored in <code>mapistic.saved_places</code> (PostGIS <code>geometry(Point, 4326)</code>):
          </p>
          <div className="space-y-2">
            {savedPlaces.length === 0 ? (
              <div className="text-xs text-[#57534e] italic">
                No saved places yet. Pin any location on the map to save it to your Dawnistic account.
              </div>
            ) : (
              savedPlaces.map((sp) => (
                <div key={sp.id} className="p-3 rounded-xl bg-[#faf8f5] border border-[#e7e5e4] text-xs">
                  <div className="font-bold">
                    [{sp.label}] {sp.place_name}
                  </div>
                  <div className="text-[#57534e]">
                    {sp.address} ({sp.postcode} {sp.state})
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="solaris-card p-6 space-y-3">
          <h2 className="font-bold text-lg">Custom Place Lists ({customLists.length})</h2>
          <p className="text-xs text-[#57534e]">
            Shareable place collections stored in <code>mapistic.lists</code>:
          </p>
          <div className="space-y-2">
            {customLists.map((lst) => (
              <div key={lst.id} className="p-3 rounded-xl bg-[#faf8f5] border border-[#e7e5e4] text-xs">
                <div className="font-bold">{lst.title}</div>
                <div className="text-[#57534e]">{lst.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="solaris-card p-6 space-y-3">
          <h2 className="font-bold text-lg">PDPA Privacy &amp; Upstream OSM</h2>
          <p className="text-xs text-[#57534e]">
            Malaysia PDPA compliant: server logs truncate coordinates to 3 decimals (<code>~110m</code>) and{" "}
            <code>recent_searches</code> opt-in defaults to <strong>OFF</strong>.
          </p>
          <div className="space-y-2 pt-2">
            <a href="/api/v1/privacy" className="solaris-btn-secondary text-xs w-full">
              ⬇ Export My Mapistic Data (JSON)
            </a>
            <a href="/api/v1/places?format=osc" className="solaris-btn-secondary text-xs w-full">
              ⬇ Download Approved OSMChange (`.osc`)
            </a>
          </div>
          <div className="text-[11px] text-[#57534e] pt-1">
            Community edits in queue: <strong>{communityEdits.length}</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
