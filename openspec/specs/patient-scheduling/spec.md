# Patient Scheduling Specification

## Purpose

Defines the patient appointment flow in the scheduling domain. Google Calendar remains the source of truth for confirmed appointments.

## Requirements

### Requirement: Guided Appointment Flow

The system MUST guide patients through location, date, slot, and intake form before any appointment is confirmed. Intake MUST include full name, DNI, age, district, pain area, pain duration, limitation, gait, assistive device, and motive/reason.

#### Scenario: Patient completes required steps

- GIVEN a patient starts scheduling
- WHEN they select location, date, slot, and submit all intake fields
- THEN the system evaluates eligibility before confirmation

#### Scenario: Missing intake field blocks progress

- GIVEN an intake form missing DNI or age
- WHEN the patient submits it
- THEN the system asks for the missing field and does not book

### Requirement: Initial Schedule Constraints

The system SHALL offer slots only within configured location hours: Surco 10:00-13:00 and VMT 18:00-20:00 initially. Appointment duration MUST NOT exceed 30 minutes.

#### Scenario: Slot is within location hours

- GIVEN Surco is selected
- WHEN the patient requests available slots
- THEN only 30-minute-or-shorter slots within 10:00-13:00 are shown

### Requirement: Review Blocks Calendar Creation

The system MUST NOT create a Google Calendar event for cases requiring staff approval until approval is granted.

#### Scenario: Radiography case is held

- GIVEN eligibility requires radiography review
- WHEN intake is submitted
- THEN no calendar event is created
- AND the case waits for staff approval
