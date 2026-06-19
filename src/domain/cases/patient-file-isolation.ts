export type PatientFileType = 'document' | 'photo' | 'audio' | 'voice' | 'other';

export type PatientFileAttachment = {
  caseId: number;
  telegramFileId: string;
  fileType: PatientFileType;
};

export type PatientCaseFileStore = {
  attachFile(file: PatientFileAttachment): Promise<void>;
  markCaseForReview(caseId: number, reason: string): Promise<void>;
};

export type PatientFileIsolationResult = {
  indexedForKnowledge: false;
  markedForReview: true;
};

export class PatientFileIsolationService {
  constructor(private readonly caseFiles: PatientCaseFileStore) {}

  async attachPatientFile(file: PatientFileAttachment): Promise<PatientFileIsolationResult> {
    await this.caseFiles.attachFile(file);
    await this.caseFiles.markCaseForReview(file.caseId, 'patient_file_uploaded');

    return { indexedForKnowledge: false, markedForReview: true };
  }
}
