import type { ChunkOptions, RagChunk, RagDocument } from "./contracts.js";

const DEFAULT_MAX_CHARS = 1400;
const DEFAULT_OVERLAP_CHARS = 180;

type Section = {
  heading?: string;
  text: string;
};

export function chunkDocument(document: RagDocument, options: ChunkOptions = {}): RagChunk[] {
  const maxChars = normalizePositiveInt(options.maxChars, DEFAULT_MAX_CHARS);
  const overlapChars = Math.min(normalizeNonNegativeInt(options.overlapChars, DEFAULT_OVERLAP_CHARS), maxChars - 1);
  const sections = options.splitByHeadings ? splitMarkdownByHeadings(document.text) : [{ text: document.text }];
  const chunks: RagChunk[] = [];

  for (const section of sections) {
    for (const text of splitWithOverlap(section.text, maxChars, overlapChars)) {
      chunks.push(createChunk(document, text, chunks.length, section.heading));
    }
  }

  return chunks;
}

export function chunkDocuments(documents: RagDocument[], options: ChunkOptions = {}): RagChunk[] {
  return documents.flatMap((document) => chunkDocument(document, options));
}

function createChunk(document: RagDocument, text: string, index: number, heading?: string): RagChunk {
  const metadata = heading ? { ...document.metadata, heading } : document.metadata;

  return {
    id: `${document.id}:chunk:${index}`,
    documentId: document.id,
    source: document.source,
    title: document.title,
    heading,
    text,
    index,
    tokenEstimate: Math.ceil(text.length / 4),
    metadata,
  };
}

function splitWithOverlap(text: string, maxChars: number, overlapChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlapChars;
  }

  return chunks;
}

function splitMarkdownByHeadings(text: string): Section[] {
  const lines = text.split(/\r?\n/);
  const sections: Section[] = [];
  let currentHeading: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    const heading = parseMarkdownHeading(line);
    if (heading) {
      pushSection(sections, currentHeading, currentLines);
      currentHeading = heading;
      currentLines = [line];
      continue;
    }

    currentLines.push(line);
  }

  pushSection(sections, currentHeading, currentLines);
  return sections.length > 0 ? sections : [{ text }];
}

function pushSection(sections: Section[], heading: string | undefined, lines: string[]): void {
  if (lines.length === 0) return;
  const text = lines.join("\n");
  if (text.length === 0 && !heading) return;
  sections.push({ heading, text });
}

function parseMarkdownHeading(line: string): string | undefined {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  return match?.[2]?.trim();
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function normalizeNonNegativeInt(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}
