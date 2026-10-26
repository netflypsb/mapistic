import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { generateUpstreamOsmOscXml, listCommunityEdits } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function CommunityModerationPage() {
  const user = await getSessionUser();
  const [edits, oscPreview] = await Promise.all([
    listCommunityEdits().catch(() => []),
    generateUpstreamOsmOscXml().catch(() => ""),
  ]);

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-4 pt-16 pb-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="solaris-badge bg-amber-100 text-amber-900">
            ODbL Collective Database Safe Harbor · Moderator: {user.email}
          </span>
          <h1 className="font-serif text-4xl mt-2">Community POI &amp; Road Edit Moderation Queue</h1>
          <p className="text-sm text-[#57534e] mt-1">
            Review user-submitted missing places, flood alerts, and road closures. Approved fixes export as standard OpenStreetMap <code>.osc</code> v0.6 XML changesets.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className="solaris-btn-secondary text-xs">
            Dashboard
          </Link>
          <Link href="/" className="solaris-btn-secondary text-xs">
            ← Back to Map
          </Link>
        </div>
      </div>

      <div className="solaris-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Submitted Edits ({edits.length})</h2>
          <a href="/api/v1/places?format=osc" className="solaris-btn-primary text-xs">
            ⬇ Export Approved Edits as OSMChange (`.osc` XML)
          </a>
        </div>

        <div className="space-y-3">
          {edits.map((e) => (
            <div
              key={e.id}
              className="p-4 rounded-xl bg-[#faf8f5] border border-[#e7e5e4] flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-bold text-sm">
                  [{e.edit_type.toUpperCase()}] {e.name_ms} / {e.name_en}
                </div>
                <div className="text-[#57534e] mt-0.5">
                  {e.notes} · {e.postcode} {e.state} ({Number(e.lat).toFixed(3)}, {Number(e.lon).toFixed(3)})
                </div>
              </div>
              <span
                className={`solaris-badge uppercase ${
                  e.moderation_status === "approved"
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-amber-100 text-amber-900"
                }`}
              >
                {e.moderation_status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="solaris-card p-6 space-y-2">
        <h2 className="font-bold text-base">Live Upstream OSMChange (`.osc` v0.6 XML) Preview</h2>
        <pre className="p-4 rounded-xl bg-[#1c1917] text-stone-100 text-xs font-mono overflow-x-auto">
          {oscPreview}
        </pre>
      </div>
    </div>
  );
}
