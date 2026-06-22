import { sql, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { knowledgeChunks, knowledgeDocuments } from '../../db/schema.js';
import type {
  KnowledgeSearchResult,
  UpsertKnowledgeDocumentInput,
  UpsertKnowledgeDocumentResult,
  VectorSearchInput,
  VectorStorePort
} from '../../ports/vector-store.port.js';

type DrizzleDatabase = PostgresJsDatabase;

type SearchRow = {
  documentId: number;
  chunkId: number;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
};

export class PgVectorStore implements VectorStorePort {
  constructor(private readonly db: DrizzleDatabase) {}

  async deleteByTitle(title: string): Promise<number> {
    // Find documents with this title
    const docs = await this.db
      .select({ id: knowledgeDocuments.id })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.title, title));

    if (docs.length === 0) return 0;

    const ids = docs.map((d) => d.id);

    // Delete chunks first (FK constraint)
    for (const id of ids) {
      await this.db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, id));
    }

    // Delete documents
    for (const id of ids) {
      await this.db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
    }

    return ids.length;
  }

  async upsertDocument(input: UpsertKnowledgeDocumentInput): Promise<UpsertKnowledgeDocumentResult> {
    const documentRows = await this.db
      .insert(knowledgeDocuments)
      .values({
        title: input.title,
        sourceType: input.sourceType,
        createdByTelegramUserId: input.createdByTelegramUserId
      })
      .returning({ id: knowledgeDocuments.id });

    const documentId = documentRows[0].id;

    if (input.chunks.length > 0) {
      await this.db.insert(knowledgeChunks).values(
        input.chunks.map((chunk, index) => ({
          documentId,
          content: chunk.content,
          metadata: { ...(chunk.metadata ?? {}), chunkIndex: index },
          embedding: chunk.embedding
        }))
      );
    }

    return { documentId, chunkCount: input.chunks.length };
  }

  async search(input: VectorSearchInput): Promise<KnowledgeSearchResult[]> {
    const distance = sql<number>`(${knowledgeChunks.embedding} <=> ${this.vectorLiteral(input.queryEmbedding)})`;
    const score = sql<number>`(1 - ${distance})`;

    const rows = await this.db
      .select({
        documentId: knowledgeDocuments.id,
        chunkId: knowledgeChunks.id,
        title: knowledgeDocuments.title,
        content: knowledgeChunks.content,
        metadata: knowledgeChunks.metadata,
        score
      })
      .from(knowledgeChunks)
      .innerJoin(knowledgeDocuments, sql`${knowledgeChunks.documentId} = ${knowledgeDocuments.id}`)
      .orderBy(distance)
      .limit(input.limit);

    return (rows as SearchRow[]).filter((row) => input.minScore === undefined || row.score >= input.minScore);
  }

  private vectorLiteral(embedding: number[]) {
    if (embedding.length !== 768 || embedding.some((value) => !Number.isFinite(value))) {
      throw new Error('pgvector embeddings must contain 768 finite numbers');
    }

    return sql.raw(`'[${embedding.join(',')}]'::vector`);
  }
}
