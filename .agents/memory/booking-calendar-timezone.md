---
name: Booking calendar timezone model
description: How booking availability/slot times are interpreted and must be displayed
---

Rule: all booking availability and slot times are the trainer's wall time in Europe/Warsaw. The server converts wall time → UTC instants (bookingSlots service); both frontends must format every booking timestamp with an explicit `timeZone: "Europe/Warsaw"` (including date-grouping keys, e.g. `toLocaleDateString("en-CA", { timeZone })`).

**Why:** a client or trainer with a device set to another timezone would otherwise see (and book) a shifted wall time — caught in code review. No configurable timezone settings by design (MVP scope).

**How to apply:** any new UI that renders booking/availability times must pass the explicit timeZone; any new server-side slot logic must reuse the wall-time→UTC helpers instead of naive Date math. Double-booking safety relies on the partial unique index on (trainer_id, starts_at) WHERE status='booked' — cancellations free slots by falling out of the index; never hard-delete bookings.
