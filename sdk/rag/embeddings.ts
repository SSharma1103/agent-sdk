import type { EmbeddingProvider, RagChunk } from "./contracts.js";

export async function embedChunks(
  provider: EmbeddingProvider,
  chunks: RagChunk[],
  options: {
    model?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<Array<RagChunk & { embedding: number[] }>> {
  if (provider.embedMany) {
    const result = await provider.embedMany({
      texts: chunks.map((chunk) => chunk.text),
      model: options.model,
      metadata: options.metadata,
    });

    return chunks.map((chunk, index) => ({
      ...chunk,
      embedding: result.embeddings[index] ?? [],
    }));
  }

  const embedded = await Promise.all(
    chunks.map(async (chunk) => {
      const result = await provider.embedText({
        text: chunk.text,
        model: options.model,
        metadata: options.metadata,
      });
      return {
        ...chunk,
        embedding: result.embedding,
      };
    }),
  );

  return embedded;
}
