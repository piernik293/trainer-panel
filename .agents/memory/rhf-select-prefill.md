---
name: React Hook Form + Radix Select prefill bug
description: A Select field bound via react-hook-form Controller can stay stuck on its placeholder after an async form.reset(), even though other fields (Inputs) using the same field.value pattern update correctly.
---

## Symptom
On an edit form that loads data asynchronously (e.g. `useQuery` + `useEffect(() => form.reset(data), [data])`), text `<Input {...field}>` fields correctly show the loaded value, but shadcn/Radix `<Select value={field.value}>` fields keep showing their placeholder — even though `form.getValues(name)` proves the value was set correctly by `reset()`.

This is not a Radix `SelectValue` item-registration issue and not an encoding issue — the underlying field value is genuinely not reaching the rendered Select on the first data-driven reset, for reasons that resisted several rounds of manual reproduction (removing `defaultValue`, passing explicit children to `SelectValue`, confirming exact string byte-equality). Root cause was not conclusively identified; it may be specific to how repeated component instances interact with Fast Refresh / HMR during dev.

## Fix that reliably works
Don't call `form.reset()` in a `useEffect` after mount. Instead:
1. Keep the data-fetching component thin: fetch the record, show a loading state until data is ready.
2. Extract the actual form into a child component that receives the loaded record as a prop.
3. Mount the child with `key={record?.id ?? "new"}` and compute `useForm({ defaultValues: computeFromRecord(record) })` directly — no `reset()` call needed at all.

This guarantees the form (and all its Controllers, including Select) initializes with correct data from the very first render, sidestepping any post-mount reset timing/subscription issue entirely.

**Why:** Spent significant debugging time confirming the RHF value was correct via `getValues()` while the rendered Select stayed on placeholder — proving it's a render-subscription problem, not a data problem. Remounting sidesteps the whole class of bug instead of chasing the root cause.

**How to apply:** Any edit form in this codebase (or similar RHF + shadcn Select stacks) that prefills from an async fetch should use the "key the form on record id, compute defaultValues directly" pattern rather than `reset()` in an effect.
