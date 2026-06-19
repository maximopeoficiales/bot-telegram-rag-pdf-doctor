## Exploration: stack-selection

### Current State
`rag-pdf` is a greenfield SDD project with no source stack, package manager, database, vector store, PDF parser, LLM provider integration, or test runner configured yet. The intended product is a RAG system that ingests PDFs/plain text, answers customer questions, and schedules appointments through Google Calendar, starting with a chiropractor scheduling domain.

A vector store, in this project context, is the persistence layer that stores text chunks plus their embedding vectors and metadata. At query time, the app embeds the user's question, searches for semantically similar chunks, and sends the retrieved context to the LLM. It is not the LLM itself and not a replacement for the relational database; it is the retrieval index for RAG.

ChatGPT Plus does not provide production API access for this app. Plus is a subscription for the ChatGPT consumer product. A production application needs OpenAI API keys and API billing, or another provider with equivalent embedding and generation APIs. For OpenAI-based RAG, embeddings are created through the embeddings API and answer generation should use the current Responses API direction.

### Affected Areas
- `openspec/config.yaml` — Already records the project as greenfield, stack undecided, expected clean/hexagonal architecture, hybrid persistence, and empty test/build commands.
- `openspec/specs/` — Empty; future specs should define ingestion, QA answering, and calendar scheduling behavior after stack selection.
- `openspec/changes/stack-selection/` — New change folder for stack selection exploration.
- Future `src/` or `apps/web/` project structure — Will hold the Next.js UI, route handlers/server functions, domain services, RAG pipeline, and provider adapters.
- Future database/vector infrastructure — Needed for documents, chunks, embeddings, appointments integration state, and audit metadata.

### Approaches
1. **Next.js full-stack TypeScript with domain-first modules** — Use Next.js App Router for UI and HTTP/server entry points, but keep business logic in framework-independent modules.
   - Pros: One TypeScript stack; App Router supports Server Components and `route.ts` handlers; good fit for dashboard/chat UI; easy to keep server-only LLM, embedding, database, and Google Calendar calls off the client; lower operational complexity for a greenfield solo project.
   - Cons: Long-running PDF ingestion and embedding jobs should not live directly inside request/response handlers; clear boundaries are required so framework files do not become the whole architecture.
   - Effort: Medium

2. **Classic MVC inside Next.js** — Treat routes/pages as controllers, models as database records, and views as React pages/components.
   - Pros: Familiar mental model; fast to explain for CRUD screens; acceptable for simple admin pages.
   - Cons: Weak fit for RAG pipelines, provider adapters, async ingestion, and scheduling workflows; tends to mix framework, infrastructure, and business rules; makes future tests and provider swaps harder.
   - Effort: Low initially, Medium/High later

3. **Separate frontend and backend services** — Next.js frontend plus a standalone Node API/worker service for ingestion, RAG, scheduling, and provider integrations.
   - Pros: Strong isolation for background jobs, queues, and scaling; clean deployment boundaries; easier to run heavy PDF/embedding work outside the web app.
   - Cons: More infrastructure and coordination from day one; premature for a greenfield project without proven traffic or workload constraints.
   - Effort: High

4. **PDF parsing options in Node/TypeScript** — Use a Node PDF parsing library for text extraction during ingestion, with the parser hidden behind a `PdfTextExtractor` port.
   - Pros: Libraries such as `pdf-parse`/PDF.js-style wrappers are simple for text-based PDFs; `pdfjs-dist` gives more control; external extraction tools can be added later for scanned/OCR-heavy documents.
   - Cons: PDFs vary wildly; scanned PDFs need OCR; tables/layouts may extract poorly; parser choice should remain replaceable behind an adapter.
   - Effort: Low/Medium depending on PDF quality

### Recommendation
Choose a TypeScript-first stack centered on Next.js App Router, but do not use MVC as the primary architecture. Use a clean/hexagonal/domain-first structure: Next.js pages, server functions, and route handlers are delivery adapters; domain/application services own ingestion, retrieval, answering, and scheduling use cases; infrastructure adapters implement OpenAI, vector store, PDF parser, relational database, and Google Calendar.

Recommended baseline stack for proposal/design:
- Next.js + TypeScript for the frontend and server entry points.
- Domain-first modules for `knowledge-ingestion`, `qa-answering`, and `calendar-scheduling`.
- PostgreSQL as the primary relational database; prefer pgvector initially as the vector store to keep persistence simple unless scale or operations require Qdrant later.
- OpenAI API for embeddings and generation, with provider interfaces so the app can later swap to another LLM/embedding provider.
- Node PDF parser adapter starting with a simple text extraction library, but design for replacement/OCR fallback.
- Background job path for ingestion/embedding work rather than doing large PDFs synchronously in a route handler.
- Vitest for unit tests and Playwright later for critical browser flows once the app exists.

This gives the user the Next.js frontend they want without trapping the core product inside framework files. It also keeps RAG fundamentals explicit: parse documents, chunk text, embed chunks, store vectors, retrieve relevant chunks, then generate an answer.

### Risks
- Assuming ChatGPT Plus can power production features would block implementation; API keys and billing must be set up separately.
- PDF extraction quality may be poor for scanned documents, tables, or complex layouts unless OCR/layout-aware parsing is added.
- Synchronous ingestion in Next.js request handlers could hit timeouts or poor UX for larger PDFs.
- MVC-only structure risks coupling RAG and scheduling rules to framework routes.
- Vector store choice affects local development, deployment, backups, and retrieval quality; pgvector is simple, but dedicated vector databases may be better later for scale.

### Ready for Proposal
Yes — the orchestrator should tell the user that the recommended direction is TypeScript + Next.js App Router with a clean/hexagonal/domain-first architecture, OpenAI API billing instead of ChatGPT Plus, PostgreSQL + pgvector as the initial vector store, replaceable Node PDF parsing behind an adapter, and explicit background ingestion for PDF embedding work.
