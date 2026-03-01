"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";

import { PaperCard } from "@/components/paper-card";
import type { PaperRecord } from "@/lib/papers";

type Preset = "all" | "weekly" | "watchlist";
type SortKey = "newest" | "relevance";
type ViewMode = "list" | "card";

type PapersRadarProps = {
  papers: PaperRecord[];
  tags: string[];
  initialPreset: string;
  initialSort: string;
  initialSearch: string;
  initialMonthStart: string;
  initialMonthEnd: string;
  initialPage: number;
  initialView: string;
  initialSelectedTags: string[];
  initialShowWatchlisted: boolean;
  initialShowExcluded: boolean;
};

const tabOptions: { id: Preset; label: string; description: string }[] = [
  { id: "all", label: "All Papers", description: "Full library view" },
  { id: "weekly", label: "Weekly", description: "Recent additions to review" },
  { id: "watchlist", label: "Watchlist", description: "Tracked papers for follow-up" },
];

const CORE_TOPIC_TERMS = [
  "alignment faking",
  "deceptive alignment",
  "ai intentions",
  "intentions",
  "internal goals",
  "hidden objective",
  "hidden objectives",
  "situational awareness",
  "scheming",
  "strategic compliance",
  "sleeper agent",
];

const RELATED_TOPIC_TERMS = [
  "deception",
  "deceptive",
  "sandbagging",
  "goal misgeneralization",
  "conditional refusal",
  "policy evasion",
  "evaluator gaming",
];

const ADJACENT_TOPIC_TERMS = [
  "jailbreak",
  "prompt injection",
  "reward hacking",
  "specification gaming",
  "red team",
  "red teaming",
  "safety evaluation",
  "misalignment",
  "misbehavior",
  "robustness",
];
const PAGE_SIZE = 25;

function normalizeMonthValue(value: string, fallback: string) {
  return /^\d{4}-\d{2}$/.test(value) ? value : fallback;
}

