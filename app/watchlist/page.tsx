import { WatchlistWorkspace } from "@/components/watchlist-workspace";
import { getWatchlistData } from "@/lib/papers";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const data = await getWatchlistData();

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        {!data.ready ? (
          <div className="rounded-xl border border-dashed border-[var(--line)] bg-white p-6 text-sm text-slate">
              <p className="text-base font-medium text-ink">Database setup is still missing.</p>
              <p className="mt-2">
                Run <code>npm install</code>, <code>export DATABASE_URL="file:./dev.db"</code>,
                <code> npm run db:apply-migrations</code>, and then <code>npm run ingest</code>.
              </p>
              {data.error ? <p className="mt-3 text-xs text-ember">{data.error}</p> : null}
          </div>
        ) : (
          <WatchlistWorkspace initialPapers={data.papers} />
        )}
      </div>
    </main>
  );
}
