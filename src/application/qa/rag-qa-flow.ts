import type { EmbeddingPort, GenerationPort } from '../../ports/ai.port.js';
import type { VectorStorePort } from '../../ports/vector-store.port.js';

export type QaAnswer =
  | { kind: 'answer'; text: string; citations: Array<{ documentId: number; chunkId: number; title: string }> }
  | { kind: 'insufficient_knowledge'; text: string };

export class RagQaFlow {
  constructor(
    private readonly embeddings: EmbeddingPort,
    private readonly vectorStore: VectorStorePort,
    private readonly generation: GenerationPort
  ) {}

  async answer(question: string): Promise<QaAnswer> {
    const queryEmbedding = await this.embeddings.embedQuery(question);
    // nomic-embed-text cosine similarity scores typically range 0.45-0.65 for
    // relevant Spanish content. The 0.72 threshold was calibrated for OpenAI
    // embeddings; lower it to 0.40 for local models.
    const results = await this.vectorStore.search({ queryEmbedding, limit: 4, minScore: 0.40 });

    if (results.length === 0) {
      return {
        kind: 'insufficient_knowledge',
        text: 'No tengo información aprobada para responder esa consulta en este momento.'
      };
    }

    const text = await this.generation.answer({
      question,
      context: results.map((result) => result.content)
    });

    return {
      kind: 'answer',
      text,
      citations: results.map((result) => ({
        documentId: result.documentId,
        chunkId: result.chunkId,
        title: result.title
      }))
    };
  }
}
