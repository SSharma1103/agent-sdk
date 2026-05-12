import type { RagChunk, VectorStore } from "./contracts.js";

type EmbeddedChunk = RagChunk & { embedding: number[] };

export class InMemoryVectorStore implements VectorStore {
  private readonly chunks = new Map<string, EmbeddedChunk>();

  async upsert(chunks: EmbeddedChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
  }

  async search(input: {
    embedding: number[];
    topK?: number;
    filter?: Record<string, unknown>;
  }): Promise<Array<{ chunk: RagChunk; score: number }>> {
    const topK = input.topK ?? 10;

    return [...this.chunks.values()]
      .filter((chunk) => matchesFilter(chunk, input.filter))
      .map((chunk) => ({
        chunk: stripEmbedding(chunk),
        score: cosineSimilarity(input.embedding, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

function stripEmbedding({ embedding: _embedding, ...chunk }: EmbeddedChunk): RagChunk {
  return chunk;
}

function matchesFilter(chunk: RagChunk, filter: Record<string, unknown> | undefined): boolean {
  if (!filter) return true;

  return Object.entries(filter).every(([key, value]) => chunk.metadata?.[key] === value);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < length; i += 1) {
    const aValue = a[i] ?? 0;
    const bValue = b[i] ?? 0;
    dot += aValue * bValue;
    normA += aValue * aValue;
    normB += bValue * bValue;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
