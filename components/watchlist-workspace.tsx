"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { PaperCard } from "@/components/paper-card";
import {
  getContentTypeDisplayValue,
  isWorksheetFieldMissing,
  toWorksheetExportRow,
} from "@/lib/curation";
import type { PaperRecord } from "@/lib/papers";

type WatchlistWorkspaceProps = {
  initialPapers: PaperRecord[];
};

const worksheetHeaders = [
  "Source_Paper",
  "Source_Paper_Link",
  "Type",
  "Included",
  "Source_Paper_Quality (1–10)",
  "Curated_By",
  "Notes",
];

function MissingBadge() {
  return (
    <span className="inline-flex rounded-full border border-ember/30 bg-ember/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-ember">
      Missing
    </span>
  );
}

function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4">
      <div className="w-full max-w-lg rounded-[1.5rem] border border-[var(--line)] bg-white p-6 shadow-card">
        <h3 className="text-lg font-semibold text-ink">Confirm export state</h3>
        <p className="mt-3 text-sm leading-7 text-slate">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-ink px-4 py-2 text-sm text-white"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export function WatchlistWorkspace({ initialPapers }: WatchlistWorkspaceProps) {
  const [papers, setPapers] = useState(initialPapers);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [showExported, setShowExported] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [confirmBulkCount, setConfirmBulkCount] = useState<number | null>(null);

  const exportFilteredPapers = useMemo(
    () =>
      papers.filter((paper) => {
        if (!showExported && paper.worksheetExportedAt) {
          return false;
        }
        return true;
      }),
    [papers, showExported],
  );

  const visiblePapers = useMemo(
    () =>
      exportFilteredPapers.filter((paper) => {
        if (!showMissingOnly) {
          return true;
        }
        return isWorksheetFieldMissing(paper);
      }),
    [exportFilteredPapers, showMissingOnly],
  );

  function flashStatus(message: string) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), 1800);
  }

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    flashStatus(label);
  }

  function updatePaperInState(updatedPaper: PaperRecord) {
    setPapers((current) => {
      if (!updatedPaper.watchlisted) {
        return current.filter((entry) => entry.id !== updatedPaper.id);
      }

      const exists = current.some((entry) => entry.id === updatedPaper.id);
      if (!exists) {
        return [updatedPaper, ...current];
      }

      return current.map((entry) => (entry.id === updatedPaper.id ? updatedPaper : entry));
    });
  }

  async function markPaperExported(paperId: string, exported: boolean, label: string) {
    const existingPaper = papers.find((paper) => paper.id === paperId);
    if (!existingPaper) {
      return;
    }

    const optimisticPaper = {
      ...existingPaper,
      worksheetExportedAt: exported ? new Date().toISOString() : null,
    };
    updatePaperInState(optimisticPaper);

    const response = await fetch(`/api/papers/${paperId}/worksheet-export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exported }),
    });
    const payload = (await response.json()) as PaperRecord | { error?: string };

    if (!response.ok || "error" in payload || !("id" in payload)) {
      updatePaperInState(existingPaper);
      flashStatus("error" in payload && payload.error ? payload.error : "Failed to update exported state.");
      return;
    }

    updatePaperInState(payload);
    flashStatus(label);
  }

  async function markAllShownExported() {
    const paperIds = visiblePapers.map((paper) => paper.id);
    if (paperIds.length === 0) {
      setConfirmBulkCount(null);
      return;
    }

    const now = new Date().toISOString();
    const previousPapers = papers;
    setConfirmBulkCount(null);
    setPapers((current) =>
      current.map((paper) =>
        paperIds.includes(paper.id) ? { ...paper, worksheetExportedAt: now } : paper,
      ),
    );

    const response = await fetch("/api/papers/worksheet-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperIds, exported: true }),
    });
    const payload = (await response.json()) as { worksheetExportedAt?: string | null; error?: string };

    if (!response.ok || payload.error) {
      setPapers(previousPapers);
      flashStatus(payload.error ?? "Failed to mark papers exported.");
      return;
    }

    const exportedAt = payload.worksheetExportedAt ?? now;
    setPapers((current) =>
      current.map((paper) =>
        paperIds.includes(paper.id) ? { ...paper, worksheetExportedAt: exportedAt } : paper,
      ),
    );
    flashStatus(`Marked ${paperIds.length} papers exported`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-6">
        <div>
          <p className="text-sm uppercase tracking-[0.26em] text-ember">Watchlist</p>
          <h1 className="mt-2 font-[var(--font-serif)] text-4xl leading-tight text-ink sm:text-5xl">
            Worksheet export for curated papers.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
            Use watchlisted papers as the worksheet staging area, fill the curation block on each
            paper, then copy individual TSV rows or the whole set.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/exclude"
            className="border border-[var(--line)] bg-white px-4 py-2 text-sm text-ink"
          >
            Exclude list
          </Link>
          <Link
            href="/papers"
            className="border border-[var(--line)] bg-white px-4 py-2 text-sm text-ink"
          >
            Back to papers
          </Link>
        </div>
      </div>

      <section className="border border-[var(--line)] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Worksheet Export</h2>
            <p className="text-sm text-slate">
              Columns are exported as tab-separated values in the exact worksheet order.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {statusMessage ? <span className="text-xs text-moss">{statusMessage}</span> : null}
            <button
              type="button"
              onClick={() => setConfirmBulkCount(visiblePapers.length)}
              disabled={visiblePapers.length === 0}
              className="border border-[var(--line)] px-4 py-2 text-sm text-ink disabled:opacity-60"
            >
              Mark all shown exported
            </button>
            <button
              type="button"
              onClick={() => copyText(visiblePapers.map(toWorksheetExportRow).join("\n"), "Copied all rows")}
              className="bg-ink px-4 py-2 text-sm text-white"
            >
              Copy all
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={showMissingOnly}
                onChange={(event) => setShowMissingOnly(event.target.checked)}
              />
              Show only missing worksheet fields
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={showExported}
                onChange={(event) => setShowExported(event.target.checked)}
              />
              Show exported
            </label>
          </div>
          <div className="text-sm text-slate">
            {visiblePapers.length} of {papers.length} watchlisted papers shown
          </div>
        </div>

        <div className="overflow-x-auto border border-[var(--line)]">
          <table className="min-w-full divide-y divide-[var(--line)] text-sm">
            <thead className="bg-sand/60">
              <tr>
                {worksheetHeaders.map((header) => (
                  <th key={header} className="px-4 py-3 text-left font-semibold text-ink">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] bg-white/70">
              {visiblePapers.map((paper) => (
                <tr key={paper.id}>
                  <td className="px-4 py-3 align-top">
                    {paper.worksheetCitationText ? paper.worksheetCitationText : <MissingBadge />}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {paper.worksheetSourceLink ? (
                      <a
                        href={paper.worksheetSourceLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ember underline"
                      >
                        {paper.worksheetSourceLink}
                      </a>
                    ) : (
                      <MissingBadge />
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {getContentTypeDisplayValue(
                      paper.contentTypePrimary,
                      paper.contentTypeSecondary,
                      paper.contentTypeOtherText,
                    ) || <MissingBadge />}
                  </td>
                  <td className="px-4 py-3 align-top" />
                  <td className="px-4 py-3 align-top">{paper.qualityScore ?? ""}</td>
                  <td className="px-4 py-3 align-top" />
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      {paper.worksheetNote ?? ""}
                      {!paper.worksheetCitationText ||
                      !paper.worksheetSourceLink ||
                      !getContentTypeDisplayValue(
                        paper.contentTypePrimary,
                        paper.contentTypeSecondary,
                        paper.contentTypeOtherText,
                      ) ||
                      !paper.worksheetNote ? (
                        <MissingBadge />
                      ) : null}
                      {paper.worksheetExportedAt ? (
                        <span className="inline-flex rounded-full border border-moss/20 bg-moss/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-moss">
                          Exported
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(toWorksheetExportRow(paper), `Copied row for ${paper.title}`)}
                        className="border border-[var(--line)] px-3 py-1.5 text-xs text-ink"
                      >
                        Copy row
                      </button>
                      {paper.worksheetExportedAt && showExported ? (
                        <button
                          type="button"
                          onClick={() => markPaperExported(paper.id, false, "Unmarked exported")}
                          className="border border-[var(--line)] px-3 py-1.5 text-xs text-ink"
                        >
                          Unmark
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => markPaperExported(paper.id, true, "Marked exported")}
                          className="border border-[var(--line)] px-3 py-1.5 text-xs text-ink"
                        >
                          Mark exported
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {visiblePapers.length === 0 ? (
        <div className="border border-dashed border-[var(--line)] bg-white p-8 text-center text-sm text-slate">
          No watchlisted papers match the current worksheet filter.
        </div>
      ) : (
        <div className="space-y-4">
          {visiblePapers.map((paper, index) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              view="list"
              listIndex={index}
              onPaperUpdate={updatePaperInState}
            />
          ))}
        </div>
      )}

      {confirmBulkCount != null ? (
        <ConfirmModal
          message={`Mark ${confirmBulkCount} papers as exported? They will be hidden by default but still viewable with 'Show exported'.`}
          onCancel={() => setConfirmBulkCount(null)}
          onConfirm={markAllShownExported}
        />
      ) : null}
    </div>
  );
}
