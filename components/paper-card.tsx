"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

import {
  buildWorksheetCitationText,
  contentTypeOptions,
  extractablePotentialOptions,
  getContentTypeOptionLabel,
  getExtractablePotentialOptionLabel,
  getPreferredWorksheetSourceLink,
  inferAutoContentTypes,
} from "@/lib/curation";
import type { AICurationDraft, LocalModelSettings } from "@/lib/local-ai";
import type { PaperRecord } from "@/lib/papers";

type PaperCardProps = {
  paper: PaperRecord;
  view: "list" | "card";
  listIndex?: number;
  onPaperUpdate: (paper: PaperRecord) => void;
};

type CurationDraft = {
  worksheetCitationText: string;
  worksheetSourceLink: string;
  contentTypePrimary: string;
  contentTypeSecondary: string;
  contentTypeOtherText: string;
  qualityScore: string;
  worksheetNote: string;
  relevanceScore: string;
  extractablePotential: string;
  studyLink: string;
};

type ModalState = "none" | "hosted-warning" | "connect-model";

const APP_MODE = process.env.NEXT_PUBLIC_APP_MODE === "hosted" ? "hosted" : "local";
const LOCAL_MODEL_SETTINGS_KEY = "ai-intentions.local-model-settings";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function paperKindLabel(kind: string) {
  return kind.charAt(0) + kind.slice(1).toLowerCase();
}

function getMetaLabelParts(paper: PaperRecord) {
  const kindLabel = paperKindLabel(paper.paperKind);
  const venueLabel =
    paper.venue && paper.venue.trim() && paper.venue.trim().toLowerCase() !== kindLabel.toLowerCase()
      ? paper.venue.trim()
      : null;

  return [formatDate(paper.publishedAt), venueLabel, kindLabel].filter(
    (value): value is string => Boolean(value),
  );
}

function getSourceLabel(paper: PaperRecord) {
  if (paper.doiUrl || paper.sourceUrl.includes("doi.org")) {
    return "DOI";
  }
  if (paper.sourceUrl.includes("semanticscholar.org")) {
    return "Semantic Scholar";
  }
  if (paper.sourceUrl.includes("arxiv.org") || paper.pdfUrl.includes("arxiv.org")) {
    return "arXiv";
  }
  return "External";
}

function toDraft(paper: PaperRecord): CurationDraft {
  return {
    worksheetCitationText: paper.worksheetCitationText ?? "",
    worksheetSourceLink: paper.worksheetSourceLink ?? "",
    contentTypePrimary: paper.contentTypePrimary ?? "",
    contentTypeSecondary: paper.contentTypeSecondary ?? "",
    contentTypeOtherText: paper.contentTypeOtherText ?? "",
    qualityScore: paper.qualityScore == null ? "" : String(paper.qualityScore),
    worksheetNote: paper.worksheetNote ?? "",
    relevanceScore: paper.relevanceScore == null ? "" : String(paper.relevanceScore),
    extractablePotential: paper.extractablePotential ?? "",
    studyLink: paper.studyLink ?? "",
  };
}

function getEmptyDraft(): CurationDraft {
  return {
    worksheetCitationText: "",
    worksheetSourceLink: "",
    contentTypePrimary: "",
    contentTypeSecondary: "",
    contentTypeOtherText: "",
    qualityScore: "",
    worksheetNote: "",
    relevanceScore: "",
    extractablePotential: "",
    studyLink: "",
  };
}

function isBlank(value: string) {
  return value.trim().length === 0;
}

function getStoredLocalModelSettings(): LocalModelSettings | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(LOCAL_MODEL_SETTINGS_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as LocalModelSettings;
    if (!parsed?.baseUrl?.trim()) {
      return null;
    }
    return {
      baseUrl: parsed.baseUrl.trim(),
      model: parsed.model?.trim() || undefined,
    };
  } catch {
    return null;
  }
}

