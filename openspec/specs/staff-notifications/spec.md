# Staff Notifications Specification

## Purpose

Defines notifications to the private staff group for appointment and case events requiring team awareness.

## Requirements

### Requirement: Appointment Notifications

The system MUST notify the private staff group when a new appointment is confirmed.

#### Scenario: Appointment is confirmed

- GIVEN a patient successfully books an appointment
- WHEN the calendar event is created
- THEN the staff group receives appointment details needed for follow-up

### Requirement: Patient File Notifications

The system SHALL notify staff when patients upload audio, image, PDF, or other files, and MUST mark the case for review.

#### Scenario: Patient uploads radiography

- GIVEN a case requires radiography review
- WHEN the patient uploads the radiography file via Telegram
- THEN the private staff group is notified
- AND the case remains pending review until staff decides

### Requirement: Pending Review Notifications

The system MUST alert staff for cases that require approval before scheduling, including radiography and configured risk-rule outcomes.

#### Scenario: Review-required case is created

- GIVEN eligibility marks a case for staff review
- WHEN the case is saved
- THEN the staff group receives a pending-review notification
- AND no confirmed appointment notification is sent
