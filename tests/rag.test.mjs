import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryVectorStore,
  chunkDocument,
  embedChunks,
} from "../dist/sdk/index.js";

class FakeEmbeddingProvider {
  name = "fake";

  async embedText({ text }) {
    return { embedding: simpleHashVector(text, 8), model: "fake-embedding" };
  }
}

test("chunkDocument splits markdown by headings", () => {
  const chunks = chunkDocument(
    {
      id: "doc_1",
      source: "docs/guide.md",
      title: "Guide",
      text: "# Intro\nWelcome\n\n## Install\nRun npm install\n\n## Usage\nRun it",
    },
    { splitByHeadings: true, maxChars: 100 },
  );

  assert.equal(chunks.length, 3);
  assert.deepEqual(
    chunks.map((chunk) => chunk.heading),
    ["Intro", "Install", "Usage"],
  );
  assert.equal(chunks[1].metadata.heading, "Install");
  assert.ok(chunks[1].text.startsWith("## Install"));
});

test("chunks preserve source, title, documentId, and index", () => {
  const chunks = chunkDocument(
    {
      id: "doc_2",
      source: "kb/article.md",
      title: "Article",
      text: "A".repeat(40),
    },
    { maxChars: 12, overlapChars: 2 },
  );

  assert.equal(chunks[0].id, "doc_2:chunk:0");
  assert.equal(chunks[1].id, "doc_2:chunk:1");
  assert.deepEqual(
    chunks.map((chunk) => ({
      source: chunk.source,
      title: chunk.title,
      documentId: chunk.documentId,
      index: chunk.index,
    })),
    [
      { source: "kb/article.md", title: "Article", documentId: "doc_2", index: 0 },
      { source: "kb/article.md", title: "Article", documentId: "doc_2", index: 1 },
      { source: "kb/article.md", title: "Article", documentId: "doc_2", index: 2 },
      { source: "kb/article.md", title: "Article", documentId: "doc_2", index: 3 },
    ],
  );
  assert.equal(chunks[0].tokenEstimate, 3);
});

test("overlap works for long text", () => {
  const chunks = chunkDocument(
    {
      id: "doc_3",
      source: "long.txt",
      text: "abcdefghijklmnopqrstuvwxyz",
    },
    { maxChars: 10, overlapChars: 3 },
  );

  assert.deepEqual(
    chunks.map((chunk) => chunk.text),
    ["abcdefghij", "hijklmnopq", "opqrstuvwx", "vwxyz"],
  );
});

test("embedChunks works with fake provider", async () => {
  const chunks = chunkDocument({
    id: "doc_4",
    source: "notes.md",
    text: "Apples and oranges",
  });
  const embedded = await embedChunks(new FakeEmbeddingProvider(), chunks);

  assert.equal(embedded.length, 1);
  assert.equal(embedded[0].embedding.length, 8);
  assert.deepEqual(embedded[0].embedding, simpleHashVector("Apples and oranges", 8));
});

test("InMemoryVectorStore returns the most relevant chunk", async () => {
  const provider = new FakeEmbeddingProvider();
  const chunks = [
    ...chunkDocument({ id: "fruit", source: "fruit.md", text: "banana banana smoothie" }),
    ...chunkDocument({ id: "code", source: "code.md", text: "typescript interfaces and modules" }),
  ];
  const embedded = await embedChunks(provider, chunks);
  const store = new InMemoryVectorStore();

  await store.upsert(embedded);
  const results = await store.search({
    embedding: simpleHashVector("banana", 8),
    topK: 1,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].chunk.documentId, "fruit");
  assert.ok(results[0].score > 0);
});

test("metadata filter works", async () => {
  const provider = new FakeEmbeddingProvider();
  const chunks = [
    ...chunkDocument({
      id: "public",
      source: "public.md",
      text: "shared onboarding policy",
      metadata: { tenant: "public" },
    }),
    ...chunkDocument({
      id: "private",
      source: "private.md",
      text: "shared onboarding policy",
      metadata: { tenant: "private" },
    }),
  ];
  const embedded = await embedChunks(provider, chunks);
  const store = new InMemoryVectorStore();

  await store.upsert(embedded);
  const results = await store.search({
    embedding: simpleHashVector("onboarding policy", 8),
    filter: { tenant: "private" },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].chunk.documentId, "private");
});

function simpleHashVector(text, dimensions) {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let hash = 0;
    for (const char of token) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    vector[hash % dimensions] += 1;
  }
  return vector;
}
