# Cloudflare Migration: Deep Technical Analysis & Strategy

## 1. Executive Summary

This document provides a comprehensive technical analysis of migrating the Mailmon stack from Google Cloud Platform (GCP) to Cloudflare.

Following a deep architectural review and critical constraints analysis, the recommendation is a **phased, hybrid migration**. A "pure zero-GCP" migration is technically impossible without fundamental product changes (due to Gmail Push constraints). Furthermore, aggressively replacing database invariants with Cloudflare edge primitives poses severe "split-brain" transactional risks.

The strategy is to adopt Cloudflare where it provides immediate, low-risk leverage (front-door, edge compute, egress savings) while retaining the existing transactional database boundaries and a minimal GCP messaging footprint.

## 2. The Hard Constraint: Gmail Push requires GCP

The most critical architectural constraint is Gmail's inbound notification system.

- **The Reality:** Gmail’s `users.watch` API explicitly requires a fully qualified Google Cloud Pub/Sub topic in the same developer project.
- **The Verdict:** There is no native Cloudflare equivalent for Gmail push ingress. **Mailmon must retain a minimal "GCP Island" (a Pub/Sub topic and subscription) indefinitely**, or abandon real-time push entirely in favor of polling. The target architecture _must_ be hybrid: Gmail → GCP Pub/Sub → Cloudflare Worker Ingress.

## 3. Core Architectural Adjustments (The Cloudflare Target)

### 3.1. Front-Door & Edge Dispatch (Phase 1)

- **Action:** Move API ingress and webhook delivery to the edge.
- **Implementation:** Cloudflare DNS, CDN, and WAF will front the public API. For webhook delivery, Cloudflare Workers located physically closest to the customer's endpoint will execute the HTTP POST delivery. This drastically minimizes TLS handshake time and delivery latency without altering core sync logic.

### 3.2. Concurrency & Lease Management (Delayed Adoption)

- **Current State:** Single-flight sync guarantees are managed via database-level lease acquisition in Cloud SQL. This lease is updated in the exact same transaction that commits the sync cursor and mailbox events.
- **The Durable Object Risk:** While Cloudflare Durable Objects (DO) provide single-threaded execution, moving lease coordination to a DO while keeping canonical state in Postgres creates a dangerous "split-brain" architecture. If the DO advances but the DB transaction rolls back, state is corrupted.
- **Strategy:** Retain the Postgres lease model for Phase 1 and 2. Durable Objects should only be introduced later as a strict serialiser _in front of_ the database, not as a replacement for the DB's transactional boundary.

### 3.3. Asynchronous Transport (Queues)

- **Action:** Replace internal GCP Pub/Sub dispatch and Cloud Tasks with Cloudflare Queues.
- **Implementation:** Use Queues for high-throughput event routing.
- **Payload Limits (128 KB):** Cloudflare Queues have a strict 128KB limit. Currently, Mailmon only stores canonical metadata (snippets, subjects), so payloads may fit. However, if Mailmon expands to store raw email bodies, a **"Claim Check" pattern** using **Cloudflare R2** (zero egress fee object storage) will be required to pass references through the queue.
- **Execution Time Limits:** Cloudflare Queue consumers have a strict 15-minute wall-clock limit. Long-running historical syncs _must_ be refactored to chunk work and recursively queue continuations.

### 3.4. Database Layer Migration

- **Action:** Relocate Postgres from Cloud SQL to a serverless provider (e.g., Neon or Supabase).
- **Strategy:** Configure **Cloudflare Hyperdrive** to pool Postgres connections at the edge. To mitigate physical network hops between edge workers and a regional database, enable **Smart Placement** so the Worker code executes in a datacenter physically closer to the database.

## 4. Phased Migration Plan

A rushed platform rewrite replaces several solved invariants at once (queue semantics, background limits, auth, and lease coordination). The migration must be strictly phased:

| Phase                        | Scope                                                                                                         | Risk   | Exit Criteria                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| **1. Edge Front Door**       | Cloudflare DNS, TLS, WAF, rate limiting in front of existing GCP Cloud Run origins.                           | Low    | Latency/error budget unchanged or better.                                   |
| **2. Hybrid Ingress**        | Move public API endpoints to Workers. Keep worker/database/async core in GCP.                                 | Medium | Request auth and observability parity proven.                               |
| **3. Webhook Edge Dispatch** | Replace Cloud Tasks with Cloudflare Queues and Workers for webhook deliveries.                                | Medium | Delivery correctness, retry backoff, and signature parity proven.           |
| **4. Core Compute Port**     | Port the internal sync Worker to Cloudflare, backed by Hyperdrive. Retain GCP Pub/Sub for Gmail Push ingress. | High   | CPU, memory, DB latency, and transactional parity proven under load.        |
| **5. DO Optimization**       | Evaluate Durable Objects _only_ if production evidence shows DB-lease bottlenecks.                            | High   | Reduction in contention without breaking transactional rollback guarantees. |

## 5. Cost Profile Analysis

| Component            | GCP Status Quo                                      | Cloudflare Target                                      | Cost Impact               |
| :------------------- | :-------------------------------------------------- | :----------------------------------------------------- | :------------------------ |
| **Compute / API**    | Cloud Run ($$ per vCPU/sec + idle instances).       | Workers Paid Plan ($5/mo for 10M req, $0.30/1M after). | **Massive Reduction**     |
| **Messaging**        | Pub/Sub & Tasks charge per operation and bandwidth. | Queues included (first 1M free, $0.40/1M ops after).   | **Significant Reduction** |
| **Database Compute** | Cloud SQL fixed baseline ($$).                      | Serverless Postgres (Neon/Supabase) + Hyperdrive.      | **Significant Reduction** |
| **Networking**       | GCP egress bandwidth is premium priced.             | Cloudflare charges $0 for egress.                      | **Massive Reduction**     |

## 6. Conclusion

The recommendation is **Conditional Proceed**. Adopt Cloudflare where it acts as a powerful infrastructure and edge-compute layer (Ingress, Egress, Webhook Dispatch), but abandon the goal of a "zero-GCP" rewrite. A minimal GCP footprint is mandatory for Gmail integration, and the current PostgreSQL transactional boundary is Mailmon's strongest correctness guarantee.
