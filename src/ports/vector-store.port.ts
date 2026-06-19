export type KnowledgeSourceType = 'staff_pdf' | 'staff_text';

export type KnowledgeChunkInput = {
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
};

export type UpsertKnowledgeDocumentInput = {
  title: string;
  sourceType: KnowledgeSourceType;
  createdByTelegramUserId: string;
  chunks: KnowledgeChunkInput[];
};

export type UpsertKnowledgeDocumentResult = {
  documentId: number;
  chunkCount: number;
};

export type VectorSearchInput = {
  queryEmbedding: number[];
  limit: number;
  minScore?: number;
};

export type KnowledgeSearchResult = {
  documentId: number;
  chunkId: number;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
};

export type VectorStorePort = {
  upsertDocument(input: UpsertKnowledgeDocumentInput): Promise<UpsertKnowledgeDocumentResult>;
  search(input: VectorSearchInput): Promise<KnowledgeSearchResult[]>;
};
