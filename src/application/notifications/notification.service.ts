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
        '✅ Nueva cita confirmada',
        `Paciente: ${input.patient.fullName}`,
        `DNI: ${input.patient.dni}`,
        `Sede: ${input.locationId.toUpperCase()}`,
        `Inicio: ${input.startsAt.toLocaleString('es-PE', { timeZone: 'America/Lima' })}`,
        `Evento Google: ${input.googleEventId}`
      ].join('\n')
    );
  }

  async pendingReview(input: { caseId: number; patient: PatientIntake; reasonCode: string; requiresRadiography: boolean }): Promise<void> {
    await this.record(input.caseId, 'pending_review', input);
    await this.staffGroup.sendMessage(
      [
        '⚠️ Caso pendiente de revisión',
        `Caso: ${input.caseId}`,
        `Paciente: ${input.patient.fullName}`,
        `Motivo: ${input.reasonCode}`,
        `Requiere radiografía: ${input.requiresRadiography ? 'Sí' : 'No'}`
      ].join('\n')
    );
  }

  async patientFileUploaded(input: { caseId: number; telegramUserId: string; fileId: string; fileType: PatientFileType }): Promise<void> {
    await this.record(input.caseId, 'patient_file_uploaded', input);
    await this.staffGroup.sendMessage(
      [
        '📎 Archivo subido por paciente',
        `Caso: ${input.caseId}`,
        `Telegram ID del paciente: ${input.telegramUserId}`,
        `Tipo: ${input.fileType}`,
        `Telegram file ID: ${input.fileId}`,
        'El caso sigue pendiente de revisión hasta que el staff decida.'
      ].join('\n')
    );
  }

  private async record(caseId: number | undefined, type: string, payload: Record<string, unknown>): Promise<void> {
    await this.notifications?.create({ caseId, type, payload });
  }
}
