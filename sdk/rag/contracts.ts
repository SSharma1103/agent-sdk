export type RagDocument = {
  id: string;
  source: string;
  title?: string;
  description?: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export type RagChunk = {
  id: string;
  documentId: string;
  source: string;
  title?: string;
  heading?: string;
  text: string;
  index: number;
  tokenEstimate: number;
  metadata?: Record<string, unknown>;
};

export type ChunkOptions = {
  maxChars?: number;
  overlapChars?: number;
  splitByHeadings?: boolean;
};

export interface EmbeddingProvider {
  name: string;
  embedText(input: {
    text: string;
    model?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    embedding: number[];
    model?: string;
    usage?: {
      totalTokens?: number;
    };
    raw?: unknown;
  }>;

  embedMany?(input: {
    texts: string[];
    model?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    embeddings: number[][];
    model?: string;
    usage?: {
      totalTokens?: number;
    };
    raw?: unknown;
  }>;
}

export interface VectorStore {
  upsert(chunks: Array<RagChunk & { embedding: number[] }>): Promise<void>;
  search(input: {
    embedding: number[];
    topK?: number;
    filter?: Record<string, unknown>;
  }): Promise<
    Array<{
      chunk: RagChunk;
      score: number;
    }>
  >;
}
