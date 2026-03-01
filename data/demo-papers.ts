import { ContentType, PaperKind } from "@prisma/client";

import type { IngestPaperInput } from "../lib/ingest-core";

export const demoPapers: IngestPaperInput[] = [
  {
    title: "Demo Corpus: Evaluating Alignment Faking Signals in Tool-Using Language Models",
    abstract:
      "A development-only record for the AI Intentions radar. The paper explores alignment faking indicators, strategic obedience, and evaluator gaming behavior in tool-using language models.",
    authors: "Mina Patel, Jordan Lee",
    year: 2025,
    publishedAt: new Date("2025-11-14T00:00:00.000Z"),
    venue: "Demo Corpus",
    paperKind: PaperKind.WORKSHOP,
    sourceUrl: "https://example.com/demo/alignment-faking-signals",
    pdfUrl: "https://example.com/demo/alignment-faking-signals.pdf",
    citationCount: 12,
    watchlisted: true,
    worksheetCitationText:
      "Patel et al. (2025). Demo Corpus: Evaluating Alignment Faking Signals in Tool-Using Language Models. Demo Corpus.",
    worksheetSourceLink: "https://example.com/demo/alignment-faking-signals",
    contentTypePrimary: ContentType.ALIGNMENT_FAKING,
    worksheetNote:
      "Manual demo note showing a dense one-sentence summary for worksheet export verification.",
    relevanceScore: 9,
    extractablePotential: "DIRECT",
    studyLink: "https://github.com/example/alignment-faking-signals",
  },
  {
    title: "Demo Corpus: Goal Misgeneralization and Reward Hacking Under Weak Oversight",
    abstract:
      "This demo record studies reward hacking, goal misgeneralization, and weak-oversight failure modes in language-model agents operating over long horizons.",
    authors: "Avery Chen, Sofia Morales",
    year: 2024,
    publishedAt: new Date("2024-08-22T00:00:00.000Z"),
    venue: "Demo Corpus",
    paperKind: PaperKind.PREPRINT,
    arxivId: "demo-2408.00001",
    sourceUrl: "https://example.com/demo/reward-hacking-oversight",
    pdfUrl: "https://example.com/demo/reward-hacking-oversight.pdf",
    citationCount: 7,
    watchlisted: true,
    worksheetCitationText:
      "Chen et al. (2024). Demo Corpus: Goal Misgeneralization and Reward Hacking Under Weak Oversight. Demo Corpus.",
    contentTypePrimary: ContentType.REWARD_HACKING,
    qualityScore: 7,
    relevanceScore: 8,
    extractablePotential: "ADAPTABLE",
  },
  {
    title: "Demo Corpus: Interpretable Monitors for Deceptive Alignment Benchmarks",
    abstract:
      "A demo paper covering deceptive alignment, interpretability-based monitors, representation probing, and oversight protocols for catching strategic behavior.",
    authors: "Kai Thompson, Nadia Ibrahim",
    year: 2024,
    publishedAt: new Date("2024-03-05T00:00:00.000Z"),
    venue: "Demo Corpus",
    paperKind: PaperKind.CONFERENCE,
    doi: "10.9999/demo.2024.001",
    doiUrl: "https://doi.org/10.9999/demo.2024.001",
    sourceUrl: "https://doi.org/10.9999/demo.2024.001",
    pdfUrl: "https://example.com/demo/interpretable-monitors.pdf",
    citationCount: 19,
    watchlisted: true,
    worksheetCitationText:
      "Thompson et al. (2024). Demo Corpus: Interpretable Monitors for Deceptive Alignment Benchmarks. Demo Corpus.",
    worksheetSourceLink: "https://doi.org/10.9999/demo.2024.001",
    contentTypePrimary: ContentType.EVAL_FRAMEWORK,
    contentTypeSecondary: ContentType.ALIGNMENT_FAKING,
    qualityScore: 8,
    worksheetNote:
      "Demo worksheet row with a completed citation, DOI-backed source link, and curator quality score.",
    relevanceScore: 8,
    extractablePotential: "DIRECT",
    studyLink: "https://example.com/demo/interpretable-monitors-dataset",
  },
  {
    title: "Demo Corpus: Prompt Injection, Jailbreaks, and Intent Elicitation in Safety Evals",
    abstract:
      "This development record connects prompt injection, jailbreak attacks, safety evaluations, and intent elicitation methods for assistant systems.",
    authors: "Noah Bennett, Priya Raman",
    year: 2023,
    publishedAt: new Date("2023-09-18T00:00:00.000Z"),
    venue: "Demo Corpus",
    paperKind: PaperKind.WORKSHOP,
    sourceUrl: "https://example.com/demo/jailbreak-intent-evals",
    pdfUrl: "https://example.com/demo/jailbreak-intent-evals.pdf",
    citationCount: 5,
    watchlisted: true,
    worksheetSourceLink: "https://example.com/demo/jailbreak-intent-evals",
    contentTypePrimary: ContentType.JAILBREAK_STUDY,
    relevanceScore: 7,
    extractablePotential: "ADAPTABLE",
  },
  {
    title: "Demo Corpus: Scaffolding Effects on Model Intentions and Strategic Compliance",
    abstract:
      "A demo entry about scaffolding, autonomous-agent tool use, strategic compliance, and how model intentions shift with longer action sequences.",
    authors: "Elena García, Marcus Dunn",
    year: 2023,
    publishedAt: new Date("2023-04-11T00:00:00.000Z"),
    venue: "Demo Corpus",
    paperKind: PaperKind.PREPRINT,
    sourceUrl: "https://example.com/demo/scaffolding-strategic-compliance",
    pdfUrl: "https://example.com/demo/scaffolding-strategic-compliance.pdf",
    citationCount: 3,
  },
];
