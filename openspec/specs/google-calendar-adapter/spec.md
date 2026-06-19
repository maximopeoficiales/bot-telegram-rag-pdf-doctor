# Google Calendar Adapter Specification

## Purpose

Defines calendar behavior for scheduling. One shared Google Calendar is the source of truth for confirmed appointments.

## Requirements

### Requirement: Availability from Calendar Truth

The system MUST compute available slots from configured schedules and live Google Calendar busy state.

#### Scenario: Busy time is excluded

- GIVEN configured hours contain a slot that overlaps a busy calendar event
- WHEN availability is requested
- THEN the overlapping slot is not offered

#### Scenario: Slot outside schedule is excluded

- GIVEN a patient selects VMT
- WHEN slots are computed
- THEN slots outside 18:00-20:00 are excluded

### Requirement: Confirmed Event Creation

The system SHALL create calendar events only for eligible, confirmed appointments in the shared calendar.

#### Scenario: Eligible patient confirms slot

- GIVEN eligibility passes and the selected slot is still free
- WHEN the patient confirms booking
- THEN a Google Calendar event is created

#### Scenario: Slot becomes unavailable

- GIVEN a selected slot was available earlier
- WHEN final confirmation finds it busy
- THEN no event is created
- AND the patient is asked to choose another slot
