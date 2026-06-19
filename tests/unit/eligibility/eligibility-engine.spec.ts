import { describe, expect, it } from 'vitest';
import { EligibilityEngine, type PatientIntake } from '../../../src/domain/eligibility/eligibility-engine.js';

const baseIntake: PatientIntake = {
  fullName: 'Ada Patient',
  dni: '12345678',
  age: 40,
  district: 'Surco',
  painArea: 'back',
  painDuration: '2 weeks',
  limitation: 'mild pain when bending',
  gait: 'normal',
  assistiveDevice: 'none',
  motive: 'appointment'
};

describe('EligibilityEngine', () => {
  it('rejects age 61 and prevents calendar creation', () => {
    const decision = new EligibilityEngine().evaluate({ ...baseIntake, age: 61 });

    expect(decision.outcome).toBe('reject');
    expect(decision.reasonCode).toBe('AGE_OVER_LIMIT');
    expect(decision.createCalendarEvent).toBe(false);
  });

  it('marks radiography-required cases as pending review', () => {
    const decision = new EligibilityEngine().evaluate({ ...baseIntake, age: 56 });

    expect(decision.outcome).toBe('pending_review');
    expect(decision.requiresRadiography).toBe(true);
    expect(decision.createCalendarEvent).toBe(false);
  });

  it('uses supplied rule definitions for future evaluations', () => {
    const engine = new EligibilityEngine([
      {
        id: 'district-review',
        name: 'District review',
        enabled: true,
        priority: 1,
        match: 'all',
        conditions: [{ field: 'district', operator: 'equals', value: 'VMT' }],
        outcome: {
          kind: 'pending_review',
          reasonCode: 'DISTRICT_REVIEW',
          messageKey: 'eligibility.review.staff_required'
        }
      }
    ]);

    const decision = engine.evaluate({ ...baseIntake, district: 'VMT' });

    expect(decision.outcome).toBe('pending_review');
    expect(decision.matchedRuleId).toBe('district-review');
  });
});
