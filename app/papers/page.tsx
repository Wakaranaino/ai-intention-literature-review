import { PapersRadar } from "@/components/papers-radar";
import { getRadarData } from "@/lib/papers";

type SearchParams = Record<string, string | string[] | undefined>;

function getSingleParam(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }
  return value ?? fallback;
}

function getTagParams(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => entry.split(",")).filter(Boolean);
  }

  return value.split(",").filter(Boolean);
}

function getShowWatchlistedParam(params: SearchParams) {
  const explicitShow = getSingleParam(params.showWatchlisted, "");
  if (explicitShow) {
    return explicitShow === "1";
  }

  const legacyHide = getSingleParam(params.hideWatchlisted, "");
  if (legacyHide) {
    return legacyHide === "0";
  }

  return false;
}

function getMonthParam(
  value: string | string[] | undefined,
  fallback: string,
) {
  const directValue = getSingleParam(value, "");
  if (/^\d{4}-\d{2}$/.test(directValue)) {
    return directValue;
  }

  return fallback;
}

function shiftMonthValue(value: string, deltaMonths: number) {
  const [year, month] = value.split("-").map((part) => Number.parseInt(part, 10));
  const shifted = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return shifted.toISOString().slice(0, 7);
}

function getLocalMonthValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getDefaultRecentMonthStart(currentMonth: string) {
  return shiftMonthValue(currentMonth, -2);
}

function getPageParam(value: string | string[] | undefined) {
  const parsed = Number.parseInt(getSingleParam(value, "1"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function PapersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const data = await getRadarData();
  const currentMonth = getLocalMonthValue();
  const defaultRecentMonthStart = getDefaultRecentMonthStart(currentMonth);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <section className="mb-10 border-b border-[var(--line)] pb-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 text-sm uppercase tracking-[0.32em] text-ember">
                AI Intentions / Alignment Faking
              </p>
              <h1 className="max-w-4xl font-[var(--font-sans)] text-4xl font-medium leading-[1.02] tracking-[-0.03em] text-ink sm:text-5xl">
                <span className="block">
                  Research{" "}
                  <span className="italic text-[color:rgba(226,162,137,0.96)]">Radar</span> for
                </span>
                <span className="block">AI Intentions and Alignment Faking.</span>
              </h1>
              <div className="mt-5 max-w-2xl space-y-1 text-[15px] leading-7 text-slate">
                <p className="font-medium text-ink">Prototype tool. No accounts yet.</p>
                <p>Saved changes are currently shared across users.</p>
                <p>The live corpus currently focuses on papers pulled for 2026.</p>
              </div>
            </div>
            <div className="border-l border-[var(--line)] pl-5 text-sm text-slate">
              <div className="text-xs uppercase tracking-[0.18em] text-slate/80">Library status</div>
              <div className="mt-2 font-medium text-ink">
                {data.ready ? `${data.papers.length} papers indexed` : "Database not ready"}
              </div>
              <div className="mt-1">{data.tags.length} tags available</div>
            </div>
          </div>
        </section>

        {!data.ready ? (
          <div className="rounded-xl border border-dashed border-[var(--line)] bg-white p-6 text-sm text-slate">
              <p className="text-base font-medium text-ink">Database setup is still missing.</p>
              <p className="mt-2">
                Run <code>npm install</code>, <code>export DATABASE_URL="file:./dev.db"</code>,
                <code> npm run db:apply-migrations</code>, and then{" "}
                <code>npm run ingest</code>.
              </p>
              {data.error ? <p className="mt-3 text-xs text-ember">{data.error}</p> : null}
          </div>
        ) : (
          <PapersRadar
            papers={data.papers}
            tags={data.tags}
            initialPreset={getSingleParam(params.preset, "all")}
            initialSort={getSingleParam(params.sort, "newest")}
            initialSearch={getSingleParam(params.q, "")}
            initialMonthStart={getMonthParam(params.monthStart, defaultRecentMonthStart)}
            initialMonthEnd={getMonthParam(params.monthEnd, currentMonth)}
            initialPage={getPageParam(params.page)}
            initialView={getSingleParam(params.view, "list")}
            initialSelectedTags={getTagParams(params.tags)}
            initialShowWatchlisted={getShowWatchlistedParam(params)}
            initialShowExcluded={getSingleParam(params.showExcluded, "0") === "1"}
          />
        )}
      </div>
    </main>
  );
}
