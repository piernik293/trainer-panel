---
name: No-mutation trainer regression
description: Preconditions for read-only authenticated Trainer Panel regression checks.
---

When a regression explicitly forbids authentication and data mutations, its
browser must begin with a real trainer session and an isolated test fixture
already available. If either prerequisite is absent, the correct result is
inconclusive rather than a substituted programmatic login or temporary data
setup.

**Why:** A no-mutation regression is intended to verify the user-facing state
that already exists; changing the authentication or data state invalidates that
evidence.

**How to apply:** State the missing prerequisite plainly and do not claim the
restricted flow passed.