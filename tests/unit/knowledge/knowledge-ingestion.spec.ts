import { describe, expect, it } from 'vitest';
import { KnowledgeIngestionService } from '../../../src/application/knowledge/knowledge-ingestion.js';
import { PatientFileIsolationService, type PatientCaseFileStore } from '../../../src/domain/cases/patient-file-isolation.js';
import type { EmbeddingPort } from '../../../src/ports/ai.port.js';
import type { UpsertKnowledgeDocumentInput, VectorStorePort } from '../../../src/ports/vector-store.port.js';

const fakeEmbedding: EmbeddingPort = {
  async embedChunks(chunks) {
    return chunks.map(() => Array(768).fill(0.1));
  },
  async embedQuery() {
    return Array(768).fill(0.1);
  }
};

class CapturingVectorStore implements VectorStorePort {
  upserts: UpsertKnowledgeDocumentInput[] = [];

  async upsertDocument(input: UpsertKnowledgeDocumentInput) {
    this.upserts.push(input);
    return { documentId: 10, chunkCount: input.chunks.length };
  }

  async search() {
    return [];
  }
}

describe('KnowledgeIngestionService', () => {
  it('rejects unauthorized staff uploads before indexing', async () => {
    const vectorStore = new CapturingVectorStore();
    const service = new KnowledgeIngestionService({ isAuthorized: async () => false }, fakeEmbedding, vectorStore);

    const result = await service.ingestStaffDocument({
      telegramUserId: 'unauthorized',
      title: 'Practice guide',
      sourceType: 'staff_pdf',
      content: 'Approved chiropractic practice information.'
    });

    expect(result).toEqual({ accepted: false, reason: 'unauthorized' });
    expect(vectorStore.upserts).toHaveLength(0);
  });

  it('indexes authorized staff documents for QA', async () => {
    const vectorStore = new CapturingVectorStore();
    const service = new KnowledgeIngestionService({ isAuthorized: async () => true }, fakeEmbedding, vectorStore);

    const result = await service.ingestStaffDocument({
      telegramUserId: 'staff-1',
      title: 'Practice guide',
      sourceType: 'staff_text',
      content: 'Posture recommendations and general chiropractic care guidance.'
    });

    expect(result).toMatchObject({ accepted: true, documentId: 10 });
    expect(vectorStore.upserts[0].createdByTelegramUserId).toBe('staff-1');
    expect(vectorStore.upserts[0].chunks[0].content).toContain('Posture recommendations');
  });
});

describe('PatientFileIsolationService', () => {
  it('attaches patient files only to the case and marks them for review', async () => {
    const attached: unknown[] = [];
    const reviews: unknown[] = [];
    const caseFiles: PatientCaseFileStore = {
      async attachFile(file) {
        attached.push(file);
      },
      async markCaseForReview(caseId, reason) {
        reviews.push({ caseId, reason });
      }
    };

    const result = await new PatientFileIsolationService(caseFiles).attachPatientFile({
      caseId: 5,
      telegramFileId: 'radiography-file',
      fileType: 'document'
    });

    expect(result.indexedForKnowledge).toBe(false);
    expect(result.markedForReview).toBe(true);
    expect(attached).toHaveLength(1);
    expect(reviews).toEqual([{ caseId: 5, reason: 'patient_file_uploaded' }]);
  });
});
