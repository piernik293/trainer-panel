---
name: Serial IDs in database fixtures
description: PostgreSQL serial sequences may lag behind explicitly seeded fixture rows in integration-test databases.
---

Integration fixtures that insert rows into serial-backed tables must not assume the sequence is synchronized with the highest existing ID. Use a collision-free explicit fixture ID or repair the sequence as part of controlled test setup.

**Why:** Seed data inserted with explicit IDs can leave the sequence below an existing row, causing a fixture setup failure before the behavior under test runs.

**How to apply:** When a database-backed test creates a temporary serial entity in a seeded database, clean it up by a stable fixture key and reserve IDs that cannot collide with the catalogue.