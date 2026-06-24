import { describe, expect, it } from 'vitest';
import { RagQaFlow } from '../../../src/application/qa/rag-qa-flow.js';
import type { EmbeddingPort, GenerationPort } from '../../../src/ports/ai.port.js';
import type { KnowledgeSearchResult, VectorStorePort } from '../../../src/ports/vector-store.port.js';

const embeddings: EmbeddingPort = {
  async embedChunks(chunks) {
    return chunks.map(() => Array(768).fill(0.1));
  },
  async embedQuery() {
    return Array(768).fill(0.1);
  }
};

const generation: GenerationPort = {
  async answer({ context }) {
    return `Answer from approved knowledge: ${context[0]}`;
  },
  async extractRules() {
    return [];
  }
};

function vectorStore(results: KnowledgeSearchResult[]): VectorStorePort {
  return {
    async upsertDocument() {
      throw new Error('QA must not write knowledge documents');
    },
    async deleteByTitle() {
      throw new Error('QA must not delete knowledge documents');
    },
    async search() {
      return results;
    }
  };
}

describe('RagQaFlow', () => {
  it('answers informational questions using approved knowledge', async () => {
    const qa = new RagQaFlow(
      embeddings,
      vectorStore([
        {
          documentId: 1,
          chunkId: 2,
          title: 'Practice FAQ',
          content: 'Stretch gently and avoid unsupported claims.',
          metadata: {},
          score: 0.9
        }
      ]),
      generation
    );

    const answer = await qa.answer('How should I stretch?');

    expect(answer.kind).toBe('answer');
    expect(answer.text).toContain('approved knowledge');
  });

  it('returns a safe response when approved knowledge is insufficient', async () => {
    const qa = new RagQaFlow(embeddings, vectorStore([]), generation);

    const answer = await qa.answer('What does the clinic say about this rare topic?');

    expect(answer.kind).toBe('insufficient_knowledge');
    expect(answer.text).toContain('No tengo información');
  });

  it('returns insufficient_knowledge for scheduling questions when no relevant docs exist', async () => {
    const qa = new RagQaFlow(embeddings, vectorStore([]), generation);

    // Scheduling-intent questions now go through RAG like any other question.
    // With no matching documents, the bot returns insufficient_knowledge so the
    // TextMessageHandler can offer to start the scheduling flow conversationally.
    const answer = await qa.answer('Can I book an appointment tomorrow?');

    expect(answer.kind).toBe('insufficient_knowledge');
  });
});
