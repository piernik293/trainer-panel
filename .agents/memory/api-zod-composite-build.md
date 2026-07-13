---
name: api-zod composite build required after adding exports
description: Adding new source files to lib/api-zod requires rebuilding the composite lib before TypeScript can resolve the new exports.
---

When you add a new `.ts` file to `lib/api-zod/src/` and re-export it from `index.ts`, the TypeScript composite project must be rebuilt before consuming packages (api-server, trainer-app) can see the new exports. Otherwise TypeScript reports "has no exported member" for every symbol in the new file.

**Why:** `lib/api-zod` has `composite: true` with `emitDeclarationOnly: true`. Downstream packages resolve the module from `dist/` declaration files, not from source. The `dist/` is stale until rebuilt.

**How to apply:** After editing any file in `lib/api-zod/src/`, run:
```
npx tsc --build lib/api-zod
```
Then run `pnpm install` if you also added a new workspace dep to any artifact package.json, and rebuild `lib/api-client-react` similarly if needed.

Same pattern applies to `lib/api-client-react` (also `composite: true`).
