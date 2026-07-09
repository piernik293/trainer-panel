---
name: Dual survey form parity (client-landing vs trainer-app)
description: Training interview has two independent form implementations (public client form + trainer edit form) sharing one API/DB schema — new conditional fields must be added to both, and the "required-if" business rule must be enforced server-side, not just in one client form.
---

The training interview exists as two separately-coded React forms — `client-landing`'s public `SurveyForm.tsx` and `trainer-app`'s own `SurveyForm.tsx` — both writing to the same `surveys` schema via API. They are not shared components.

**Why:** a conditional field (`trainingGoalOther`, required only when `trainingGoal === "Inny"`) was added to the client form in an earlier task but never ported to the trainer's own create/edit form, and the API's `PUT /clients/:clientId/survey` route had no matching validation (only the public submit route did) — so a trainer editing a survey manually had no way to see/set the field, and could bypass the requirement entirely via that route.

**How to apply:** when adding/changing a conditional or required field in this project's survey feature, update: (1) client-landing's form, (2) trainer-app's form, and (3) both API mutation routes' server-side validation (public submit route AND the trainer PUT route) — not just one side.
