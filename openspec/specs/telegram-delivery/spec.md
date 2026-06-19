# Telegram Delivery Specification

## Purpose

Defines Telegram as the MVP delivery boundary for patients and staff while keeping business decisions in scheduling, QA, and ingestion domains.

## Requirements

### Requirement: Update Routing and Role Resolution

The system MUST receive Telegram updates and route commands/messages according to conversation state and resolved role. Staff privileges MUST require an authorized Telegram user ID.

#### Scenario: Patient message is routed

- GIVEN an unknown Telegram user with an active patient conversation
- WHEN the user sends a scheduling or question message
- THEN the system routes it to the appropriate patient flow
- AND privileged staff actions are unavailable

#### Scenario: Authorized staff command is accepted

- GIVEN a Telegram user ID present in the staff allowlist
- WHEN the user sends a staff command
- THEN the system treats the update as an authorized staff action

### Requirement: Conversation State Continuity

The system SHALL maintain conversation progress across Telegram updates so scheduling, QA, upload, and staff flows continue from the expected step.

#### Scenario: Flow resumes from saved step

- GIVEN a patient is waiting to choose a date
- WHEN the next Telegram message arrives
- THEN the system interprets the message as date input

#### Scenario: Unexpected input is clarified

- GIVEN a user sends input invalid for the current step
- WHEN the update is processed
- THEN the system asks for valid input without advancing state
