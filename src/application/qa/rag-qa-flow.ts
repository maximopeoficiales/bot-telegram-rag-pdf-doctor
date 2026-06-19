import type { EmbeddingPort, GenerationPort } from '../../ports/ai.port.js';
import type { VectorStorePort } from '../../ports/vector-store.port.js';

export type QaAnswer =
  | { kind: 'answer'; text: string; citations: Array<{ documentId: number; chunkId: number; title: string }> }
  | { kind: 'redirect_to_scheduling'; text: string }
  | { kind: 'insufficient_knowledge'; text: string };

const schedulingIntent = /\b(book|schedule|appointment|eligible|availability|slot|cita|agenda|turno)\b/i;

export class RagQaFlow {
  constructor(
    private readonly embeddings: EmbeddingPort,
    private readonly vectorStore: VectorStorePort,
    private readonly generation: GenerationPort
  ) {}

  async answer(question: string): Promise<QaAnswer> {
    if (schedulingIntent.test(question)) {
      return {
        kind: 'redirect_to_scheduling',
        text: 'I can share general information here. To make scheduling or eligibility decisions, please start the scheduling flow with /schedule.'
      };
    }

    const queryEmbedding = await this.embeddings.embedQuery(question);
    const results = await this.vectorStore.search({ queryEmbedding, limit: 4, minScore: 0.72 });

    if (results.length === 0) {
      return {
        kind: 'insufficient_knowledge',
        text: 'I cannot answer that from the approved practice information available right now.'
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