function isMonthValue(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function monthValueToStartDate(value: string) {
  return new Date(`${value}-01T00:00:00.000Z`);
}

function monthValueToEndDate(value: string) {
  const [year, month] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
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

function getRecentDefaultMonthStart(currentMonth: string) {
  return shiftMonthValue(currentMonth, -2);
}

function normalizePageValue(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function accumulateTierScore(text: string, terms: string[], weight: number, score: number) {
  return terms.reduce((nextScore, term) => (text.includes(term) ? nextScore + weight : nextScore), score);
}

function computeTopicRelevanceScore(paper: PaperRecord) {
  const title = paper.title.toLowerCase();
  const abstract = paper.abstract.toLowerCase();
  const tags = paper.tags.join(" ").toLowerCase();

  let score = 0;
  score = accumulateTierScore(title, CORE_TOPIC_TERMS, 16, score);
  score = accumulateTierScore(tags, CORE_TOPIC_TERMS, 10, score);
  score = accumulateTierScore(abstract, CORE_TOPIC_TERMS, 6, score);

  score = accumulateTierScore(title, RELATED_TOPIC_TERMS, 9, score);
  score = accumulateTierScore(tags, RELATED_TOPIC_TERMS, 6, score);
  score = accumulateTierScore(abstract, RELATED_TOPIC_TERMS, 3, score);

  score = accumulateTierScore(title, ADJACENT_TOPIC_TERMS, 4, score);
  score = accumulateTierScore(tags, ADJACENT_TOPIC_TERMS, 2, score);
  score = accumulateTierScore(abstract, ADJACENT_TOPIC_TERMS, 1, score);

  return score;
}

export function PapersRadar({
  papers,
  tags,
  initialPreset,
  initialSort,
  initialSearch,
  initialMonthStart,
  initialMonthEnd,
  initialPage,
  initialView,
  initialSelectedTags,
  initialShowWatchlisted,
  initialShowExcluded,
}: PapersRadarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentMonth = getLocalMonthValue();
  const defaultMonthStart = getRecentDefaultMonthStart(currentMonth);

  const [allPapers, setAllPapers] = useState(papers);
  const [preset, setPreset] = useState<Preset>(
    initialPreset === "weekly" || initialPreset === "watchlist" ? initialPreset : "all",
  );
  const [sort, setSort] = useState<SortKey>(initialSort === "relevance" ? "relevance" : "newest");
  const [view, setView] = useState<ViewMode>(initialView === "card" ? "card" : "list");
  const [search, setSearch] = useState(initialSearch);
  const [monthStart, setMonthStart] = useState(normalizeMonthValue(initialMonthStart, defaultMonthStart));
  const [monthEnd, setMonthEnd] = useState(normalizeMonthValue(initialMonthEnd, currentMonth));
  const [monthStartInput, setMonthStartInput] = useState(
    normalizeMonthValue(initialMonthStart, defaultMonthStart),
  );
  const [monthEndInput, setMonthEndInput] = useState(
    normalizeMonthValue(initialMonthEnd, currentMonth),
  );
  const [currentPage, setCurrentPage] = useState(normalizePageValue(initialPage));
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialSelectedTags.filter((tag) => tags.includes(tag)),
  );
  const [showWatchlisted, setShowWatchlisted] = useState(initialShowWatchlisted);
  const [showExcluded, setShowExcluded] = useState(initialShowExcluded);
  const deferredSearch = useDeferredValue(search);
  const isLegacyArchiveDefault =
    initialPreset === "all" &&
    initialSort === "newest" &&
    initialSearch.trim() === "" &&
    initialSelectedTags.length === 0 &&
    !initialShowWatchlisted &&
    !initialShowExcluded &&
    initialMonthStart === "2023-01" &&
    initialMonthEnd === currentMonth;

  useEffect(() => {
    setMonthStartInput(monthStart);
  }, [monthStart]);

  useEffect(() => {
    setMonthEndInput(monthEnd);
  }, [monthEnd]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("preset", preset);
    params.set("sort", sort);
    params.set("view", view);
    params.set("monthStart", monthStart);
    params.set("monthEnd", monthEnd);
    params.set("page", String(currentPage));

    if (deferredSearch.trim()) {
      params.set("q", deferredSearch.trim());
    }
    if (selectedTags.length > 0) {
      params.set("tags", selectedTags.join(","));
    }
    params.set("showWatchlisted", showWatchlisted ? "1" : "0");
    params.set("showExcluded", showExcluded ? "1" : "0");

    const nextUrl = `${pathname}?${params.toString()}` as Parameters<typeof router.replace>[0];

    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }, [currentPage, deferredSearch, monthEnd, monthStart, pathname, preset, router, selectedTags, showExcluded, showWatchlisted, sort, view]);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, monthEnd, monthStart, preset, selectedTags, showExcluded, showWatchlisted, sort]);

  useEffect(() => {
    if (!isLegacyArchiveDefault) {
      return;
    }

    setMonthStart(defaultMonthStart);
    setMonthEnd(currentMonth);
    setMonthStartInput(defaultMonthStart);
    setMonthEndInput(currentMonth);
    setCurrentPage(1);
  }, [currentMonth, defaultMonthStart, isLegacyArchiveDefault]);

  function commitMonthStart(nextValue: string) {
    if (isMonthValue(nextValue)) {
      setMonthStart(nextValue);
      setMonthStartInput(nextValue);
      return;
    }
    setMonthStartInput(monthStart);
  }

  function commitMonthEnd(nextValue: string) {
    if (isMonthValue(nextValue)) {
      setMonthEnd(nextValue);
      setMonthEndInput(nextValue);
      return;
    }
    setMonthEndInput(monthEnd);
  }

  function handlePaperUpdate(updatedPaper: PaperRecord) {
    setAllPapers((current) =>
      current.map((paper) =>
        paper.id === updatedPaper.id ? updatedPaper : paper,
      ),
    );
  }

  function toggleTag(tagName: string) {
    setSelectedTags((current) =>
      current.includes(tagName)
        ? current.filter((tag) => tag !== tagName)
        : [...current, tagName].sort((left, right) => left.localeCompare(right)),
    );
  }

  const filteredPapers = allPapers
    .filter((paper) => {
      const publishedAt = new Date(paper.publishedAt);
      const matchesPreset =
        preset === "all"
          ? publishedAt >= new Date("2023-01-01T00:00:00.000Z")
          : preset === "weekly"
            ? publishedAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            : paper.watchlisted;

      if (!matchesPreset) {
        return false;
      }

      if ((preset === "all" || preset === "weekly") && !showWatchlisted && paper.watchlisted) {
        return false;
      }

      if (paper.isExcluded && (preset === "weekly" || preset === "all") && !showExcluded) {
        return false;
      }

      const publishedTime = publishedAt.getTime();
      if (
        publishedTime < monthValueToStartDate(monthStart).getTime() ||
        publishedTime > monthValueToEndDate(monthEnd).getTime()
      ) {
        return false;
      }

      if (
        deferredSearch.trim() &&
        !`${paper.title} ${paper.abstract}`
          .toLowerCase()
          .includes(deferredSearch.trim().toLowerCase())
      ) {
        return false;
      }

      if (selectedTags.length > 0 && !selectedTags.every((tag) => paper.tags.includes(tag))) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      if (sort === "relevance") {
        const scoreDifference = computeTopicRelevanceScore(right) - computeTopicRelevanceScore(left);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }
      }

      return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    });

  const totalPages = Math.max(1, Math.ceil(filteredPapers.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedPapers = filteredPapers.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE,
  );

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 border-b border-[var(--line)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-8">
          {tabOptions.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPreset(tab.id)}
              className={clsx(
                "border px-4 py-3 text-left text-sm transition",
                preset === tab.id
                  ? "border-ember bg-white text-ink shadow-sm"
                  : "border-[var(--line)] bg-white text-slate hover:border-[var(--line-strong)] hover:text-ink",
              )}
            >
              <span className="block font-semibold">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 self-start border border-[var(--line)] bg-white p-1">
          <Link
            href="/exclude"
            className="border border-[var(--line)] bg-white px-4 py-2 text-sm text-ink transition hover:border-[var(--line-strong)]"
          >
            Exclude list
          </Link>
          <Link
            href="/watchlist"
            className="border border-[var(--line)] bg-white px-4 py-2 text-sm text-ink transition hover:border-[var(--line-strong)]"
          >
            Open watchlist workspace
          </Link>
          {(["list", "card"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={clsx(
                "px-4 py-2 text-sm",
                view === mode ? "bg-ink text-white" : "text-slate",
              )}
            >
              {mode === "list" ? "List" : "Cards"}
            </button>
          ))}
        </div>
      </div>

      <section className="grid gap-4 border border-[var(--line)] bg-white p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_220px_220px]">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-ink">Search title + abstract</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="alignment faking, deception, oversight..."
            className="border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-ink"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-ink">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-ink"
          >
            <option value="newest">Newest</option>
            <option value="relevance">Topic relevance</option>
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-ink">Month start</span>
          <input
            type="month"
            min="2023-01"
            max={currentMonth}
            value={monthStartInput}
            onChange={(event) => {
              setMonthStartInput(event.target.value);
              if (isMonthValue(event.target.value)) {
                setMonthStart(event.target.value);
              }
            }}
            onBlur={(event) => commitMonthStart(event.target.value)}
            className="border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-ink"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-ink">Month end</span>
          <input
            type="month"
            min="2023-01"
            max={currentMonth}
            value={monthEndInput}
            onChange={(event) => {
              setMonthEndInput(event.target.value);
              if (isMonthValue(event.target.value)) {
                setMonthEnd(event.target.value);
              }
            }}
            onBlur={(event) => commitMonthEnd(event.target.value)}
            className="border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-ink"
          />
        </label>

        <div className="lg:col-span-full">
          <div className="mb-3 flex flex-wrap items-center gap-4">
            {preset !== "watchlist" ? (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={showWatchlisted}
                  onChange={(event) => setShowWatchlisted(event.target.checked)}
                />
                Show watchlisted
              </label>
            ) : null}
            {preset !== "watchlist" ? (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={showExcluded}
                  onChange={(event) => setShowExcluded(event.target.checked)}
                />
                Show excluded
              </label>
            ) : null}
          </div>

          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-ink">Tags</span>
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="text-slate underline decoration-transparent transition hover:text-ink hover:decoration-current"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tagName) => {
              const active = selectedTags.includes(tagName);
              return (
                <button
                  key={tagName}
                  type="button"
                  onClick={() => toggleTag(tagName)}
                  className={clsx(
                    "border px-3 py-1.5 text-sm transition",
                    active
                      ? "border-moss bg-moss text-white"
                      : "border-[var(--line-strong)] bg-white text-ink hover:border-moss hover:text-moss",
                  )}
                >
                  {tagName}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate">
        <div>
          Showing{" "}
          <span className="font-semibold text-ink">
            {filteredPapers.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1}-
            {Math.min(safeCurrentPage * PAGE_SIZE, filteredPapers.length)}
          </span>{" "}
          of <span className="font-semibold text-ink">{filteredPapers.length}</span> papers
        </div>
        <button
          type="button"
          onClick={() => {
            setPreset("all");
            setSort("newest");
            setView("list");
            setSearch("");
            setMonthStart(defaultMonthStart);
            setMonthEnd(currentMonth);
            setMonthStartInput(defaultMonthStart);
            setMonthEndInput(currentMonth);
            setSelectedTags([]);
            setShowWatchlisted(false);
            setShowExcluded(false);
            setCurrentPage(1);
          }}
          className="border border-[var(--line)] px-4 py-2 text-sm hover:border-ink hover:text-ink"
        >
          Reset filters
        </button>
      </div>

      {filteredPapers.length === 0 ? (
        <div className="border border-dashed border-[var(--line)] bg-white p-8 text-center text-sm text-slate">
          No papers match the current preset and filters.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--line)] bg-white px-4 py-3 text-sm text-slate">
            <div>
              Page <span className="font-semibold text-ink">{safeCurrentPage}</span> of{" "}
              <span className="font-semibold text-ink">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage === 1}
                className={clsx(
                  "border px-3 py-1.5 transition",
                  safeCurrentPage === 1
                    ? "cursor-not-allowed border-[var(--line)] text-slate/50"
                    : "border-[var(--line)] bg-white text-ink hover:border-ink",
                )}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage === totalPages}
                className={clsx(
                  "border px-3 py-1.5 transition",
                  safeCurrentPage === totalPages
                    ? "cursor-not-allowed border-[var(--line)] text-slate/50"
                    : "border-[var(--line)] bg-white text-ink hover:border-ink",
                )}
              >
                Next
              </button>
            </div>
          </div>

          <div className={clsx("gap-4", view === "card" ? "grid md:grid-cols-2" : "space-y-4")}>
          {paginatedPapers.map((paper, index) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              view={view}
              listIndex={(safeCurrentPage - 1) * PAGE_SIZE + index}
              onPaperUpdate={handlePaperUpdate}
            />
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
