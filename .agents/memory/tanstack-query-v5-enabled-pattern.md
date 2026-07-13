---
name: TanStack Query v5 useQuery enabled pattern
description: In TanStack Query v5, UseQueryOptions requires queryKey — passing {enabled} alone is a TypeScript error.
---

## Rule
Always include `queryKey` alongside `enabled` when passing options to generated hooks.

## Why
TanStack Query v5 made `queryKey` a required field of `UseQueryOptions` (when the generic is bound to a specific key type). Orval-generated hooks type the `query` option as `UseQueryOptions<..., readonly unknown[]>` which requires `queryKey`.

## How to apply
The established project pattern (see `ClientDetail.tsx`):
```typescript
import { useListExerciseRecommendations, getListExerciseRecommendationsQueryKey } from "@workspace/api-client-react";

const params = condition ? { field: value } : {};
const { data } = useListExerciseRecommendations(
  id,
  params,
  { query: { 
    enabled: shouldFetch,
    queryKey: getListExerciseRecommendationsQueryKey(id, params)
  }},
);
```

Every generated hook `useXyz` has a corresponding `getXyzQueryKey(...)` function that should be used to fill in `queryKey`.