function saveLocalModelSettings(settings: LocalModelSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LOCAL_MODEL_SETTINGS_KEY,
    JSON.stringify({
      baseUrl: settings.baseUrl.trim(),
      model: settings.model?.trim() || "",
    }),
  );
}

function ModalFrame({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4">
      <div className="w-full max-w-lg rounded-[1.5rem] border border-[var(--line)] bg-white p-6 shadow-card">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-slate"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PaperCard({ paper, view, listIndex = 0, onPaperUpdate }: PaperCardProps) {
  const [draft, setDraft] = useState<CurationDraft>(() => toDraft(paper));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [modalState, setModalState] = useState<ModalState>("none");
  const [localModelBaseUrl, setLocalModelBaseUrl] = useState("");
  const [localModelName, setLocalModelName] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelActionState, setModelActionState] = useState<"idle" | "working">("idle");
  const [modelStatusMessage, setModelStatusMessage] = useState("");

  useEffect(() => {
    setDraft(toDraft(paper));
  }, [paper]);

  useEffect(() => {
    const stored = getStoredLocalModelSettings();
    if (stored) {
      setLocalModelBaseUrl(stored.baseUrl);
      setLocalModelName(stored.model ?? "");
    }
  }, []);

  function setDraftValue(field: keyof CurationDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (saveState !== "idle") {
      setSaveState("idle");
      setSaveMessage("");
    }
  }

  async function handleWatchlistToggle() {
    const response = await fetch(`/api/papers/${paper.id}/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchlisted: !paper.watchlisted }),
    });

    if (!response.ok) {
      return;
    }

    onPaperUpdate({ ...paper, watchlisted: !paper.watchlisted });
  }

  async function persistDraft(nextDraft: CurationDraft, successMessage: string) {
    setSaveState("saving");
    setSaveMessage("");

    const response = await fetch(`/api/papers/${paper.id}/curation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextDraft),
    });

    const payload = (await response.json()) as PaperRecord | { error?: string };

    if (!response.ok) {
      setSaveState("error");
      setSaveMessage("error" in payload && payload.error ? payload.error : "Save failed.");
      return;
    }

    onPaperUpdate(payload as PaperRecord);
    setDraft(toDraft(payload as PaperRecord));
    setSaveState("saved");
    setSaveMessage(successMessage);
  }

  async function handleSave() {
    await persistDraft(draft, "Saved");
  }

  async function handleClearAll() {
    const emptyDraft = getEmptyDraft();
    setDraft(emptyDraft);
    await persistDraft(emptyDraft, "Cleared all curation fields.");
  }

  function fillCitation(current: CurationDraft) {
    if (!isBlank(current.worksheetCitationText)) {
      return current;
    }
    return {
      ...current,
      worksheetCitationText: buildWorksheetCitationText({
        authors: paper.authors,
        year: paper.year,
        title: paper.title,
        venue: paper.venue,
      }),
    };
  }

  function fillSourceLink(current: CurationDraft) {
    if (!isBlank(current.worksheetSourceLink)) {
      return current;
    }
    return {
      ...current,
      worksheetSourceLink:
        getPreferredWorksheetSourceLink({
          doi: paper.doi,
          doiUrl: paper.doiUrl,
          sourceUrl: paper.sourceUrl,
          pdfUrl: paper.pdfUrl,
          arxivId: paper.arxivId,
        }) ?? "",
    };
  }

  function fillType(current: CurationDraft) {
    if (!isBlank(current.contentTypePrimary)) {
      return current;
    }
    const inferred = inferAutoContentTypes({
      title: paper.title,
      abstract: paper.abstract,
      tags: paper.tags,
    });
    return {
      ...current,
      contentTypePrimary: inferred.primary ?? "",
      contentTypeSecondary: inferred.secondary ?? "",
    };
  }

  async function handleAutoFillAll() {
    const nextDraft = fillType(fillSourceLink(fillCitation(draft)));
    setDraft(nextDraft);
    await persistDraft(nextDraft, "Auto-filled and saved");
  }

  function hydrateModelSettingsFromStorage() {
    const stored = getStoredLocalModelSettings();
    if (stored) {
      setLocalModelBaseUrl(stored.baseUrl);
      setLocalModelName(stored.model ?? "");
      return stored;
    }
    return null;
  }

  async function fetchModels() {
    setModelActionState("working");
    setModelStatusMessage("");

    const response = await fetch("/api/ai/local-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: localModelBaseUrl }),
    });
    const payload = (await response.json()) as { models?: string[]; error?: string };

    if (!response.ok) {
      setModelActionState("idle");
      setModelStatusMessage(payload.error ?? "Failed to fetch models.");
      return;
    }

    setAvailableModels(payload.models ?? []);
    if (!localModelName && payload.models?.[0]) {
      setLocalModelName(payload.models[0]);
    }
    setModelActionState("idle");
    setModelStatusMessage(
      payload.models && payload.models.length > 0
        ? `Loaded ${payload.models.length} model${payload.models.length === 1 ? "" : "s"}.`
        : "No models returned. Enter a model name manually.",
    );
  }

  async function testConnection() {
    setModelActionState("working");
    setModelStatusMessage("");

    const response = await fetch("/api/ai/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: localModelBaseUrl,
        model: localModelName || null,
      }),
    });
    const payload = (await response.json()) as { model?: string; reply?: string; error?: string };

    setModelActionState("idle");
    setModelStatusMessage(
      response.ok
        ? `Connection successful${payload.model ? ` (${payload.model})` : ""}.`
        : payload.error ?? "Connection test failed.",
    );
  }

  async function runAIGeneration(settings: LocalModelSettings) {
    const response = await fetch("/api/ai/curation-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paperId: paper.id,
        title: paper.title,
        abstract: paper.abstract,
        authors: paper.authors,
        year: paper.year,
        venue: paper.venue,
        tags: paper.tags,
        sourceUrl: paper.sourceUrl,
        pdfUrl: paper.pdfUrl,
        doiUrl: paper.doiUrl,
        arxivId: paper.arxivId,
        localModel: settings,
      }),
    });
    const payload = (await response.json()) as AICurationDraft | { error?: string };

    if (!response.ok) {
      setSaveState("error");
      setSaveMessage("error" in payload && payload.error ? payload.error : "AI generation failed.");
      return;
    }

    if (!("qualityScore" in payload)) {
      setSaveState("error");
      setSaveMessage("error" in payload && payload.error ? payload.error : "AI generation failed.");
      return;
    }

    const aiPayload: AICurationDraft = payload;

    const nextDraft: CurationDraft = {
      ...draft,
      qualityScore:
        isBlank(draft.qualityScore) && aiPayload.qualityScore != null
          ? String(aiPayload.qualityScore)
          : draft.qualityScore,
      worksheetNote:
        isBlank(draft.worksheetNote) && aiPayload.notes ? aiPayload.notes : draft.worksheetNote,
      relevanceScore:
        isBlank(draft.relevanceScore) && aiPayload.relevanceScore != null
          ? String(aiPayload.relevanceScore)
          : draft.relevanceScore,
      extractablePotential:
        isBlank(draft.extractablePotential) && aiPayload.extractablePotential
          ? aiPayload.extractablePotential
          : draft.extractablePotential,
      studyLink: isBlank(draft.studyLink) && aiPayload.studyLink ? aiPayload.studyLink : draft.studyLink,
    };

    setDraft(nextDraft);
    await persistDraft(nextDraft, "AI draft generated and saved.");
  }

  async function handleGenerateAI() {
    if (APP_MODE === "hosted") {
      setModalState("hosted-warning");
      return;
    }

    const stored = hydrateModelSettingsFromStorage();
    if (!stored) {
      setModalState("connect-model");
      setModelStatusMessage("");
      return;
    }

    await runAIGeneration(stored);
  }

  async function handleSaveLocalModelSettings() {
    if (!localModelBaseUrl.trim()) {
      setModelStatusMessage("Base URL is required.");
      return;
    }

    const settings = {
      baseUrl: localModelBaseUrl.trim(),
      model: localModelName.trim() || undefined,
    };
    saveLocalModelSettings(settings);
    setModalState("none");
    await runAIGeneration(settings);
  }

  const showOtherTypeInput =
    draft.contentTypePrimary === "OTHER" || draft.contentTypeSecondary === "OTHER";
  const secondaryContentTypeOptions = contentTypeOptions.filter(
    (option) => option !== draft.contentTypePrimary,
  );

  return (
    <>
      <article
        className={clsx(
          "border border-[var(--line)] p-5",
          view === "list" &&
            (listIndex % 2 === 0
              ? "flex flex-col gap-4 bg-white"
              : "flex flex-col gap-4 bg-sand/40"),
          view === "card" && "bg-white",
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate">
              {getMetaLabelParts(paper).map((part, index) => (
                <div key={`${paper.id}-${part}-${index}`} className="flex items-center gap-2">
                  {index > 0 ? <span className="h-1 w-1 rounded-full bg-slate/60" /> : null}
                  <span>{part}</span>
                </div>
              ))}
            </div>
            <h2 className="text-xl font-semibold leading-snug text-ink">{paper.title}</h2>
            <p className="text-sm leading-6 text-slate">{paper.authors}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:max-w-xs lg:justify-end">
            <span className="border border-[var(--line)] bg-sand px-3 py-1 text-sm text-ink">
              Citations: {paper.citationCount ?? "—"}
            </span>
            <button
              type="button"
              onClick={handleWatchlistToggle}
              className={clsx(
                "border px-4 py-2 text-sm transition",
                paper.watchlisted
                  ? "border-ember bg-ember text-white"
                  : "border-[var(--line)] bg-white text-slate hover:border-ember hover:text-ember",
              )}
            >
              {paper.watchlisted ? "Watchlisted" : "Add to watchlist"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="border border-[var(--line-strong)] bg-ink/6 px-3 py-1 text-xs font-medium text-ink">
            Source: {getSourceLabel(paper)}
          </span>
          <span className="border border-[var(--line-strong)] bg-gold/15 px-3 py-1 text-xs font-medium text-ink">
            {paperKindLabel(paper.paperKind)}
          </span>
          {paper.tags.map((tagName) => (
            <span
              key={tagName}
              className="border border-moss/40 bg-moss/15 px-3 py-1 text-xs font-medium text-moss"
            >
              {tagName}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <a
            href={paper.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="bg-ink px-4 py-2 text-white transition hover:bg-slate-800"
          >
            Open source
          </a>
          <a
            href={paper.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="border border-[var(--line)] px-4 py-2 text-ink transition hover:border-ink"
          >
            Open PDF
          </a>
        </div>

        <details className="border border-[var(--line)] bg-sand/40 px-4 py-3">
          <summary className="flex items-center justify-between gap-4 text-sm font-medium text-ink">
            Abstract
            <span className="text-xs uppercase tracking-[0.2em] text-slate">Show</span>
          </summary>
          <p className="mt-3 text-sm leading-7 text-slate">{paper.abstract}</p>
        </details>

        <details className="border border-[var(--line)] bg-white px-4 py-4">
          <summary className="flex items-center justify-between gap-4 text-sm font-medium text-ink">
            Worksheet Notes
            <span className="text-xs uppercase tracking-[0.2em] text-slate">Show</span>
          </summary>

          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAutoFillAll}
                className="inline-flex h-8 items-center rounded-full bg-ink px-3 text-xs font-medium text-white"
              >
                Auto-fill all
              </button>
              <button
                type="button"
                onClick={handleGenerateAI}
                className="inline-flex h-8 items-center rounded-full border border-ink px-3 text-xs font-medium text-ink"
              >
                Generate (AI)
              </button>
            </div>

            <section className="space-y-4">
              <div className="grid gap-3 md:grid-cols-12 md:items-start">
                <label className="block text-sm md:col-span-5">
                  <span className="mb-2 block font-medium text-ink">Citation (Source_Paper)</span>
                  <input
                    value={draft.worksheetCitationText}
                    onChange={(event) => setDraftValue("worksheetCitationText", event.target.value)}
                    className="h-10 w-full rounded-2xl border border-[var(--line)] bg-white px-3 outline-none focus:border-ink"
                  />
                </label>

                <label className="block text-sm md:col-span-5">
                  <span className="mb-2 block font-medium text-ink">Source link (Source_Paper_Link)</span>
                  <input
                    value={draft.worksheetSourceLink}
                    onChange={(event) => setDraftValue("worksheetSourceLink", event.target.value)}
                    className="h-10 w-full rounded-2xl border border-[var(--line)] bg-white px-3 outline-none focus:border-ink"
                  />
                  {draft.worksheetSourceLink ? (
                    <a
                      href={draft.worksheetSourceLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-ember underline"
                    >
                      Open worksheet link
                    </a>
                  ) : null}
                </label>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-2 block font-medium text-ink">Quality (research)</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={draft.qualityScore}
                    onChange={(event) => setDraftValue("qualityScore", event.target.value)}
                    className="h-10 w-full rounded-2xl border border-[var(--line)] bg-white px-3 outline-none focus:border-ink"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-12 md:items-start">
                <div className="md:col-span-4">
                  <span className="mb-2 block text-sm font-medium text-ink">Type</span>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-2 block font-medium text-ink md:sr-only">Primary</span>
                      <select
                        value={draft.contentTypePrimary}
                        onChange={(event) => setDraftValue("contentTypePrimary", event.target.value)}
                        className="h-10 w-full rounded-2xl border border-[var(--line)] bg-white px-3 outline-none focus:border-ink"
                      >
                        <option value="">Primary</option>
                        {contentTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {getContentTypeOptionLabel(option)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-sm">
                      <span className="mb-2 block font-medium text-ink md:sr-only">Secondary</span>
                      <select
                        value={draft.contentTypeSecondary}
                        onChange={(event) => setDraftValue("contentTypeSecondary", event.target.value)}
                        className="h-10 w-full rounded-2xl border border-[var(--line)] bg-white px-3 outline-none focus:border-ink"
                      >
                        <option value="">Secondary</option>
                        {secondaryContentTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {getContentTypeOptionLabel(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <label className="block text-sm md:col-span-8">
                  <span className="mb-2 block font-medium text-ink">Notes</span>
                  <textarea
                    value={draft.worksheetNote}
                    onChange={(event) => setDraftValue("worksheetNote", event.target.value)}
                    rows={2}
                    className="h-10 w-full rounded-2xl border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-ink"
                  />
                </label>
              </div>

              {showOtherTypeInput ? (
                <label className="block text-sm md:max-w-sm">
                  <span className="mb-2 block font-medium text-ink">Other type text</span>
                  <input
                    value={draft.contentTypeOtherText}
                    onChange={(event) => setDraftValue("contentTypeOtherText", event.target.value)}
                    className="h-10 w-full rounded-2xl border border-[var(--line)] bg-white px-3 outline-none focus:border-ink"
                  />
                </label>
              ) : null}
            </section>

            <section className="space-y-4 border-t border-[var(--line)] pt-4">
              <div>
                <h3 className="text-sm font-semibold text-ink">Triage Helpers</h3>
              </div>

              <div className="grid gap-3 md:grid-cols-12 md:items-start">
                <label className="block text-sm md:col-span-2">
                  <span className="mb-2 block font-medium text-ink">Relevance to Topic</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={draft.relevanceScore}
                    onChange={(event) => setDraftValue("relevanceScore", event.target.value)}
                    className="h-10 w-full rounded-2xl border border-[var(--line)] bg-white px-3 outline-none focus:border-ink"
                  />
                </label>

                <label className="block text-sm md:col-span-2">
                  <span className="mb-2 block font-medium text-ink">Extractable Potential</span>
                  <select
                    value={draft.extractablePotential}
                    onChange={(event) => setDraftValue("extractablePotential", event.target.value)}
                    className="h-10 w-full rounded-2xl border border-[var(--line)] bg-white px-3 outline-none focus:border-ink"
                  >
                    <option value="">Select</option>
                    {extractablePotentialOptions.map((option) => (
                      <option key={option} value={option}>
                        {getExtractablePotentialOptionLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm md:col-span-8">
                  <span className="mb-2 block font-medium text-ink">
                    Study link / question-source note (optional)
                  </span>
                  <input
                    value={draft.studyLink}
                    onChange={(event) => setDraftValue("studyLink", event.target.value)}
                    placeholder="https://... or mentions released prompts / benchmark questions / project page"
                    className="h-10 w-full rounded-2xl border border-[var(--line)] bg-white px-3 outline-none focus:border-ink"
                  />
                </label>
              </div>

            </section>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <p className="text-xs text-slate md:max-w-[70%]">
              Fill the worksheet fields, add to watchlist, then export from the Watchlist workspace.
            </p>
            <div className="flex items-center gap-3">
              {saveMessage ? (
                <span
                  className={clsx(
                    "text-xs",
                    saveState === "error" ? "text-ember" : "text-moss",
                  )}
                >
                  {saveMessage}
                </span>
              ) : null}
              <button
                type="button"
                onClick={handleClearAll}
                disabled={saveState === "saving"}
                className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-ink disabled:opacity-60"
              >
                Remove all
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saveState === "saving"}
                className="rounded-full bg-ink px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {saveState === "saving" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </details>
      </article>

      {modalState === "hosted-warning" ? (
        <ModalFrame title="AI Generation Disabled" onClose={() => setModalState("none")}>
          <div className="space-y-3 text-sm leading-7 text-slate">
            <p>
              AI generation is disabled on the hosted version by default.
            </p>
            <p>
              Local model access is an advanced setup that requires a user-run local model
              server plus user-side permission/configuration before this site can reach it.
            </p>
            <p>
              To use AI features reliably, clone the repository and run the app locally.
            </p>
          </div>
        </ModalFrame>
      ) : null}

      {modalState === "connect-model" ? (
        <ModalFrame title="Connect Local Model" onClose={() => setModalState("none")}>
          <div className="space-y-4">
            <p className="text-xs leading-6 text-slate">
              Advanced setup. Your local model server must already be running on your machine and
              may require user-side permission or CORS/origin configuration before this site can
              access it.
            </p>
            <label className="block text-sm">
              <span className="mb-2 block font-medium text-ink">Base URL</span>
              <input
                value={localModelBaseUrl}
                onChange={(event) => setLocalModelBaseUrl(event.target.value)}
                placeholder="http://localhost:1234/v1"
                className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 outline-none focus:border-ink"
              />
            </label>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink">Model name</span>
                <button
                  type="button"
                  onClick={fetchModels}
                  disabled={modelActionState === "working"}
                  className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs text-ink disabled:opacity-60"
                >
                  Fetch models
                </button>
              </div>

              {availableModels.length > 0 ? (
                <select
                  value={localModelName}
                  onChange={(event) => setLocalModelName(event.target.value)}
                  className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 outline-none focus:border-ink"
                >
                  <option value="">Select fetched model</option>
                  {availableModels.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </select>
              ) : null}

              <input
                value={localModelName}
                onChange={(event) => setLocalModelName(event.target.value)}
                placeholder="Manual model entry (optional)"
                className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 outline-none focus:border-ink"
              />
            </div>

            {modelStatusMessage ? (
              <p className="text-xs text-slate">{modelStatusMessage}</p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={testConnection}
                disabled={modelActionState === "working"}
                className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-ink disabled:opacity-60"
              >
                Test connection
              </button>
              <button
                type="button"
                onClick={handleSaveLocalModelSettings}
                disabled={modelActionState === "working"}
                className="rounded-full bg-ink px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </>
  );
}
