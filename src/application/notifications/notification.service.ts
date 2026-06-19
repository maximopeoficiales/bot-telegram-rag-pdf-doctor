import type { PatientIntake } from '../../domain/eligibility/eligibility-engine.js';
import type { LocationId } from '../scheduling/scheduling-flow.js';

export type StaffGroupPort = {
  sendMessage(text: string): Promise<void>;
};

export type StaffNotificationRepository = {
  create(input: { caseId?: number; type: string; payload: Record<string, unknown> }): Promise<void>;
};

export type PatientFileType = 'audio' | 'image' | 'pdf' | 'document' | 'other';

export class NotificationService {
  constructor(
    private readonly staffGroup: StaffGroupPort,
    private readonly notifications?: StaffNotificationRepository
  ) {}

  async appointmentConfirmed(input: {
    caseId: number;
    patient: PatientIntake;
    locationId: LocationId;
    startsAt: Date;
    googleEventId: string;
  }): Promise<void> {
    await this.record(input.caseId, 'appointment_confirmed', input);
    await this.staffGroup.sendMessage(
      [
        '✅ New appointment confirmed',
        `Patient: ${input.patient.fullName}`,
        `DNI: ${input.patient.dni}`,
        `Location: ${input.locationId.toUpperCase()}`,
        `Starts: ${input.startsAt.toISOString()}`,
        `Google event: ${input.googleEventId}`
      ].join('\n')
    );
  }

  async pendingReview(input: { caseId: number; patient: PatientIntake; reasonCode: string; requiresRadiography: boolean }): Promise<void> {
    await this.record(input.caseId, 'pending_review', input);
    await this.staffGroup.sendMessage(
      [
        '⚠️ Case pending staff review',
        `Case: ${input.caseId}`,
        `Patient: ${input.patient.fullName}`,
        `Reason: ${input.reasonCode}`,
        `Radiography required: ${input.requiresRadiography ? 'yes' : 'no'}`
      ].join('\n')
    );
  }

  async patientFileUploaded(input: { caseId: number; telegramUserId: string; fileId: string; fileType: PatientFileType }): Promise<void> {
    await this.record(input.caseId, 'patient_file_uploaded', input);
    await this.staffGroup.sendMessage(
      [
        '📎 Patient file uploaded',
        `Case: ${input.caseId}`,
        `Patient Telegram ID: ${input.telegramUserId}`,
        `Type: ${input.fileType}`,
        `Telegram file ID: ${input.fileId}`,
        'Case remains pending review until staff decides.'
      ].join('\n')
    );
  }

  private async record(caseId: number | undefined, type: string, payload: Record<string, unknown>): Promise<void> {
    await this.notifications?.create({ caseId, type, payload });
  }
}
