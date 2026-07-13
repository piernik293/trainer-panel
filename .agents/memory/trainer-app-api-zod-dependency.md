---
name: trainer-app api-zod dependency setup
description: How to add @workspace/api-zod as a dependency to trainer-app.
---

The trainer-app does NOT have `@workspace/api-zod` in its package.json or tsconfig references by default. To import from it:

1. Add to `artifacts/trainer-app/package.json` devDependencies: `"@workspace/api-zod": "workspace:*"`
2. Add to `artifacts/trainer-app/tsconfig.json` references: `{ "path": "../../lib/api-zod" }`
3. Run `pnpm install` and `npx tsc --build lib/api-zod`

**Why:** trainer-app's tsconfig originally only references `lib/api-client-react`. Without the explicit reference, TypeScript can't resolve the module even if it's in pnpm's dependency graph.

**How to apply:** Whenever a new trainer-app page needs to import constants/types directly from `@workspace/api-zod` (not re-exported through api-client-react). This was needed for PlanDraftWizard.tsx.
