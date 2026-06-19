# Staff Management Specification

## Purpose

Defines staff-only bot capabilities for authorization, practice configuration, knowledge/rule management, and patient reply mediation.

## Requirements

### Requirement: Authorized Staff Operations

The system MUST allow staff operations only for Telegram user IDs explicitly authorized as chiropractor or staff.

#### Scenario: Authorized staff configures practice data

- GIVEN an authorized staff user
- WHEN they update schedules, locations, chiropractor name, or rules
- THEN the system accepts the change for future flows

#### Scenario: Unauthorized user is denied

- GIVEN an unlisted Telegram user ID
- WHEN they attempt a staff command
- THEN the system refuses the action

### Requirement: Staff Knowledge and Rule Uploads

The system SHALL allow authorized staff to upload PDFs/texts for knowledge ingestion and MAY extract candidate rules with Gemini, but extracted rules MUST require staff or chiropractor approval before activation.

#### Scenario: Extracted rule awaits approval

- GIVEN staff uploads a policy PDF
- WHEN candidate rules are extracted
- THEN the rules remain inactive until approved

### Requirement: Mediated Patient Replies

The system MUST send staff replies through the bot and present them as team replies, not as direct staff identity messages.

#### Scenario: Staff replies to patient case

- GIVEN staff responds to a patient case
- WHEN the bot sends the message to the patient
- THEN it is prefixed as "The team replied..." or "El equipo respondió..."
