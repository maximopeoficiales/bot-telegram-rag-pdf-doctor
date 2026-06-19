# RAG QA Specification

## Purpose

Defines informational question answering over staff-approved knowledge. QA is read-only relative to scheduling and eligibility.

## Requirements

### Requirement: Informational Answers Only

The system MUST answer patient questions using approved knowledge and MUST NOT decide appointment eligibility, staff policy activation, or calendar availability.

#### Scenario: Patient asks informational question

- GIVEN approved knowledge contains relevant chiropractic information
- WHEN a patient asks a related question
- THEN the system answers informationally from available knowledge

#### Scenario: Patient asks for booking decision

- GIVEN a patient asks if they can be scheduled
- WHEN QA handles the question
- THEN the system redirects to the scheduling flow
- AND does not make an eligibility decision

### Requirement: Unknown or Unsafe Answer Handling

The system SHALL avoid unsupported answers when approved knowledge is insufficient.

#### Scenario: Knowledge is insufficient

- GIVEN retrieved knowledge does not support an answer
- WHEN a patient asks a question
- THEN the system states it cannot answer from available information

### Requirement: QA Domain Boundary

The QA domain MUST NOT read patient case files as general knowledge and MUST NOT mutate calendar or rule configuration.

#### Scenario: Patient file exists

- GIVEN a patient uploaded a radiography file for review
- WHEN another patient asks a QA question
- THEN the uploaded file is not used as QA knowledge
