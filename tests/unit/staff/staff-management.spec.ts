import { describe, expect, it } from 'vitest';
import { StaffManagementService, type PracticeConfigRepository, type RuleDraftRepository, type StaffAllowlistRepository } from '../../../src/application/staff/staff-management.js';
import type { GenerationPort } from '../../../src/ports/ai.port.js';

describe('StaffManagementService', () => {
  it('denies unauthorized staff configuration', async () => {
    const service = makeService(false);

    const result = await service.configureLocation('patient-1', {
      id: 'surco',
      name: 'Surco',
      timezone: 'America/Lima',
      enabled: true
    });

    expect(result).toEqual({ accepted: false, reason: 'unauthorized' });
  });

  it('stores extracted Gemini rule candidates as pending drafts', async () => {
    const drafts: unknown[] = [];
    const service = makeService(true, drafts);

    const result = await service.createRuleDraftsFromDocument({
      actorTelegramUserId: 'staff-1',
      sourceDocumentId: 20,
      title: 'Policy',
      content: 'Patients older than 60 need a kind rejection.'
    });

    expect(result.accepted).toBe(true);
    expect(result.draftIds).toEqual([1]);
    expect(drafts).toEqual([{ sourceDocumentId: 20, proposedDefinition: { id: 'candidate-rule' }, status: 'pending' }]);
  });
});

function makeService(authorized: boolean, drafts: unknown[] = []) {
  const allowlist: StaffAllowlistRepository = {
    async isAuthorized() {
      return authorized;
    },
    async addStaff() {},
    async disableStaff() {}
  };
  const config: PracticeConfigRepository = {
    async upsertLocation() {},
    async upsertSchedule() {}
  };
  const ruleDrafts: RuleDraftRepository = {
    async createDraft(input) {
      drafts.push(input);
      return drafts.length;
    }
  };
  const generation: GenerationPort = {
    async answer() {
      return '';
    },
    async extractRules() {
      return [{ id: 'candidate-rule' }];
    }
  };

  return new StaffManagementService(allowlist, allowlist, config, ruleDrafts, generation);
}
