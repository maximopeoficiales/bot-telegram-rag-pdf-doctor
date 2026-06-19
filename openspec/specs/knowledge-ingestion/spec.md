# Knowledge Ingestion Specification

## Purpose

Defines the ingestion domain for staff-approved practice knowledge. Patient case files are explicitly outside the general knowledge base.

## Requirements

### Requirement: Staff Document Ingestion

The system MUST accept authorized staff PDFs/texts as knowledge sources and make approved content available to QA after ingestion.

#### Scenario: Staff uploads knowledge document

- GIVEN an authorized staff user uploads a practice PDF
- WHEN the document is accepted for ingestion
- THEN the content becomes available for informational QA after processing

#### Scenario: Unauthorized upload is rejected

- GIVEN an unauthorized Telegram user uploads a document
- WHEN ingestion is requested
- THEN the system rejects it as a knowledge source

### Requirement: Patient File Isolation

The system MUST NOT add patient audio, image, PDF, or file uploads to the general RAG knowledge base.

#### Scenario: Patient uploads file

- GIVEN a patient sends an image, PDF, audio, or file
- WHEN the upload is received
- THEN it is attached only to the patient case
- AND it is marked for staff review

### Requirement: Ingestion Boundary

The ingestion domain SHALL prepare knowledge for QA only and MUST NOT create eligibility decisions or calendar state.

#### Scenario: Knowledge ingestion completes

- GIVEN a staff document is ingested
- WHEN processing finishes
- THEN QA can retrieve the document content
- AND scheduling state remains unchanged
