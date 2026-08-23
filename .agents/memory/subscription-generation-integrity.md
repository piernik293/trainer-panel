---
name: Subscription generation integrity
description: Concurrency and idempotency rules for quota-counted automatic plan generation.
---

Treat one automatic plan generation as a server-owned monthly session, not as a collection of loosely related requests. Reserve the quota before expensive generation, bind each expected day to both its request and immutable output, and reject changed retries.

Balance and finalization must use the same trainer-scoped generation lock. Finalization is valid only after every expected day has a stored output, and exercise-history insertion must commit atomically with the session transition to completed.

**Why:** Request hashes alone did not stop a balance/finalize race or two concurrent finalization requests from associating different exercise sets with one generation ID.

**How to apply:** Any future generator endpoint that reads, transforms, or commits a quota-counted generation must participate in the shared session lock and validate against the stored outputs rather than trusting a frontend-provided exercise list.