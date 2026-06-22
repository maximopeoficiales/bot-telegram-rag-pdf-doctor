import type { EmbeddingPort } from '../../ports/ai.port.js';
import type { KnowledgeSourceType, VectorStorePort } from '../../ports/vector-store.port.js';

export type StaffAuthorizationPort = {
  isAuthorized(telegramUserId: string): Promise<boolean>;
};

export type KnowledgeIngestionRequest = {
  telegramUserId: string;
  title: string;
  sourceType: KnowledgeSourceType;
  content: string;
};

export type KnowledgeIngestionResult =
  | { accepted: true; documentId: number; chunkCount: number }
  | { accepted: false; reason: 'unauthorized' | 'empty_content' };

export class KnowledgeIngestionService {
  constructor(
    private readonly staffAuthorization: StaffAuthorizationPort,
    private readonly embeddings: EmbeddingPort,
    private readonly vectorStore: VectorStorePort
  ) {}

  async ingestStaffDocument(request: KnowledgeIngestionRequest): Promise<KnowledgeIngestionResult> {
    const authorized = await this.staffAuthorization.isAuthorized(request.telegramUserId);
    if (!authorized) {
      return { accepted: false, reason: 'unauthorized' };
    }

    const chunks = chunkKnowledgeText(request.content);
    if (chunks.length === 0) {
      return { accepted: false, reason: 'empty_content' };
    }

    // Replace existing document with same title (upsert by title)
    await this.vectorStore.deleteByTitle(request.title);

    const vectors = await this.embeddings.embedChunks(chunks);
    const stored = await this.vectorStore.upsertDocument({
      title: request.title,
      sourceType: request.sourceType,
      createdByTelegramUserId: request.telegramUserId,
      chunks: chunks.map((content, index) => ({ content, embedding: vectors[index], metadata: { chunkIndex: index } }))
    });

    return { accepted: true, documentId: stored.documentId, chunkCount: stored.chunkCount };
  }
}

export function chunkKnowledgeText(content: string, maxChunkLength = 800): string[] {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += maxChunkLength) {
    chunks.push(normalized.slice(start, start + maxChunkLength).trim());
  }

  return chunks;
}
