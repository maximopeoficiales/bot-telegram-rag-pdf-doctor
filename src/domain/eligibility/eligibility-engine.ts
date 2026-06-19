export type EligibilityOutcomeKind = 'pass' | 'reject' | 'pending_review';

export type EligibilityOutcome = {
  kind: EligibilityOutcomeKind;
  reasonCode: string;
  messageKey: string;
  requiresRadiography?: boolean;
};

export type PatientIntake = {
  fullName: string;
  dni: string;
  age: number;
  district: string;
  painArea: string;
  painDuration: string;
  limitation: string;
  gait: 'normal' | 'imbalance';
  assistiveDevice: string;
  motive: string;
  fall?: boolean;
  recentSeptalHit?: boolean;
  jawDeviation?: boolean;
};

export type EligibilityCondition =
  | { field: keyof PatientIntake; operator: 'gt' | 'gte'; value: number }
  | { field: keyof PatientIntake; operator: 'equals'; value: string | number | boolean }
  | { field: keyof PatientIntake; operator: 'includes'; value: string };

export type EligibilityRuleDefinition = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  match: 'all' | 'any';
  conditions: EligibilityCondition[];
  outcome: EligibilityOutcome;
};

export const defaultEligibilityRules: EligibilityRuleDefinition[] = [
  {
    id: 'age-over-limit',
    name: 'Age over scheduling limit',
    enabled: true,
    priority: 10,
    match: 'all',
    conditions: [{ field: 'age', operator: 'gt', value: 60 }],
    outcome: { kind: 'reject', reasonCode: 'AGE_OVER_LIMIT', messageKey: 'eligibility.reject.age_over_limit' }
  },
  {
    id: 'age-radiography-review',
    name: 'Age needs radiography review',
    enabled: true,
    priority: 20,
    match: 'all',
    conditions: [{ field: 'age', operator: 'gte', value: 56 }],
    outcome: {
      kind: 'pending_review',
      reasonCode: 'RADIOGRAPHY_REVIEW_REQUIRED',
      messageKey: 'eligibility.review.radiography_required',
      requiresRadiography: true
    }
  },
  {
    id: 'fall-radiography-review',
    name: 'Fall needs radiography review',
    enabled: true,
    priority: 30,
    match: 'all',
    conditions: [{ field: 'fall', operator: 'equals', value: true }],
    outcome: {
      kind: 'pending_review',
      reasonCode: 'FALL_REVIEW_REQUIRED',
      messageKey: 'eligibility.review.radiography_required',
      requiresRadiography: true
    }
  },
  {
    id: 'recent-septal-hit-review',
    name: 'Recent septal hit needs review',
    enabled: true,
    priority: 40,
    match: 'all',
    conditions: [{ field: 'recentSeptalHit', operator: 'equals', value: true }],
    outcome: {
      kind: 'pending_review',
      reasonCode: 'SEPTAL_HIT_REVIEW_REQUIRED',
      messageKey: 'eligibility.review.radiography_required',
      requiresRadiography: true
    }
  },
  {
    id: 'jaw-deviation-review',
    name: 'Jaw deviation needs staff review',
    enabled: true,
    priority: 50,
    match: 'all',
    conditions: [{ field: 'jawDeviation', operator: 'equals', value: true }],
    outcome: {
      kind: 'pending_review',
      reasonCode: 'JAW_DEVIATION_REVIEW_REQUIRED',
      messageKey: 'eligibility.review.staff_required'
    }
  },
  {
    id: 'long-pain-gait-review',
    name: 'Long-term pain with gait limitation needs radiography review',
    enabled: true,
    priority: 60,
    match: 'all',
    conditions: [
      { field: 'painDuration', operator: 'includes', value: 'long' },
      { field: 'gait', operator: 'equals', value: 'imbalance' }
    ],
    outcome: {
      kind: 'pending_review',
      reasonCode: 'LONG_PAIN_GAIT_REVIEW_REQUIRED',
      messageKey: 'eligibility.review.radiography_required',
      requiresRadiography: true
    }
  }
];

export type EligibilityDecision = {
  outcome: EligibilityOutcomeKind;
  reasonCode: string;
  messageKey: string;
  matchedRuleId?: string;
  requiresRadiography: boolean;
  createCalendarEvent: boolean;
};

export class EligibilityEngine {
  constructor(private readonly rules: EligibilityRuleDefinition[] = defaultEligibilityRules) {}

  evaluate(intake: PatientIntake): EligibilityDecision {
    const matchedRule = this.rules
      .filter((rule) => rule.enabled)
      .sort((a, b) => a.priority - b.priority)
      .find((rule) => this.matches(rule, intake));

    if (!matchedRule) {
      return {
        outcome: 'pass',
        reasonCode: 'ELIGIBLE',
        messageKey: 'eligibility.pass',
        requiresRadiography: false,
        createCalendarEvent: true
      };
    }

    return {
      outcome: matchedRule.outcome.kind,
      reasonCode: matchedRule.outcome.reasonCode,
      messageKey: matchedRule.outcome.messageKey,
      matchedRuleId: matchedRule.id,
      requiresRadiography: matchedRule.outcome.requiresRadiography ?? false,
      createCalendarEvent: matchedRule.outcome.kind === 'pass'
    };
  }

  private matches(rule: EligibilityRuleDefinition, intake: PatientIntake): boolean {
    const results = rule.conditions.map((condition) => this.matchesCondition(condition, intake));
    return rule.match === 'all' ? results.every(Boolean) : results.some(Boolean);
  }

  private matchesCondition(condition: EligibilityCondition, intake: PatientIntake): boolean {
    const value = intake[condition.field];

    switch (condition.operator) {
      case 'gt':
        return typeof value === 'number' && value > condition.value;
      case 'gte':
        return typeof value === 'number' && value >= condition.value;
      case 'equals':
        return value === condition.value;
      case 'includes':
        return typeof value === 'string' && value.toLowerCase().includes(condition.value.toLowerCase());
    }
  }
}
