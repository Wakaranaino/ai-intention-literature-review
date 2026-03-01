"use client";

import { useState } from "react";
import Link from "next/link";

type ImportSummary = {
  imported: number;
  duplicatesSkipped: number;
  invalidCount: number;
  invalidLines: string[];
};

export function ExcludeWorkspace({ initialCount }: { initialCount: number }) {
  const [input, setInput] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [excludedCount, setExcludedCount] = useState(initialCount);

  function flashStatus(message: string) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), 2000);
  }

  async function handleImport() {
    setIsImporting(true);
    try {
      const response = await fetch("/api/excluded-papers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });

      const payload = (await response.json()) as
        | (ImportSummary & { error?: undefined })
        | { error?: string };

      if (!response.ok || ("error" in payload && payload.error)) {
        flashStatus("error" in payload && payload.error ? payload.error : "Import failed.");
        return;
      }

      const nextSummary = payload as ImportSummary;
      setSummary(nextSummary);
      setExcludedCount((current) => current + nextSummary.imported);
      flashStatus(`Imported ${nextSummary.imported} excluded papers`);
    } catch (error) {
      flashStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-6">
        <div>
          <p className="text-sm uppercase tracking-[0.26em] text-ember">Exclude</p>
          <h1 className="mt-2 font-[var(--font-serif)] text-4xl leading-tight text-ink sm:text-5xl">
            Hide papers already recorded in the shared worksheet.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
            Paste paper links from the worksheet to keep already-recorded items out of the default
            All Papers and Weekly review queues.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/papers"
            className="border border-[var(--line)] bg-white px-4 py-2 text-sm text-ink"
          >
            Back to papers
          </Link>
          <Link
            href="/watchlist"
            className="border border-[var(--line)] bg-white px-4 py-2 text-sm text-ink"
          >
            Watchlist workspace
          </Link>
        </div>
      </div>

      <section className="border border-[var(--line)] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Exclude list import</h2>
            <p className="text-sm text-slate">
              {excludedCount} excluded paper{excludedCount === 1 ? "" : "s"} currently stored.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {statusMessage ? <span className="text-xs text-moss">{statusMessage}</span> : null}
            <button
              type="button"
              onClick={() => setInput("")}
              className="border border-[var(--line)] px-4 py-2 text-sm text-ink"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={isImporting}
              className="bg-ink px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {isImporting ? "Importing..." : "Import"}
            </button>
          </div>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-ink">Paste paper links (one per line)</span>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="https://arxiv.org/abs/2602.22983&#10;https://openreview.net/forum?id=abc123&#10;https://doi.org/10.1234/example"
            rows={12}
            className="mt-2 w-full border border-[var(--line)] bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-ink"
          />
        </label>

        {summary ? (
          <div className="mt-5 space-y-3 border border-[var(--line)] bg-[var(--panel-alt)] p-4 text-sm text-slate">
            <div className="flex flex-wrap gap-5">
              <span>
                Imported: <strong className="text-ink">{summary.imported}</strong>
              </span>
              <span>
                Duplicates skipped:{" "}
                <strong className="text-ink">{summary.duplicatesSkipped}</strong>
              </span>
              <span>
                Invalid lines: <strong className="text-ink">{summary.invalidCount}</strong>
              </span>
            </div>
            {summary.invalidLines.length > 0 ? (
              <div>
                <p className="font-medium text-ink">Invalid lines</p>
                <ul className="mt-2 space-y-1 text-xs leading-6 text-slate">
                  {summary.invalidLines.map((line, index) => (
                    <li key={`${line}-${index}`}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
