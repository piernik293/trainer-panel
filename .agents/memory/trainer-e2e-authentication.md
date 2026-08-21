---
name: Trainer E2E authentication
description: Authentication constraint for read-only Trainer Panel browser diagnostics.
---

Do not assume an authenticated Trainer Panel session visible in deployment logs or another browser is available to an isolated browser tester. An attempted managed-Clerk test-claim override using an existing trainer identity still resolved to the sign-in screen, and proceeding further would have risked creating a new auth user or trainer row.

**Why:** Repeated navigation diagnostics require access to existing clients owned by the authenticated trainer. A fresh or newly provisioned test identity has no such ownership and cannot exercise the real flow safely.

**How to apply:** For future read-only Trainer Panel stress tests, first obtain an explicitly authenticated test path that owns at least two existing non-production clients. Stop rather than bypassing authentication or provisioning data when the task forbids mutations.