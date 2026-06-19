import type { GenerationPort } from '../../ports/ai.port.js';

export type StaffAuthorizationPort = {
  isAuthorized(telegramUserId: string): Promise<boolean>;
};

export type StaffAllowlistRepository = StaffAuthorizationPort & {
  addStaff(telegramUserId: string): Promise<void>;
  disableStaff(telegramUserId: string): Promise<void>;
};

export type PracticeConfigRepository = {
  upsertLocation(input: { id: string; name: string; timezone: string; enabled: boolean }): Promise<void>;
  upsertSchedule(input: {
    locationId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    appointmentDurationMinutes: number;
    enabled: boolean;
  }): Promise<void>;
};

export type RuleDraftRepository = {
  createDraft(input: { sourceDocumentId?: number; proposedDefinition: unknown; status: 'pending' }): Promise<number>;
};

export type StaffOperationResult = { accepted: true } | { accepted: false; reason: 'unauthorized' };

export class StaffManagementService {
  constructor(
    private readonly authorization: StaffAuthorizationPort,
    private readonly allowlist: StaffAllowlistRepository,
    private readonly config: PracticeConfigRepository,
    private readonly ruleDrafts: RuleDraftRepository,
    private readonly generation: GenerationPort
  ) {}

  async addStaff(actorTelegramUserId: string, targetTelegramUserId: string): Promise<StaffOperationResult> {
    if (!(await this.authorization.isAuthorized(actorTelegramUserId))) {
      return { accepted: false, reason: 'unauthorized' };
    }

    await this.allowlist.addStaff(targetTelegramUserId);
    return { accepted: true };
  }

  async configureLocation(actorTelegramUserId: string, input: Parameters<PracticeConfigRepository['upsertLocation']>[0]): Promise<StaffOperationResult> {
    if (!(await this.authorization.isAuthorized(actorTelegramUserId))) {
      return { accepted: false, reason: 'unauthorized' };
    }

    await this.config.upsertLocation(input);
    return { accepted: true };
  }

  async configureSchedule(actorTelegramUserId: string, input: Parameters<PracticeConfigRepository['upsertSchedule']>[0]): Promise<StaffOperationResult> {
    if (!(await this.authorization.isAuthorized(actorTelegramUserId))) {
      return { accepted: false, reason: 'unauthorized' };
    }

    await this.config.upsertSchedule(input);
    return { accepted: true };
  }

  async createRuleDraftsFromDocument(input: {
    actorTelegramUserId: string;
    sourceDocumentId?: number;
    title: string;
    content: string;
  }): Promise<StaffOperationResult & { draftIds?: number[] }> {
    if (!(await this.authorization.isAuthorized(input.actorTelegramUserId))) {
      return { accepted: false, reason: 'unauthorized' };
    }

    const extractedRules = await this.generation.extractRules({ title: input.title, content: input.content });
    const draftIds = await Promise.all(
      extractedRules.map((proposedDefinition) =>
        this.ruleDrafts.createDraft({ sourceDocumentId: input.sourceDocumentId, proposedDefinition, status: 'pending' })
      )
    );

    return { accepted: true, draftIds };
  }
}
