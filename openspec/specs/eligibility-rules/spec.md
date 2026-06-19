# Eligibility Rules Specification

## Purpose

Defines configurable scheduling eligibility rules. Rule behavior belongs to the scheduling domain and MUST NOT be decided by QA.

## Requirements

### Requirement: Configurable Rule Evaluation

The system MUST evaluate patient intake against rule definitions stored in configuration or database records, not hard-coded policy text.

#### Scenario: Active rule produces a decision

- GIVEN an active eligibility rule matches submitted intake
- WHEN scheduling evaluates the intake
- THEN the system applies that rule's configured outcome

#### Scenario: Rule update changes future evaluations

- GIVEN staff updates an approved rule definition
- WHEN a later patient submits matching intake
- THEN the new definition is used

### Requirement: Age Rejection

The system MUST kindly reject patients older than 60 and MUST NOT schedule them.

#### Scenario: Patient age exceeds limit

- GIVEN a patient reports age 61
- WHEN eligibility is evaluated
- THEN the patient receives a kind rejection
- AND no Google Calendar event is created

### Requirement: Review and Radiography Outcomes

The system SHALL mark configured risk cases for staff review, including radiography-required cases, jaw deviation, age >= 56, fall, recent septal hit, or long-term pain with gait/walking limitation.

#### Scenario: Radiography is required

- GIVEN intake matches a radiography-required rule
- WHEN eligibility is evaluated
- THEN the patient is asked to upload radiography via Telegram
- AND the case remains pending staff review
