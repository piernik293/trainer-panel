---
name: Vitest Drizzle mock patterns
description: Common pitfalls when mocking Drizzle ORM operators in unit tests
---

## isNull() field key
The `isNull` Drizzle mock must use `field` (not `f`) as the property key:
```js
// CORRECT
isNull: (f: string) => ({ field: f, op: "isNull" })
// WRONG — matchesCondition checks condition.field, not condition.f
isNull: (f: string) => ({ f, op: "isNull" })
```

## Mocking api-zod SubmitPublicSurveyBody in unit tests
When route tests use a minimal `validSurveyPayload` (not all required fields), add:
```js
vi.mock("@workspace/api-zod", () => ({
  SubmitPublicSurveyBody: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
}));
```
This lets unit tests focus on token/ownership logic without needing a full valid survey payload.

## and() mock returns an array
`and: (...args: unknown[]) => args` — the result is a JS array. `matchesCondition` must handle arrays with `Array.isArray` + `.every()` to recurse on each condition.

**Why:** Drizzle's `and()` composes multiple conditions; the mock needs the same composition so UPDATE WHERE conditions work correctly.
