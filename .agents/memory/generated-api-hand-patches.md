---
name: Generated API code contains hand patches — never full-regen
description: orval regen from openapi.yaml deletes many hand-added fields; patch generated files by hand instead
---
The files in `lib/api-zod/src/generated/` and `lib/api-client-react/src/generated/` contain MANY fields (injuryStatus, athleteStatus, avoidedExercise*, movementComplexity, sportsPriorities, …) that were hand-patched without updating `lib/api-spec/openapi.yaml`.

**Why:** Running orval codegen regenerates from the yaml and silently DELETES those fields, breaking api-server routes (public.ts, surveys.ts, exercises.ts). This happened when adding `cooperationMode`; fix was `git checkout` of generated dirs + manual insertion of the new field into api.ts, types/*, api.schemas.ts.

**How to apply:** To add an API field, update openapi.yaml for documentation AND hand-edit the generated files (mirror existing style); do NOT run `npm run codegen`/orval until the yaml is reconciled with all hand patches. Also: orval regen re-appends forbidden `export * from './generated/api'` lines to api-zod and api-client-react index.ts; `orval>js-yaml` pnpm override must stay `~4.2.0` under Node 24.
