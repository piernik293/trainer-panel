# Workout Plan Draft Generator — Specification
# PHASE 0: Audit, Product and Technical Design

**Document version:** 1.0  
**Date:** 2026-07-13  
**Status:** READY FOR REVIEW — no production code modified

---

## Table of Contents

1. [Current-System Audit](#1-current-system-audit)
2. [Existing Reusable Modules](#2-existing-reusable-modules)
3. [Missing Capabilities](#3-missing-capabilities)
4. [Architecture Limitations](#4-architecture-limitations)
5. [Recommended Trainer Flow](#5-recommended-trainer-flow)
6. [Wizard Screen Descriptions](#6-wizard-screen-descriptions)
7. [Input Mapping](#7-input-mapping)
8. [Decision Matrix](#8-decision-matrix)
9. [Four Experience Profiles](#9-four-experience-profiles)
10. [Weekly Volume Rules](#10-weekly-volume-rules)
11. [Volume Distribution Rules](#11-volume-distribution-rules)
12. [Split Recommendation Rules](#12-split-recommendation-rules)
13. [Exercise Selection Rules](#13-exercise-selection-rules)
14. [Exercise Order Rules](#14-exercise-order-rules)
15. [Set Allocation Rules](#15-set-allocation-rules)
16. [Repetition Rules](#16-repetition-rules)
17. [RIR Rules](#17-rir-rules)
18. [Tempo Rules](#18-tempo-rules)
19. [Rest Rules](#19-rest-rules)
20. [Warm-up Rules](#20-warm-up-rules)
21. [Duration Model](#21-duration-model)
22. [Progression MVP](#22-progression-mvp)
23. [Warning Catalogue](#23-warning-catalogue)
24. [Explanation Model](#24-explanation-model)
25. [Proposed Data Contracts](#25-proposed-data-contracts)
26. [MVP Scope](#26-mvp-scope)
27. [Deferred Scope](#27-deferred-scope)
28. [Implementation Roadmap](#28-implementation-roadmap)
29. [Test Strategy](#29-test-strategy)
30. [Risks and Unresolved Decisions](#30-risks-and-unresolved-decisions)

---

## 1. Current-System Audit

### Audit Scope

Every capability was verified through: Database schema → API routes → backend services → Zod schemas → frontend types → React components → tests.

### 1.1 Training Interview

**Status: Ready to reuse**

Survey data is stored in `surveysTable` (one row per submission, linked to `clients.id`). The latest row for a client is always used for plan generation.

Confirmed fields available from the survey:

| Field | Type | Notes |
|---|---|---|
| `trainingGoal` | text | Free-text; common values: "Budowa sylwetki", "Zwiększenie siły", "Inny" |
| `trainingGoalOther` | text | Shown when trainingGoal = "Inny" |
| `experienceLevel` | text | Enum: "Brak aktywności fizycznej" / "Początkujący" / "Średniozaawansowany" / "Zaawansowany" |
| `weeklyFrequency` | integer | Historical/actual weekly training days |
| `desiredWeeklyFrequency` | integer | Desired training days per week |
| `sessionDuration` | text | e.g. "45", "60", "90" (minutes, stored as text) |
| `trainingLocation` | text | "Siłownia" / "Dom" / "Siłownia plenerowa" |
| `equipment` | text | Comma-separated or free text; NOT a structured array in DB |
| `activityLevel` | text | "Siedzący" / "Lekko aktywny" / "Praca fizyczna" / "Bardzo aktywny" |
| `sleepHours` | text | Hours as text (e.g. "7") |
| `stressLevel` | integer | Numeric; likely 1–5 or 1–10, scale not enforced by DB |
| `healthLimitations` | text | Free-text description |
| `preferredMuscles` | text | Free-text |
| `avoidedMuscles` | text | Free-text |
| `avoidedExercises` | text | Legacy free-text field (pre-Task #9) |
| `avoidedExerciseIds` | integer[] | Structured avoided exercise IDs (Task #9) |
| `avoidedExerciseReasons` | jsonb | `{ "exerciseId": "reason text" }` |
| `avoidedExerciseOtherText` | text | Free-text "other" avoided exercise description |
| `avoidedExerciseOtherReason` | text | Reason for the "other" avoided exercise |
| `favoriteExercises` | text | Free-text preferred exercises |
| `priorityMuscle1/2/3` | text | Up to 3 priority muscle groups |
| `planStylePreference` | text | "Maksymalna efektywność" / "Balans efektywności i wygody" / "Prosty i łatwy do utrzymania" |
| `avoidsAdvancedMethods` | boolean | Whether client avoids advanced training techniques |
| `advancedMethodsToAvoid` | text[] | Specific methods to avoid |
| `additionalInfo` | text | Free-text trainer notes |
| `age` / `gender` / `heightCm` / `weightKg` | various | Anthropometric data |
| `dateOfBirth` | date | |
| `trainingDuration` | text | Duration of prior training experience |

**Gaps in survey data relevant to generation:**
- `equipment` is stored as text (not a structured array) → must be parsed or matched against exercise equipment strings.
- `sessionDuration` is stored as text → must be parsed to integer (minutes).
- `sleepHours` is stored as text → must be parsed to integer.
- `stressLevel` has no enforced range in DB → must be clamped at generation time.
- There is no `recoveryQuality` field — it must be derived from `sleepHours`, `stressLevel`, and `activityLevel`.
- There is no `physicalWork` boolean — it must be derived from `activityLevel = "Praca fizyczna"`.
- There is no explicit `planBlockDuration` field (weeks in a block) → **Requires product decision.**
- There is no explicit `preferredTrainingStyle` split field (FBW/PPL/Upper-Lower) → **Requires product decision.**

### 1.2 Client Profile

**Status: Ready to reuse**

`clientsTable`: `id`, `firstName`, `lastName`, `email`, `phone`, `notes`, `status`.  
Trainer can view full survey data in `ClientDetail.tsx`.  
"Nowy plan" button exists in the Plans tab (`/clients/:clientId/plans/new`).  
Trainers can also edit survey data via "Nowa wersja wywiadu treningowego" button.

### 1.3 Four Experience Levels

**Status: Ready to reuse**

Exactly four levels exist in the application, consistently used in:
- `surveysTable.experienceLevel`
- `volume_guidelines.experienceLevel`
- `exercises.suitableExperienceLevels` (text array)
- Recommendation engine scoring (`exerciseRecommendationEngine.ts`)

Levels:
1. `"Brak aktywności fizycznej"`
2. `"Początkujący"`
3. `"Średniozaawansowany"`
4. `"Zaawansowany"`

### 1.4 Volume Targets

**Status: Ready to reuse**

11 active volume targets in `volume_targets` table. Each target has:
- `name`, `targetType` (specific_muscle / muscle_group), `broadCategory`, `isActive`
- Member muscles via `volume_target_members` → `specific_muscles`
- Coefficient per exercise via `exercise_muscle_assignments`

### 1.5 Volume Guidelines

**Status: Ready to reuse**

44 rows in `volume_guidelines`: 11 targets × 4 experience levels.  
Each row: `sessionMin`, `sessionMax`, `weeklyPreferredCeiling`, `weeklyAbsoluteCeiling`.

### 1.6 Volume Calculator

**Status: Ready to reuse**

`artifacts/api-server/src/services/volumeCalculator.ts`

- `computeVolumeCore`: pure function, shared by all callers
- `calculatePlanVolume`: for saved plans (reads from DB)
- `calculateVolumePreview`: for live draft (reads from request body)
- **Max-coefficient rule**: for each (exercise, volume target), contribution = `workingSets × max(member coefficient)` — prevents double-counting composite targets
- Warm-up sets are strictly excluded from all calculations
- Returns `weeklyEffectiveSets`, `status` (below/within/above preferred/absolute), per-session warnings

### 1.7 Exercise Library

**Status: Ready to reuse**

87 active exercises in `exercises` table. Key metadata per exercise:

| Column | Type | Notes |
|---|---|---|
| `name`, `slug` | text | Unique identifier |
| `mainMuscleGroup` | text | Primary muscle group |
| `secondaryMuscleGroups` | text[] | Additional muscles |
| `equipment` | text[] | Required equipment items |
| `trainingLocation` | text[] | Compatible locations |
| `suitableExperienceLevels` | text[] | Suitable experience levels |
| `trainingGoals` | text[] | Associated training goals |
| `exerciseType` | text | "Złożone" / "Izolowane" |
| `movementPattern` | text | Push / Pull / Squat / Hinge / Core / Carry / etc. |
| `movementCategory` | text | Sub-category (e.g. "Horyzontalne pchanie") |
| `execution` | text | Bilateral / Unilateral |
| `learningDifficulty` | integer | Technical learning complexity |
| `neurologicalFatigue` | integer | CNS fatigue potential |
| `domsPotential` | integer | Delayed-onset muscle soreness potential |
| `requiresSpotter` | boolean | |
| `canBePerformedToFailure` | boolean | |
| `exercisePriority` | text | Programming importance |
| `difficultyLevel` | text | Technical difficulty |
| `isActive` | boolean | Must be true for use in plans |

### 1.8 Exercise Recommendation Engine

**Status: Ready to reuse (partial)**

Located at `artifacts/api-server/src/services/exerciseRecommendationEngine.ts`.

Produces a 0–100 score per exercise for a given client. Scoring factors (max points):

| Factor | Max Points |
|---|---|
| Experience level fit | +25 |
| Training goal alignment | +20 |
| Training location match | +20 |
| Equipment accessibility | +15 |
| Priority muscle targeting | +15 |
| Intrinsic exercise priority | +10 |
| Difficulty level appropriateness | +10 |
| Introductory-stage fit (no-activity bonus) | +19 (replaces some above) |
| Avoided muscle penalty | −30 / −15 |

**MAX_RAW_SCORE = 115**, normalized to 0–100.  
Also generates `matchReasons` and `warnReasons` (human-readable strings).

**Current gaps for draft generation:**
- Does not rank by `neurologicalFatigue`, `domsPotential`, `learningDifficulty`, `requiresSpotter`, `canBePerformedToFailure` (only checks experience and difficulty level, not individual metadata integers).
- Does not filter by `avoidedExerciseIds` (only penalizes avoided *muscles*, not avoided *exercises*).
- Does not apply `CLIENT_AVOIDS_EXERCISE` at the ranking stage — this penalty must be added.
- Does not produce deterministic ordering within the same score band — a tiebreaker rule is needed.

### 1.9 Client Avoided Exercises

**Status: Ready to reuse**

- `avoidedExerciseIds` (integer[]), `avoidedExerciseReasons` (jsonb), `avoidedExerciseOtherText`, `avoidedExerciseOtherReason` in `surveysTable`.
- `GET /clients/:clientId/avoided-exercises` returns resolved names + activity status.
- `planAnalyzer.ts` emits `CLIENT_AVOIDS_EXERCISE` (notice, non-blocking) when an avoided exercise appears in the plan.
- `AnalysisPanel.tsx` renders these warnings in a dedicated block.
- Picker in `PlanEditor.tsx` shows "⚠ klient unika" badge.

### 1.10 Workout Builder Phase 1

**Status: Ready to reuse**

Plan creation: `POST /clients/:clientId/plans`. Requires `experienceLevel` from client's survey (blocks creation if missing). Returns plan with empty day list.

### 1.11 Workout Builder Phase 2

**Status: Ready to reuse**

Full day + exercise management:
- Add/edit/delete/reorder days (`workout_plan_days`)
- Add/edit/delete/reorder exercises within days (`workout_plan_exercises`)
- Exercise picker (all exercises or recommendation-scored list)
- Drag-and-drop via `@dnd-kit`

### 1.12 Workout Builder Phase 3

**Status: Ready to reuse**

Real-time analysis panel:
- `POST /plans/volume-preview` → per-target volume comparison
- `POST /plans/analysis-preview` → movement balance + warnings
- `AnalysisPanel.tsx` renders volume bars, warning tabs, session warnings

### 1.13 Plan Saving and Activation

**Status: Ready to reuse**

- Plans are saved as `status: "draft"` at all times during editing
- `PATCH /plans/:id` with `{ status: "active" }` activates a plan
- Activation is gated on: no absolute volume violations, all exercises valid
- `activatedAt` timestamp recorded on activation
- No automatic activation — trainer must explicitly trigger

### 1.14 Plan Warnings

**Status: Ready to reuse**

Existing warnings in `planAnalyzer.ts`:

| Code | Severity | Scope | Blocking |
|---|---|---|---|
| PUSH_DOMINANT | warning | plan | No |
| PULL_DOMINANT | warning | plan | No |
| STRONGLY_PUSH_DOMINANT | error | plan | No |
| STRONGLY_PULL_DOMINANT | error | plan | No |
| SQUAT_DOMINANT | warning | plan | No |
| HINGE_DOMINANT | warning | plan | No |
| STRONGLY_SQUAT_DOMINANT | error | plan | No |
| STRONGLY_HINGE_DOMINANT | error | plan | No |
| CATEGORY_DOMINANCE | notice/warning | plan | No |
| REPEATED_PATTERN | notice | day | No |
| UNILATERAL_MISSING | info | plan | No |
| EXERCISE_NOT_FOUND | notice | exercise | No |
| INVALID_WORKING_SETS | notice | exercise | No |
| INACTIVE_EXERCISE | info | exercise | No |
| MISSING_MOVEMENT_PATTERN | info | exercise | No |
| MISSING_MOVEMENT_CATEGORY | info | exercise | No |
| MISSING_EXERCISE_TYPE | info | exercise | No |
| MISSING_EXECUTION_TYPE | info | exercise | No |
| MISSING_PLANE_OF_MOTION | info | exercise | No |
| ALL_ISOLATION | notice | plan | No |
| MOVEMENT_CONCENTRATED | info | plan | No |
| CLIENT_AVOIDS_EXERCISE | notice | exercise | No |

New warnings needed for draft generation — see [Section 23](#23-warning-catalogue).

### 1.15 Exercise Prescriptions

**Status: Ready to reuse**

`workout_plan_exercises` stores per-exercise:

| Field | Type |
|---|---|
| `workingSets` | integer |
| `warmUpSets` | integer |
| `repType` | text: `exact`, `range`, `time`, `distance`, `open` |
| `repsExact` | integer |
| `repRangeMin` / `repRangeMax` | integer |
| `repTimeSeconds` | integer |
| `repDistanceMeters` | integer |
| `repOpenInstruction` | text |
| `loadType` | text: `fixed`, `percent_1rm`, `bodyweight`, `bw_plus`, `assisted`, `custom` |
| `loadValue` | text |
| `loadInstruction` | text |
| `rir` | integer (0–5) |
| `rpe` | text |
| `rirOrRpe` | text (legacy) |
| `tempo` | text (e.g. "3-1-1-0") |
| `restSeconds` | integer |
| `notes` | text (trainer-private) |
| `clientInstructions` | text |

All fields exist and are editable in the Plan Editor UI.

### 1.16 Sets and Repetitions

**Status: Ready to reuse**

Both `workingSets` and `warmUpSets` exist in DB and UI.  
`repType` supports 5 modes; `repRangeMin`/`repRangeMax` supports range prescriptions.  
UI input: numeric fields for all values.  
Warm-up sets excluded from volume calculation — confirmed.

### 1.17 RIR or RPE

**Status: Ready to reuse**

`rir` (integer 0–5) and `rpe` (text) columns exist.  
`rirOrRpe` is a legacy combined field, effectively superseded.  
UI shows RIR input. The generator should write `rir` only.

### 1.18 Tempo

**Status: Partially ready**

`tempo` text column exists in DB, accessible via API, and editable in UI.  
Format used in existing exercise data: "3-1-1-0" (eccentric-pause-concentric-top).  
**Gap:** No validation of tempo format. Any text is accepted. The generator must produce valid tempo strings.

### 1.19 Rest Periods

**Status: Ready to reuse**

`restSeconds` (integer) column exists in DB and UI.  
No minimum/maximum enforced at DB level — application must enforce reasonable values.

### 1.20 Warm-up Support

**Status: Partially ready**

What exists:
- `warmUpSets` (integer) column on `workout_plan_exercises`
- UI field "Serie rozgrzewkowe" in the exercise editor
- Volume calculator correctly excludes `warmUpSets` from effective volume

What is missing:
- **No set-type selector** (Rozgrzewkowa / Robocza) per individual set — only a total count
- **No session-level general warm-up** concept — no `workout_plan_warmup` table or equivalent
- **No movement-preparation concept** in the data model
- **No warmup load prescription** (e.g., 40% / 60% / 80% structure)

**Architecture decision needed:** For MVP, recommend keeping the current `warmUpSets` integer approach. Full per-set warm-up prescriptions with load percentages would require a new `workout_plan_set_entries` table — defer to Phase 6+.

### 1.21 Set Types

**Status: Partially ready**

`repType` supports 5 types (exact, range, time, distance, open) — these are rep-counting types, not set classification types.  
There is no `setType` field (Robocza / Rozgrzewkowa / Schodzenie) — the plan model uses separate count fields (`workingSets`, `warmUpSets`).

**For MVP:** The generator will write `warmUpSets` as an integer derived from warm-up logic, and `workingSets` for working sets. No per-set type selector is required.

### 1.22 Progression Support

**Status: Partially ready (exercise library only)**

What exists:
- `exercise_progressions` table: links exercises via `direction` ("progression" / "regression") and `sortOrder` — enables finding harder/easier exercise alternatives
- `startDate` / `endDate` on `workout_plans` for plan block boundaries

What is missing:
- No `progressionType` or `loadProgressionRule` on `workout_plan_exercises`
- No periodization blocks, mesocycles, or week-by-week variation in the plan model
- No deload concept anywhere in the codebase
- Plan model is static (single-week template)

**For MVP:** Progression is specified as a written prescription in `clientInstructions` (e.g., "Gdy osiągniesz 12 powt. na RIR 2, zwiększ obciążenie"). Automated progression tracking is deferred.

### 1.23 Estimated Session Duration

**Status: Missing**

`workout_plan_days.estimatedDurationMinutes` column exists in the DB but:
- Is never populated by any current API logic
- There is no duration calculation service
- `planAnalyzer.ts` counts sets but does not estimate time

The generator must implement a duration estimation function (see [Section 21](#21-duration-model)).

### 1.24 Training Split Support

**Status: Missing as structured concept**

What exists:
- `planStylePreference` in survey: efficiency preference ("Maksymalna efektywność" etc.), NOT a training split
- Day `dayName` and `subtitle` fields allow manual labelling (e.g., "Push Day")
- Movement balance analysis (push/pull, squat/hinge ratios) in `planAnalyzer.ts`

What is missing:
- No `splitType` field on `workout_plans` or `surveysTable`
- No split recommendation logic
- No UI for selecting a split structure

The generator must introduce split recommendation as a new concept — see [Section 12](#12-split-recommendation-rules).

---

## 2. Existing Reusable Modules

| Module | Location | Status |
|---|---|---|
| Survey data | `lib/db/src/schema/surveys.ts` | ✅ Ready |
| Client data | `lib/db/src/schema/clients.ts` | ✅ Ready |
| Experience level enum | Survey + guidelines + exercises | ✅ Ready |
| Volume targets (11) | `volume_targets` table | ✅ Ready |
| Volume guidelines (44) | `volume_guidelines` table | ✅ Ready |
| Volume calculator (max-coeff) | `volumeCalculator.ts` | ✅ Ready |
| Exercise library (87 active) | `exercises` table | ✅ Ready |
| Exercise metadata | `learningDifficulty`, `neurologicalFatigue`, `domsPotential`, `requiresSpotter`, `canBePerformedToFailure` | ✅ Ready |
| Muscle assignments + coefficients | `exercise_muscle_assignments` | ✅ Ready |
| Exercise progressions (harder/easier) | `exercise_progressions` | ✅ Ready |
| Recommendation engine (0–100 score) | `exerciseRecommendationEngine.ts` | ✅ Ready (extend) |
| Plan CRUD API | `routes/plans.ts` | ✅ Ready |
| Plan prescription model | `workout_plan_exercises` | ✅ Ready |
| Sets + reps + RIR + tempo + rest | All columns present in DB + UI | ✅ Ready |
| Warmup sets count | `warmUpSets` column | ✅ Ready |
| Movement analysis + balance warnings | `planAnalyzer.ts` | ✅ Ready |
| CLIENT_AVOIDS_EXERCISE warning | `planAnalyzer.ts` | ✅ Ready |
| Plan saving (draft status) | `PATCH /plans/:id` | ✅ Ready |
| Plan activation | `PATCH /plans/:id` status → active | ✅ Ready |
| Analysis panel UI | `AnalysisPanel.tsx` | ✅ Ready |
| Exercise picker (search + scored) | `PlanEditor.tsx` ExercisePicker | ✅ Ready |
| Day management UI | `PlanEditor.tsx` | ✅ Ready |
| Volume preview (live) | `POST /plans/volume-preview` | ✅ Ready |
| Avoided exercises resolver | `GET /clients/:clientId/avoided-exercises` | ✅ Ready |

---

## 3. Missing Capabilities

| Capability | Gap | Impact |
|---|---|---|
| Training split recommendation | No structured split field or logic | Phase 3 — must be built |
| Split UI in wizard | No split picker in trainer app | Phase 1 / Phase 3 |
| Session duration estimation | `estimatedDurationMinutes` column exists but nothing fills it | Phase 7 |
| General/session warm-up model | No session-level warmup concept | Phase 6 |
| Per-set load prescriptions for warmup | Would require new table | Defer |
| Volume starting-point algorithm | No logic to select starting value within guideline range | Phase 2 |
| Volume distribution across days | No multi-day set distribution logic | Phase 3 |
| Progression rule per exercise | No `progressionType` column or rule engine | Deferred |
| Block duration / mesocycle concept | No periodization model | Deferred |
| Equipment parsing | Survey `equipment` is free text, not structured | Phase 1 |
| Recovery quality composite | Must be derived from sleep + stress + activity | Phase 2 |
| Generator input wizard | No wizard UI exists | Phase 1 |
| Generator engine service | No `planDraftGenerator.ts` | All phases |
| Explanation model | No `selectionReason` per exercise/set | Phase 7 |
| Draft generation from wizard | No endpoint `POST /plans/generate-draft` | All phases |

---

## 4. Architecture Limitations

### 4.1 Survey equipment is free text
`surveysTable.equipment` stores a text string, not a structured array. The generator must parse and normalize this to match `exercises.equipment[]` values. A mapping table (e.g. "Sztanga" → ["Sztanga i talerze", "Sztanga"]) must be defined. **This is the most fragile data-quality risk.**

### 4.2 Survey sessionDuration is text
Must be `parseInt(survey.sessionDuration, 10)`. If `NaN`, treat as missing → show `INSUFFICIENT_SESSION_TIME` warning and default to 60 minutes with trainer override.

### 4.3 Progression is static
The plan model stores a single-week template. Week-over-week load changes cannot be modelled without a new `workout_plan_week_entries` or `workout_plan_progression_rules` table. Do not implement for MVP.

### 4.4 No session-level warm-up model
There is no table or column to store a general warm-up block (duration, activities). For MVP, general warm-up is a fixed text template in `workout_plan_days.description`. Full warm-up prescription requires a new table.

### 4.5 Equipment matching is imprecise
The recommendation engine checks equipment via string array membership (`exercise.equipment.every(eq => clientEquipment.includes(eq))`). The client equipment list must be normalized at generation time to the same string vocabulary used in `exercises.equipment[]`.

### 4.6 planStylePreference is not a split type
`planStylePreference` encodes the trainer's efficiency preference ("Maksymalna efektywność" etc.), not a training split. Split type must be introduced as a new field — either added to `surveysTable` (requires migration) or stored only in the generator input/wizard state (no migration needed). **Requires product decision.**

### 4.7 No enforced stressLevel range
`stressLevel` is a DB integer with no range constraint. The generator should clamp it to [1, 10] and treat values outside this range as unknown.

---

## 5. Recommended Trainer Flow

### Entry Points

**A — From the client profile:**
1. Trainer opens `ClientDetail` page
2. Clicks "Generuj szkic planu" (new primary button, alongside existing "Nowy plan")
3. Wizard opens, prefilled from the client's latest survey

**B — From the existing plan editor:**
1. Trainer is in `PlanEditor` with an empty plan
2. Clicks "Wygeneruj szkic" button in the toolbar
3. Wizard opens, prefilled from the linked survey

**Design principle:** Entry point B reuses the existing plan. Entry point A creates a new plan first, then enters the wizard.

### The Wizard Principle

- Maximum 5 steps
- Each step is independently submittable (trainer can go back)
- Trainer can skip the wizard entirely and build manually
- Every recommendation is overridable
- The wizard never saves or activates — it only writes a draft

---

## 6. Wizard Screen Descriptions

### Step 1 — Klient i dane wejściowe

**Purpose:** Show the trainer a clear summary of client data before any generation happens. Reveal missing or problematic data.

**Content:**

```
┌─────────────────────────────────────────────────────────────┐
│ [Avatar] Jan Kowalski                         [Edytuj wywiad]│
├─────────────────────────────────────────────────────────────┤
│ CEL TRENINGOWY            Budowa sylwetki                    │
│ POZIOM DOŚWIADCZENIA      Średniozaawansowany     ✓          │
│ DNI TRENINGOWE / TYDZIEŃ  4 dni                             │
│ CZAS SESJI                60 minut                          │
│ MIEJSCE TRENINGU          Siłownia                           │
│ SPRZĘT                    Sztanga, Hantle, Ławeczka          │
├─────────────────────────────────────────────────────────────┤
│ REGENERACJA                                                  │
│   Sen              7 godzin     ◆ Dobry                     │
│   Stres            3/10         ◆ Niski                     │
│   Aktywność        Siedzący                                  │
│   Praca fizyczna   Nie                                       │
├─────────────────────────────────────────────────────────────┤
│ MIĘŚNIE PRIORYTETOWE      Klatka, Plecy, Barki              │
│ MIĘŚNIE WYKLUCZONE        —                                  │
│ ULUBIONE ĆWICZENIA        Wyciskanie sztangi                 │
│ ĆWICZENIA DO UNIKANIA     Przysiad bułgarski (ból kolana)   │
│ OGRANICZENIA ZDROWOTNE    Brak                               │
├─────────────────────────────────────────────────────────────┤
│ ⚠ Brakuje: trainingGoal nie jest standardową wartością.     │
│   Generator przyjmie cel: Hipertrofia                        │
└─────────────────────────────────────────────────────────────┘
[Wróć]                                     [Dalej →]
```

**Rules:**
- Show a ⚠ badge for every missing or non-standard field
- Show a 🚫 badge for MISSING_EXPERIENCE_LEVEL (blocks progression to step 2)
- "Edytuj wywiad" links to the existing survey form; when trainer returns, wizard reloads survey data
- This step performs no generation — it is read-only

### Step 2 — Założenia planu

**Purpose:** Let trainer confirm or override plan parameters before volume is calculated.

**Content:**

```
┌─────────────────────────────────────────────────────────────┐
│ PLAN TRENINGOWY — ZAŁOŻENIA                                  │
├─────────────────────────────────────────────────────────────┤
│ Dni treningowe              [ 4 ] ▲▼  (z wywiadu: 4)        │
│ Czas sesji (min)            [ 60 ] ▲▼ (z wywiadu: 60)       │
│ Czas trwania bloku (tyg.)   [ 4 ] ▲▼  (brak w wywiadzie)    │
│                                                              │
│ Cel główny                  [Hipertrofia         ▼]          │
│ Podział treningowy          [Upper / Lower        ▼]         │
│   ℹ Rekomendacja dla 4 dni i poziomu Średniozaawansowany    │
│                                                              │
│ Mięśnie priorytetowe        [Klatka] [Plecy] [Barki]        │
│                                                              │
│ ▶ Zaawansowane ustawienia                                    │
│   Styl treningu             [Balans               ▼]         │
│   Unikaj zaawansowanych metod  ☑ Tak                        │
│   Dodatkowe uwagi trenera   [________________________]       │
└─────────────────────────────────────────────────────────────┘
[← Wróć]                                    [Dalej →]
```

**Rules:**
- All values prefilled from survey
- Training days and session duration are editable — these override survey values for generation
- Split recommendation is explained with one sentence
- "Zaawansowane ustawienia" expands via progressive disclosure
- Changing training days live-updates the split recommendation
- Trainer notes field feeds into plan `description`

### Step 3 — Objętość tygodniowa

**Purpose:** Show trainer the recommended weekly effective sets per muscle group, with reasons, and allow per-target overrides.

**Content:**

```
┌─────────────────────────────────────────────────────────────┐
│ OBJĘTOŚĆ TYGODNIOWA — REKOMENDACJE                           │
├─────────────────────────────────────────────────────────────┤
│ Klatka piersiowa                                             │
│   Zakres dla poziomu:   8–14 serii efektywnych               │
│   Proponowany start:    10 serii                             │
│   Powody:                                                    │
│     • priorytet klienta (+1–2 serie)                        │
│     • dobra regeneracja (standard)                           │
│     • 4 dni treningowe                                       │
│   Twoja wartość: [10] ▲▼                                    │
├─────────────────────────────────────────────────────────────┤
│ Mięśnie naramienne                                           │
│   Zakres dla poziomu:   12–20 serii efektywnych              │
│   Proponowany start:    13 serii                             │
│   Powody:                                                    │
│     • priorytet klienta                                      │
│     • dobra regeneracja                                      │
│   Twoja wartość: [13] ▲▼                                    │
│   ⚠ Przekraczasz zakres preferowany (>14). Czy to celowe?   │
├─────────────────────────────────────────────────────────────┤
│ [Przywróć rekomendowane dla wszystkich]                      │
└─────────────────────────────────────────────────────────────┘
[← Wróć]                                    [Generuj szkic →]
```

**Rules:**
- Show all 11 volume targets in order of descending priority
- Each target shows: guideline range, suggested starting value, reason summary, override field
- Override field: type number or use stepper; range boundary violations trigger inline notice (non-blocking)
- "Generuj szkic" triggers the generation engine and proceeds to Step 4
- Generation may take 1–3 seconds — show a spinner

### Step 4 — Wygenerowany szkic

**Purpose:** Show the generated draft in a structured, readable form before it enters the plan editor.

**Content:**

```
┌─────────────────────────────────────────────────────────────┐
│ SZKIC PLANU — 4-dniowy Upper/Lower                          │
├─────────────────────────────────────────────────────────────┤
│ Dzień 1 — Góra A (Klata + Barki)           ~58 min         │
│   [Rozgrzewka ogólna: 5–7 minut]                            │
│   1. Wyciskanie sztangi — 4 serie × 6–10 powt.  RIR 2      │
│      Tempo: 3-1-1-0  Przerwa: 2–3 min                       │
│      Objętość: Klatka ×1.0, Barki ×0.4                     │
│      [💡 Dlaczego to ćwiczenie?]                            │
│   2. Rozpiętki hantlami — 3 serie × 10–15 powt. RIR 2      │
│      ...                                                     │
│                                                              │
│ [+ Dodaj ćwiczenie do dnia 1]                               │
├─────────────────────────────────────────────────────────────┤
│ Dzień 2 — Dół A (Biodra + Pośladki)        ~62 min         │
│   ...                                                        │
├─────────────────────────────────────────────────────────────┤
│ PODSUMOWANIE OBJĘTOŚCI                                       │
│   Klatka:     10 / 10 serii  ✓                              │
│   Naramienne: 13 / 13 serii  ✓                              │
│   Plecy:      11 / 12 serii  ≈ (w tolerancji)              │
├─────────────────────────────────────────────────────────────┤
│ OSTRZEŻENIA (2)                                              │
│   ⚠ Klient unika: Przysiad bułgarski — nie dodano           │
│   ℹ Brak ćwiczenia jednostronnego                           │
└─────────────────────────────────────────────────────────────┘
[← Wróć do objętości]           [Edytuj w kreatorze →]
                          [Zapisz szkic]
```

**Rules:**
- Full plan shown in a scrollable preview — read-only at this step
- "Dlaczego to ćwiczenie?" expands an explanation popover
- "Edytuj w kreatorze" opens the plan in the existing PlanEditor with all data pre-loaded
- "Zapisz szkic" saves the plan as `status: "draft"` and returns to client profile
- Warnings from `planAnalyzer.ts` are shown immediately
- Volume targets show target vs generated vs tolerance status

### Step 5 — Review and Save (PlanEditor)

This step IS the existing PlanEditor. The draft opens in the editor exactly as if the trainer had built it manually. No new UI is needed here — only the generated data differs.

Trainer can:
- Edit every field (sets, reps, RIR, tempo, rest, load)
- Replace exercises (via existing ExercisePicker)
- Move exercises between days (drag-and-drop)
- Add/remove days
- Recalculate volume (live via existing analysis panel)
- Save (remains draft)
- Activate (PATCH status → active)

**The generator never activates a plan.**

---

## 7. Input Mapping

How every generator input maps to an existing data source:

| Generator Input | Source Table | Source Column | Parse Required |
|---|---|---|---|
| `clientId` | `clients` | `id` | No |
| `experienceLevel` | `surveys` | `experienceLevel` | No (string enum) |
| `trainingGoal` | `surveys` | `trainingGoal` | Normalize to known values |
| `availableDays` | `surveys` | `desiredWeeklyFrequency` | `parseInt` |
| `sessionDuration` | `surveys` | `sessionDuration` | `parseInt` |
| `trainingLocation` | `surveys` | `trainingLocation` | Normalize to known values |
| `availableEquipment` | `surveys` | `equipment` | Parse free-text → string array |
| `dailyActivity` | `surveys` | `activityLevel` | No |
| `physicalWork` | `surveys` | `activityLevel` | Derived: `=== "Praca fizyczna"` |
| `sleep` | `surveys` | `sleepHours` | `parseInt` |
| `stress` | `surveys` | `stressLevel` | Clamp to [1, 10] |
| `recoveryQuality` | Derived | sleep + stress + activityLevel | Composite calculation |
| `healthLimitations` | `surveys` | `healthLimitations` | Raw text (trainer reads) |
| `priorityMuscleGroups` | `surveys` | `priorityMuscle1/2/3` | Array of non-null values |
| `excludedMuscleGroups` | `surveys` | `avoidedMuscles` | Parse free-text |
| `preferredExercises` | `surveys` | `favoriteExercises` | Parse free-text |
| `avoidedExerciseIds` | `surveys` | `avoidedExerciseIds` | No (integer array) |
| `avoidedExerciseReasons` | `surveys` | `avoidedExerciseReasons` | No (jsonb) |
| `planBlockDuration` | Not in survey | Wizard step 2 | Wizard input only |
| `preferredTrainingStyle` | Not in survey | Wizard step 2 | Wizard input only |

---

## 8. Decision Matrix

For every generator input:

| Input | Required? | Missing behaviour | Effect on generation | Default | Trainer override |
|---|---|---|---|---|---|
| `clientId` | **Yes** | Block — cannot proceed | Loads all client data | — | No |
| `experienceLevel` | **Yes** | Block — emit MISSING_EXPERIENCE_LEVEL | Determines volume range, exercise ranking, RIR, tempo | — | No (must fix survey) |
| `trainingGoal` | Recommended | Warning — assume "Hipertrofia" | Exercise ranking, rep ranges | "Hipertrofia" | Yes |
| `availableDays` | **Yes** | Block if 0 or null | Split selection, volume distribution | — | Yes (wizard step 2) |
| `sessionDuration` | Recommended | Warning — assume 60 min | Duration estimation, volume cap | 60 | Yes (wizard step 2) |
| `trainingLocation` | Recommended | Warning — assume "Siłownia" | Hard filter for exercises | "Siłownia" | Yes (wizard step 2) |
| `availableEquipment` | Recommended | Warning — assume full gym | Hard filter for exercises | All gym equipment | Yes (wizard step 2) |
| `dailyActivity` | Optional | Ignore | Recovery quality calculation | "Siedzący" | Yes |
| `physicalWork` | Optional | Ignore | Recovery quality calculation | false | Yes |
| `sleep` | Optional | Ignore | Recovery quality calculation | 7 | Yes |
| `stress` | Optional | Ignore | Recovery quality calculation | 5 | Yes |
| `recoveryQuality` | Derived | Derived from above | Volume starting position | "standard" | Yes (wizard step 3, per target) |
| `healthLimitations` | Optional | Ignore | Emit HEALTH_LIMITATION_PRESENT notice; no automatic decision | — | Trainer reviews |
| `priorityMuscleGroups` | Optional | Skip priority logic | Volume +1–2 sets for priority groups; exercise ranking boost | [] | Yes |
| `excludedMuscleGroups` | Optional | Skip avoidance logic | Exercise hard-filter (remove exercises targeting excluded muscles) | [] | Yes |
| `preferredExercises` | Optional | Skip preference boost | Exercise ranking soft boost (+5 score) | [] | Yes |
| `avoidedExerciseIds` | Optional | Skip CLIENT_AVOIDS_EXERCISE logic | Ranking penalty + warning; not blocked | [] | Yes (trainer may still choose) |
| `avoidedExerciseReasons` | Optional | Skip reason display | Shown in warning explanation | {} | Yes |
| `planBlockDuration` | Optional | Default 4 weeks | Written to plan description | 4 | Yes (wizard step 2) |
| `preferredTrainingStyle` | Optional | System recommends | Split selection | System recommendation | Yes (wizard step 2) |

**MISSING_EXPERIENCE_LEVEL and INVALID_EXPERIENCE_LEVEL are the only blocking conditions for generation.**  
Experience level MUST NOT be defaulted to "Brak aktywności fizycznej" or "Początkujący" when missing or invalid.

---

## 9. Four Experience Profiles

These are recommendation profiles, not hard restrictions. Trainers may override every value.

### 9.1 Brak aktywności fizycznej

**Volume position:** Lower portion of approved range (30–40% of ceiling)  
**Exercises per session:** 4–6  
**Working sets per exercise:** 2–3  
**Technical complexity:** Low — machines, guided movements, simple bodyweight preferred  
**Stable vs free-weight:** Strong preference for machines and guided equipment (80/20)  
**Compound vs isolation:** 70% compound (simple bilateral), 30% isolation  
**Bilateral vs unilateral:** Predominantly bilateral; no unilateral lower body in first block  
**Rep ranges:** 12–20 (machines), 10–15 (simple compound)  
**RIR target:** 3–4 on all working sets  
**Proximity to failure:** None — no planned muscular failure  
**Tempo:** Simple controlled ("Kontrolowane") — no complex tempo codes  
**Rest periods:** 90–120 seconds standard; 120–180 for larger compound  
**Warm-up complexity:** Low — general movement, no complex motor preparation drills  
**Weekly frequency per muscle:** 2× preferred  
**Maximum demanding exercises (neurological fatigue ≥ 3):** 1 per session  
**DOMS-potential management:** Prefer exercises with domsPotential ≤ 2 in first block  
**Progression model:** Double progression (add reps → add load); 3-week cycles  

### 9.2 Początkujący

**Volume position:** Lower-to-middle range (35–55% of ceiling)  
**Exercises per session:** 5–7  
**Working sets per exercise:** 2–4  
**Technical complexity:** Low-to-medium — free weights allowed with simple patterns  
**Stable vs free-weight:** 60/40 preference for guided or stable  
**Compound vs isolation:** 65% compound, 35% isolation  
**Bilateral vs unilateral:** Predominantly bilateral; light unilateral accessory allowed  
**Rep ranges:** 8–15 standard; 12–20 for machines and isolation  
**RIR target:** 2–3  
**Proximity to failure:** Avoid close to failure (no higher than RIR 1)  
**Tempo:** Simple ("3-0-1-0" or "Kontrolowane opuszczanie")  
**Rest periods:** 90–150 seconds  
**Warm-up complexity:** Low — general + 2 preparation sets for main compound  
**Weekly frequency per muscle:** 2× preferred  
**Maximum demanding exercises:** 2 per session  
**Progression model:** Double progression; 4-week cycles  

### 9.3 Średniozaawansowany

**Volume position:** Middle range (50–75% of ceiling)  
**Exercises per session:** 6–8  
**Working sets per exercise:** 3–4  
**Technical complexity:** Medium — free weights, barbells, some unilateral  
**Stable vs free-weight:** 40/60  
**Compound vs isolation:** 55% compound, 45% isolation  
**Bilateral vs unilateral:** Mixed; 1–2 unilateral exercises per session  
**Rep ranges:** 6–12 compound; 10–15 machine; 12–20 isolation  
**RIR target:** 1–3 (exercise-dependent)  
**Proximity to failure:** Controlled — some RIR 1 sets allowed on safe exercises  
**Tempo:** Standard codes ("3-1-1-0", "2-0-1-0")  
**Rest periods:** 90–180 seconds  
**Warm-up complexity:** Medium — general + per-exercise preparation sets  
**Weekly frequency per muscle:** 2× standard; 3× for priority muscles with sufficient volume  
**Maximum demanding exercises:** 3 per session  
**Progression model:** Double progression with load-based cycles; 4–6 weeks  

### 9.4 Zaawansowany

**Volume position:** Individually selected (60–100% of ceiling) based on recovery and priority  
**Exercises per session:** 7–10  
**Working sets per exercise:** 3–5  
**Technical complexity:** High — full barbell movements, complex unilateral, technical variations  
**Stable vs free-weight:** 30/70 or per trainer decision  
**Compound vs isolation:** 50/50  
**Bilateral vs unilateral:** High unilateral proportion; 2–3 exercises per session  
**Rep ranges:** 4–8 for strength compounds; 6–12 hypertrophy; 12–20 isolation  
**RIR target:** 0–2 depending on exercise safety (`canBePerformedToFailure`)  
**Proximity to failure:** Planned failure on safe exercises only  
**Tempo:** Full 4-digit codes; exercise-specific  
**Rest periods:** 2–4 minutes for heavy compound; 60–120 for isolation  
**Warm-up complexity:** Full — general + motor preparation + ramping preparation sets  
**Weekly frequency per muscle:** 2–3× standard; higher for lagging groups with trainer approval  
**Maximum demanding exercises:** 4–5 per session  
**Progression model:** Trainer-designed; may include wave loading, RPE-based progression  

---

## 10. Weekly Volume Rules

### 10.1 Starting-Value Algorithm

The generator selects a starting weekly effective sets value within the approved guideline range for each volume target. It does not change guideline values.

**Algorithm:**

1. Load `weeklyPreferredCeiling` (upper bound of preferred range) for this target + experience level.
2. Compute a base fraction: `0.40` for "Brak aktywności fizycznej", `0.50` for "Początkujący", `0.60` for "Średniozaawansowany", `0.70` for "Zaawansowany".
3. Apply recovery modifier (−0.10 to +0.10):
   - Poor recovery (`recoveryQuality = "poor"`): −0.10
   - Average recovery ("standard"): 0
   - Good recovery ("good"): +0.05
   - Excellent recovery ("excellent"): +0.10
4. Apply priority modifier (0 to +0.15):
   - Muscle is in `priorityMuscle1/2/3`: +0.10 to +0.15
   - No priority: 0
5. Apply session-count modifier (−0.05 to +0.05):
   - `availableDays ≤ 2`: −0.05
   - `availableDays ≥ 5`: +0.05
6. Apply session-duration modifier:
   - `sessionDuration < 45 min`: −0.10
   - `sessionDuration > 75 min`: +0.05
7. Clamp fraction to [0.30, 1.00].
8. `suggestedSets = round(weeklyPreferredCeiling × fraction)`.
9. Floor at `sessionMin` (so at least one session makes sense).
10. Trainer sees this value pre-filled in wizard step 3 and can override.

**Recovery quality composite (derived input):**

| Condition | recoveryQuality |
|---|---|
| sleep ≥ 8 AND stress ≤ 3 AND not physical work | "excellent" |
| sleep ≥ 7 AND stress ≤ 5 | "good" |
| sleep ≥ 6 AND stress ≤ 7 | "standard" |
| sleep < 6 OR stress ≥ 8 OR physical work = true | "poor" |

### 10.2 Volume Explanation

Every target's suggested value must be accompanied by 2–5 Polish reason strings. Example reasons:

- `"standardowy priorytet mięśniowy"`
- `"dobra regeneracja klienta"`
- `"4 dni treningowe — możliwość 2× tygodniowo"`
- `"krótkie sesje — ograniczona ilość serii na sesję"`
- `"wysoki stres — konserwatywny start"`

These reasons are stored in `GeneratorWarning.explanations` and displayed in wizard step 3 and in the exercise explanation popover in step 4.

---

## 11. Volume Distribution Rules

### 11.1 Frequency Selection per Muscle

Frequency (sessions per week a muscle is trained) is selected before distribution:

| Weekly effective sets | Recommended frequency |
|---|---|
| ≤ 6 | 1× per week |
| 7–12 | 2× per week |
| 13–18 | 2–3× per week |
| ≥ 19 | 3× (with trainer approval) |

Priority muscles may receive +1 frequency if `availableDays` permits.

### 11.2 Recovery Spacing

Minimum 48 hours between training sessions that overlap significantly on any single muscle group. The generator must:
1. Identify which muscles are loaded per day (via `exercise_muscle_assignments`)
2. Ensure no significant overlap within 48-hour pairs
3. Prefer 72 hours between high-volume sessions for the same primary muscle

### 11.3 Session Volume Limits

- **Minimum useful volume per session per target:** `sessionMin` from guidelines (typically 2–4 sets)
- **Maximum reasonable volume per session per target:** `sessionMax` from guidelines (typically 6–8 sets)
- If `suggestedWeeklySets ÷ frequency > sessionMax`, increase frequency rather than exceeding per-session limit
- If per-session target cannot be achieved without exceeding `sessionMax`, the generator caps at `sessionMax` and adds a VOLUME_BELOW_TARGET warning

### 11.4 Tolerance

The generator compares `generatedEffectiveSets` vs `targetWeeklySets`:

| Difference | Status | Action |
|---|---|---|
| Within ±1.0 set | Within tolerance | No warning |
| Within ±2.0 sets | Near tolerance | Emit VOLUME_BELOW/ABOVE_TARGET (info) |
| More than ±2.0 sets | Out of tolerance | Emit VOLUME_BELOW/ABOVE_TARGET (notice) with suggestion |

Warm-up sets NEVER count toward effective volume.

### 11.5 Unresolved Gaps

If the generator cannot reach a target within tolerance (e.g. session time limits prevent enough sets), it reports an unresolved gap in `GenerationMetadata.unresolvedGaps`. Trainer must manually address this.

---

## 12. Split Recommendation Rules

### 12.1 Recommendation Logic

The system recommends a split based on `availableDays`, `experienceLevel`, and `priorityMuscleGroups`.

| Days | Experience Level | Recommended Split | Notes |
|---|---|---|---|
| 2 | Any | Full Body A/B | One full-body session per visit |
| 3 | Brak / Początkujący | Full Body | Same structure each session |
| 3 | Średniozaawansowany | Upper / Lower / Full Body | Alternating |
| 3 | Zaawansowany | Push / Pull / Legs or Upper/Lower + Full | Trainer choice |
| 4 | Any except Brak | Upper / Lower | Classic structure |
| 4 | Brak | Full Body A/B + 2 × Lower | Conservative |
| 5 | Średniozaawansowany / Zaawansowany | Push / Pull / Legs / Upper / Lower | |
| 5 | Brak / Początkujący | Not recommended (cap at 4) | Emit TOO_MANY_DAYS_FOR_LEVEL (notice) |
| 6 | Zaawansowany | Advanced split (trainer defines) | System provides structure, not content |

### 12.2 Priority Override

If any of `priorityMuscle1/2/3` are set, the generator may bias the split to give the priority muscle an extra session (e.g., a 4-day Upper/Lower becomes "Upper A (priority emphasis) / Lower / Upper B / Lower").

### 12.3 Split Explanation

Every recommended split is accompanied by a one-paragraph Polish explanation:

> "Dla 4 dni treningowych i poziomu Średniozaawansowany, podział Góra/Dół pozwala trenować każdą grupę 2× w tygodniu przy zachowaniu 48 godzin regeneracji. Barki są priorytetem, więc Dzień Góry A skupia się na ich objętości."

### 12.4 Day Naming

The generator writes into `workout_plan_days.dayName` and `subtitle`:

| Split | Day Names |
|---|---|
| Full Body | "Trening A", "Trening B" |
| Upper/Lower | "Góra A", "Dół A", "Góra B", "Dół B" |
| Push/Pull/Legs | "Push", "Pull", "Nogi", repeat |
| PPL + Upper | "Push", "Pull", "Nogi", "Góra (uzupełniający)" |

---

## 13. Exercise Selection Rules

### 13.1 Hard Filters (Must Pass — Exercise Excluded if Any Fails)

1. `exercises.isActive = true`
2. `exercises.trainingLocation` contains the client's `trainingLocation`
3. All items in `exercises.equipment[]` are present in the parsed client equipment list
4. `exercises.mainMuscleGroup` is NOT in `excludedMuscleGroups`
5. Exercise metadata is sufficient for generation (`movementPattern` not null, `exerciseType` not null)

### 13.2 Soft Ranking (Score Extension to Existing Engine)

The existing recommendation engine (0–100) is extended with additional factors for draft generation:

| Factor | Max Additional Points | Direction |
|---|---|---|
| `avoidedExerciseIds` match | — | −20 penalty (CLIENT_AVOIDS_EXERCISE; not blocked) |
| `learningDifficulty` vs experience profile | ±10 | Low difficulty → bonus for low experience |
| `domsPotential` vs experience profile | ±10 | High DOMS → penalty for "Brak aktywności" |
| `neurologicalFatigue` vs session fatigue budget | ±8 | High neuro → penalty if budget used |
| `requiresSpotter` | −5 | Penalty if no peer/spotter assumption |
| Movement pattern needed by split | +10 | Bonus if pattern fills a gap |
| Priority muscle targeting (extended) | +12 | Bonus for `priorityMuscle1` |
| `canBePerformedToFailure` for Zaawansowany | +5 | Bonus when proximity to failure is planned |

Tiebreaker (same score): prefer exercises with more specific muscle assignments (higher coefficient sum) to maximize volume generation efficiency.

### 13.3 Avoided Exercises

- Avoided exercises (`avoidedExerciseIds`) receive a −20 ranking penalty
- They are NEVER automatically excluded (trainer retains control)
- When selected by the generator despite the penalty (e.g., no alternative exists), a `CLIENT_AVOIDS_EXERCISE` warning is emitted with the reason
- The explanation model states why the exercise was selected despite being avoided

### 13.4 Health Limitations

Health limitations (`healthLimitations` free text) are NOT parsed by the generator.  
When `healthLimitations` is non-empty, the generator emits `HEALTH_LIMITATION_PRESENT` (notice) and includes the raw text in the wizard step 1 summary.  
**The generator makes no automatic medical decisions.**  
The trainer must review health limitations and adjust the draft manually.

### 13.5 Minimum Exercise Selection Criteria

For each split day and each target muscle in the day's scope:
1. Select 1 primary compound exercise (highest-scoring compound, `exerciseType = "Złożone"`)
2. Select 1–2 secondary exercises (next highest-scoring)
3. Select 0–2 isolation exercises (`exerciseType = "Izolowane"`)

If no suitable exercise can be found after applying hard filters:
- Emit `NO_EXERCISE_FOR_PATTERN` (notice) for the missing slot
- Leave the slot empty for trainer to fill manually

---

## 14. Exercise Order Rules

### 14.1 Default Ordering Within a Session

```
1. General warm-up block (text label only in MVP)
2. Movement preparation exercises (if any prescribed)
3. Priority compound — highest technical demand, highest volume contribution
4. Other compound exercises (descending by: neurological fatigue then exercise priority)
5. Accessory compound and machine exercises
6. Isolation exercises (ascending by muscle fatigue carryover)
7. Core exercises
8. Carry, finisher, or optional conditioning
```

### 14.2 Exceptions

**Priority muscle emphasis:**  
When a muscle is in `priorityMuscle1/2/3`, move its primary compound to position 3 regardless of technique, and schedule it on the freshest day in the training week.

**Fatigue interference:**  
Do not schedule exercises for the same primary muscle consecutively if the first exercise has high `neurologicalFatigue` (≥ 3). Insert an exercise for a different muscle in between.

**Beginner-friendly order:**  
For "Brak aktywności fizycznej" and "Początkujący": avoid more than 2 consecutive exercises that share a primary mover. Interleave pushing and pulling patterns.

**Equipment efficiency:**  
Group barbell exercises before dumbbell exercises when the gym session allows equipment setup time savings.

**`orderInDay`** is written as 1-based integer index. The existing DND reordering in `PlanEditor` allows the trainer to change order freely.

---

## 15. Set Allocation Rules

### 15.1 Iterative Algorithm

```
repeat:
  1. For each split day, select candidate exercises (see §13)
  2. Assign initial working sets per exercise (from experience profile defaults)
  3. Compute effectiveSets per volume target via existing computeVolumeCore()
  4. Compare effectiveSets with weeklyTarget for each target
  5. For targets below tolerance:
       a. Add 1 working set to the exercise with highest coefficient for that target
       b. Check session duration budget — if exceeded, skip
  6. For targets above preferred ceiling:
       a. Remove 1 working set from the lowest-priority exercise for that target
  7. Recalculate
until convergence (all within tolerance) OR max_iterations = 20
  → if not converged: report unresolved gaps
```

### 15.2 Initial Set Assignment by Experience Profile

| Experience | Primary compound | Secondary exercise | Isolation |
|---|---|---|---|
| Brak aktywności fizycznej | 2 working sets | 2 working sets | 2 working sets |
| Początkujący | 3 working sets | 2–3 working sets | 2–3 working sets |
| Średniozaawansowany | 3–4 working sets | 3 working sets | 3 working sets |
| Zaawansowany | 4–5 working sets | 3–4 working sets | 3 working sets |

### 15.3 Tolerance

See §11.4. The generator stops iteration when all targets are within ±1.0 effective set of target, or after 20 iterations.

### 15.4 Trainer Display

Step 4 (and in the analysis panel) shows for every volume target:

```
Klatka piersiowa
  Cel:      10 serii efektywnych
  Wygenerowano: 10.2 serii
  Status:   ✓ W tolerancji
```

---

## 16. Repetition Rules

### 16.1 Rep Range by Exercise Type and Goal

| Exercise Type | Goal: Siła | Goal: Hipertrofia | Goal: Wytrzymałość |
|---|---|---|---|
| Main compound (barbell) | 4–6 | 6–10 | 8–12 |
| Compound (free weight) | 5–8 | 8–12 | 10–15 |
| Machine compound | 8–12 | 8–15 | 12–20 |
| Isolation | 10–15 | 10–20 | 15–25 |
| Calves, lateral raises | 12–20 | 15–25 | 20–30 |
| Core (reps) | 10–15 | 15–25 | 20–30+ |
| Core (time) | 20–40s | 30–60s | 45–90s |
| Carries | 20–30m | 30–40m | 40–60m |

The generator writes `repType = "range"` and `repRangeMin` / `repRangeMax` for all standard exercises.  
For time-based exercises: `repType = "time"`, `repTimeSeconds`.  
For carries: `repType = "distance"`, `repDistanceMeters`.

### 16.2 Experience-Level Override

- "Brak aktywności fizycznej": always use upper portion of the range (more reps, lower load)
- "Zaawansowany" with `trainingGoal = "Siła"`: use 3–5 reps for main compound if trainer approves

---

## 17. RIR Rules

### 17.1 Default by Experience Level and Exercise Safety

| Experience | Safe exercises (canBePerformedToFailure = true) | Technical/unsafe exercises |
|---|---|---|
| Brak aktywności fizycznej | RIR 4 | RIR 4 |
| Początkujący | RIR 3 | RIR 3–4 |
| Średniozaawansowany | RIR 2 | RIR 2–3 |
| Zaawansowany | RIR 1 | RIR 2–3 |

### 17.2 RIR Field

The generator writes `rir` (integer). `rpe` and `rirOrRpe` are left null unless trainer edits.

### 17.3 Set-Within-Session Progression

For "Zaawansowany": later sets within the same exercise may have lower RIR (e.g., sets 1–3 at RIR 2, final set at RIR 1). This is expressed in `clientInstructions`, not via separate DB entries (no per-set model).

---

## 18. Tempo Rules

### 18.1 Complexity by Experience Level

| Experience | Tempo Style | Example |
|---|---|---|
| Brak aktywności fizycznej | Text description only | "Kontrolowane opuszczanie, dynamiczne podniesienie" |
| Początkujący | Simple 4-digit code | "3-0-1-0" |
| Średniozaawansowany | Standard 4-digit code | "3-1-1-0" |
| Zaawansowany | Full exercise-specific | "4-1-1-0", "2-0-2-0" |

### 18.2 Tempo by Exercise Type

| Exercise Type | Eccentric | Pause | Concentric | Top |
|---|---|---|---|---|
| Heavy compound (strength) | 3 | 1 | 1 | 0 |
| Hypertrophy compound | 3 | 1 | 1 | 0 |
| Machine | 2 | 0 | 1 | 0 |
| Isolation (controlled) | 3 | 0 | 1 | 1 |
| Explosive / Olympic | 1 | 0 | X | 0 |
| Core (holds) | — | — | — | — (use time) |

### 18.3 Format

4-character string: `"E-P-C-T"` (eccentric seconds - pause - concentric - top pause).  
"X" = as fast as possible.  
The generator writes tempo as text into `workout_plan_exercises.tempo`.  
For "Brak aktywności fizycznej": write the text description into `clientInstructions` instead of the tempo field.

---

## 19. Rest Rules

### 19.1 Default Rest by Exercise Category

| Exercise Category | Rest Period |
|---|---|
| Heavy compound (≤ 6 reps or RIR ≤ 2) | 180–240 seconds |
| Standard compound | 90–180 seconds |
| Machine compound | 75–150 seconds |
| Accessory / supersetted | 60–150 seconds |
| Isolation | 60–120 seconds |
| Core | 45–90 seconds |
| Preparation / warm-up drills | 30–60 seconds |

### 19.2 Adjustments

- Short session budget (`sessionDuration < 45 min`): reduce isolation rest to 60 seconds (floor), compound to 90 seconds — emit `INSUFFICIENT_SESSION_TIME` if still over budget
- "Brak aktywności fizycznej": add 30 seconds to all rest periods (allow longer recovery)
- Priority exercises: use upper bound of rest range to maximize quality

### 19.3 Implementation

The generator writes `restSeconds` per exercise. The trainer may edit freely. The generator never reduces rest below:
- 60 seconds for any exercise
- 90 seconds for any compound movement

---

## 20. Warm-up Rules

### 20.1 General Warm-up (Session Level)

For MVP: stored as a text block in `workout_plan_days.description`.

Example content written by generator:

> "Rozgrzewka ogólna: 5–7 minut — marsz lub rower stacjonarny, krążenia ramion, mobilizacja bioder i klatki piersiowej."

This is visible in the plan editor day description field. No new table is required for MVP.

Post-MVP: introduce a `workout_plan_warmup` table with structured entries (activity, duration, reps).

### 20.2 Preparation Sets (Exercise Level)

For exercises where `warmUpSets` > 0, the generator writes:

| Experience | Main compound | Secondary | Isolation |
|---|---|---|---|
| Brak aktywności fizycznej | 2 sets | 1 set | 0 sets |
| Początkujący | 2 sets | 1 set | 0 sets |
| Średniozaawansowany | 2–3 sets | 1–2 sets | 0 sets |
| Zaawansowany | 3–4 sets | 2 sets | 0–1 sets |

Preparation set load guidance (written into `notes` for the exercise):

> "Serie rozgrzewkowe: ×20 (puste gryf lub lekki ciężar), ×10 (ok. 50%), ×5 (ok. 70%)"

**Warm-up sets MUST NEVER contribute to effective volume.** This is already enforced by `computeVolumeCore`.

### 20.3 Exercises Needing Preparation Sets

Apply preparation sets to:
- All barbell exercises
- Exercises with `learningDifficulty ≥ 2`
- Exercises with `neurologicalFatigue ≥ 3`
- All compound exercises for "Brak aktywności fizycznej" and "Początkujący"

Skip preparation sets for:
- Isolation exercises (unless "Zaawansowany" with specific technique need)
- Bodyweight exercises with `loadType = "bodyweight"`
- Carries and core exercises

---

## 21. Duration Model

### 21.1 Estimation Formula

Session duration is estimated per training day:

```
duration = generalWarmupMinutes
         + sum(exerciseDuration for each exercise)
         + transitionMinutes

exerciseDuration =
  warmUpSets × (avgRepDurationSeconds × 0.5 + shortRestSeconds)  // warmup sets: lighter load, less rest
  + workingSets × (avgRepDurationSeconds + restSeconds)

avgRepDurationSeconds =
  repsInSet × (eccentric + pause + concentric + top)  // from tempo string
  or use defaults: range midpoint × 4 seconds per rep (if no tempo specified)

transitionMinutes = exerciseCount × 1.0  // 1 minute per exercise change
generalWarmupMinutes = 6.0  // fixed for MVP

shortRestSeconds = 60  // for warmup sets between working sets
```

### 21.2 Display

```
Szacowany czas:  58 minut
Dostępny czas:   60 minut
Status:          ✓ Mieści się w limicie
```

```
Szacowany czas:  73 minut
Dostępny czas:   60 minut
Status:          ⚠ Przekroczony czas o 13 minut
Sugestie:
  • Usuń 1 ćwiczenie izolowane (oszczędność ~8 minut)
  • Skróć przerwy przy izolacji do 60 s (oszczędność ~5 minut)
```

### 21.3 Suggestions When Exceeded

The generator suggests, but does NOT automatically apply, any of:

1. Remove the lowest-priority isolation exercise from that day
2. Reduce rest on isolation exercises to 60 seconds (if currently higher)
3. Move one secondary exercise to another day
4. Use a machine variation with lower setup time

The trainer must accept each suggestion explicitly in the editor.

### 21.4 Written to DB

After generation, `estimatedDurationMinutes` is written to `workout_plan_days` for each day.  
This value is recalculated and displayed live in the analysis panel during editing (new feature needed in the analysis service).

---

## 22. Progression MVP

### 22.1 Double Progression (Standard Load Exercises)

Written as `clientInstructions` text per exercise:

> "Progresja: Gdy osiągniesz [repRangeMax] powtórzeń na wszystkich seriach roboczych przy RIR [rir], zwiększ ciężar o 2.5–5 kg w następnej sesji i wróć do dolnej granicy zakresu powtórzeń ([repRangeMin])."

Applicable to: all exercises with `repType = "range"` and `loadType = "fixed"`.

### 22.2 Bodyweight Exercises

Written as `clientInstructions`:

> "Progresja: Gdy osiągniesz [repRangeMax] powtórzeń, przejdź do trudniejszej wersji ćwiczenia lub dodaj dodatkowe obciążenie."

The `exercise_progressions` table (which links exercises to harder/easier alternatives) should be referenced here to name the next exercise.

### 22.3 Time-Based Exercises

> "Progresja: Gdy utrzymasz pozycję przez [repTimeSeconds] s z dobrą techniką na wszystkich seriach, zwiększ czas o 5–10 sekund."

### 22.4 Carries

> "Progresja: Gdy przejdziesz [repDistanceMeters] m z zachowaniem prawidłowej postawy, zwiększ obciążenie o 2–5 kg w kolejnej sesji."

### 22.5 Advanced Periodization — Deferred

Block periodization, wave loading, RPE-based autoregulation, and automatic deloads are deferred to post-MVP phases.

---

## 23. Warning Catalogue

### Existing Warnings (from planAnalyzer.ts — retained unchanged)

| Code | Severity | Scope | Blocking | Polish Message |
|---|---|---|---|---|
| PUSH_DOMINANT | warning | plan | No | "Dominuje trening pchania — rozważ więcej ćwiczeń ciągnących." |
| PULL_DOMINANT | warning | plan | No | "Dominuje trening ciągnący — rozważ więcej ćwiczeń pchania." |
| STRONGLY_PUSH_DOMINANT | error | plan | No | "Silna dominacja pchania — znaczna nierówność." |
| STRONGLY_PULL_DOMINANT | error | plan | No | "Silna dominacja ciągnięcia — znaczna nierówność." |
| SQUAT_DOMINANT | warning | plan | No | "Zbyt dużo ćwiczeń przysiadowych — rozważ więcej zawiasów." |
| HINGE_DOMINANT | warning | plan | No | "Zbyt dużo zawiasów — rozważ więcej przysiadu." |
| CLIENT_AVOIDS_EXERCISE | notice | exercise | No | "Klient chce unikać tego ćwiczenia — [powód]." |
| INACTIVE_EXERCISE | info | exercise | No | "Ćwiczenie jest nieaktywne w bibliotece." |
| (other existing codes) | — | — | — | (unchanged) |

### New Warnings for Draft Generation

| Code | Severity | Scope | Blocking | Polish Message | Recommended Action |
|---|---|---|---|---|---|
| MISSING_EXPERIENCE_LEVEL | error | plan | **YES** | "Brak poziomu doświadczenia klienta. Uzupełnij wywiad treningowy przed generowaniem." | Edit survey → set experienceLevel |
| INVALID_EXPERIENCE_LEVEL | error | plan | **YES** | "Nieprawidłowy poziom doświadczenia. Dozwolone: Brak aktywności, Początkujący, Średniozaawansowany, Zaawansowany." | Edit survey |
| MISSING_EQUIPMENT | warning | plan | No | "Brak informacji o sprzęcie. Generator przyjął siłownię pełną. Zweryfikuj dostępne ćwiczenia." | Check exercise filter |
| MISSING_TRAINING_LOCATION | warning | plan | No | "Brak informacji o miejscu treningu. Generator przyjął Siłownię." | Check exercise filter |
| INSUFFICIENT_SESSION_TIME | warning | day | No | "Szacowany czas sesji ([X] min) przekracza dostępny czas ([Y] min) o [Z] min." | Remove or shorten exercises |
| VOLUME_BELOW_TARGET | notice | plan | No | "Wygenerowana objętość dla [mięśnie]: [X] serii — poniżej celu ([Y] serii). Dodaj ćwiczenia lub serie." | Add sets |
| VOLUME_ABOVE_TARGET | notice | plan | No | "Wygenerowana objętość dla [mięśnie]: [X] serii — powyżej celu ([Y] serii). Rozważ redukcję." | Remove sets |
| UNSUITABLE_EXPERIENCE_LEVEL | notice | exercise | No | "To ćwiczenie jest ocenione jako nieodpowiednie dla poziomu klienta. Rozważ alternatywę." | Trainer decides |
| UNAVAILABLE_EQUIPMENT | warning | exercise | No | "Ćwiczenie wymaga sprzętu niedostępnego dla klienta: [sprzęt]." | Replace exercise |
| TOO_MANY_DEMANDING_EXERCISES | warning | day | No | "Ta sesja zawiera zbyt wiele ćwiczeń z wysokim zmęczeniem neurologicznym. Maksimum dla tego poziomu: [N]." | Move exercise to another day |
| TOO_MANY_SPOTTER_EXERCISES | notice | day | No | "Kilka ćwiczeń wymaga asekuracji. Upewnij się, że klient ma dostęp do asekuranta." | Add note or replace |
| POOR_PUSH_PULL_BALANCE | warning | plan | No | "Nierówność push/pull w wygenerowanym szkicu." | Adjust split |
| POOR_SQUAT_HINGE_BALANCE | warning | plan | No | "Nierówność przysiad/zawias w wygenerowanym szkicu." | Adjust exercise selection |
| MISSING_MOVEMENT_PATTERN | info | exercise | No | "Brak wzorca ruchowego w bazie — ćwiczenie nie wchodzi do analizy." | Edit exercise metadata |
| INSUFFICIENT_RECOVERY | notice | plan | No | "Mała przerwa między sesjami angażującymi [mięśnie]. Zalecane minimum 48 godz." | Rearrange training days |
| INCOMPLETE_EXERCISE_METADATA | info | exercise | No | "Ćwiczenie ma niepełne metadane. Może wpłynąć na jakość dopasowania." | Edit exercise in library |
| HEALTH_LIMITATION_PRESENT | notice | plan | No | "Klient zgłosił ograniczenia zdrowotne. Zweryfikuj ćwiczenia ręcznie." | Manual trainer review |
| NO_EXERCISE_FOR_PATTERN | warning | day | No | "Nie znaleziono ćwiczenia pasującego do wzorca [wzorzec] dla dnia [N]. Dodaj ręcznie." | Add from exercise picker |
| TOO_MANY_DAYS_FOR_LEVEL | notice | plan | No | "Liczba dni treningowych ([N]) może być zbyt duża dla poziomu [poziom]. Rozważ redukcję." | Adjust in wizard |

**Summary of blocking conditions:** Only `MISSING_EXPERIENCE_LEVEL` and `INVALID_EXPERIENCE_LEVEL` block generation. All other warnings are informational.

---

## 24. Explanation Model

### 24.1 Exercise Selection Explanation

Every generated exercise includes an `ExerciseSelectionReason` object:

```
Dlaczego wybrano to ćwiczenie?

• Pasuje do dostępnego sprzętu (Sztanga i talerze)
• Odpowiednie dla poziomu Średniozaawansowany
• Realizuje wzorzec Push — uzupełnia objętość klatki piersiowej
• Wysoka efektywność objętościowa (współczynnik klatka: 1.0)
• Niższa trudność nauki niż Wyciskanie wąskim uchwytem
• Priorytetowa grupa mięśniowa klienta
```

Shown in: wizard step 4 (popover on "💡 Dlaczego?"), and in plan editor exercise row (expandable).

### 24.2 Volume Selection Explanation

Per volume target in wizard step 3:

```
Klatka piersiowa — proponowane 10 serii

• Poziom Średniozaawansowany: zakres 8–14 serii (start: 60%)
• Dobra regeneracja klienta: +1 seria
• Mięsień priorytetowy: +1 seria
• 4 dni treningowe: możliwość ekspozycji 2× / tydzień
```

### 24.3 Split Selection Explanation

One paragraph per split recommendation:

```
Rekomendacja: Góra / Dół (4 dni)

Dla 4 dni treningowych i poziomu Średniozaawansowany podział
Góra/Dół pozwala trenować każdą grupę mięśniową 2× w tygodniu,
co sprzyja hipertrofii i technice. Przy priorytetowych barkach,
Dzień Góry A skupia się na ich objętości.
```

### 24.4 RIR / Tempo / Rest Explanation

Short inline notes shown on hover in wizard step 4:

```
RIR 2 — 2 powtórzenia zapasu. Utrzymaj kontrolę przez cały zakres.
Tempo 3-1-1-0 — 3s opuszczanie, 1s pauza na dole, 1s unoszenie.
Przerwa 120s — standard dla ćwiczenia wielostawowego.
```

---

## 25. Proposed Data Contracts

These interfaces are proposed only — not implemented.

### 25.1 PlanDraftGenerationInput

```typescript
interface PlanDraftGenerationInput {
  clientId: number;                  // Required. From clients.id.
  surveyId?: number;                 // Optional. If null, use latest survey for clientId.
  preferences: PlanDraftGenerationPreferences;  // Wizard step 2 overrides.
  volumeOverrides?: Record<string, number>;      // Wizard step 3 overrides: volumeTargetId → sets.
  existingPlanId?: number;           // If provided, overwrite this plan. Otherwise create new.
}
```

### 25.2 PlanDraftGenerationPreferences

```typescript
interface PlanDraftGenerationPreferences {
  availableDays: number;             // Required. 2–6. From wizard or survey.
  sessionDurationMinutes: number;    // Required. 30–180. From wizard or survey.
  splitType: string;                 // Required. e.g. "upper_lower", "full_body", "ppl".
  trainingGoal: string;              // Required. Normalized. e.g. "Hipertrofia", "Siła".
  blockDurationWeeks: number;        // Optional default 4. Written to plan description.
  priorityMuscleGroups: string[];    // Optional. From survey or wizard override.
  trainingStyle: string;             // Optional. From planStylePreference.
  trainerNotes?: string;             // Optional. Written to plan.description.
}
```

Validation: `availableDays` must be 2–6; `sessionDurationMinutes` must be ≥ 30; `splitType` must be a known enum value.

### 25.3 WeeklyVolumeTarget

```typescript
interface WeeklyVolumeTarget {
  volumeTargetId: number;            // From volume_targets.id. Existing.
  targetName: string;                // From volume_targets.name. Existing.
  experienceLevel: string;           // From generation input.
  guidelineWeeklyPreferredCeiling: number;  // From volume_guidelines. Existing.
  guidelineWeeklyAbsoluteCeiling: number;   // From volume_guidelines. Existing.
  guidelineSessionMin: number;       // From volume_guidelines. Existing.
  guidelineSessionMax: number;       // From volume_guidelines. Existing.
}
```

### 25.4 VolumeTargetDecision

```typescript
interface VolumeTargetDecision {
  target: WeeklyVolumeTarget;
  suggestedWeeklySets: number;       // Computed by §10 algorithm.
  overriddenWeeklySets?: number;     // Set if trainer overrode in wizard step 3.
  finalWeeklySets: number;           // overriddenWeeklySets ?? suggestedWeeklySets.
  generatedEffectiveSets: number;    // Computed after exercise assignment.
  toleranceStatus: "within" | "below" | "above";
  reasons: string[];                 // Polish explanation strings.
  frequency: number;                 // Times per week this target is trained.
}
```

### 25.5 RecommendedTrainingSplit

```typescript
interface RecommendedTrainingSplit {
  splitType: string;                 // e.g. "upper_lower".
  dayCount: number;                  // Total training days.
  dayTemplates: SplitDayTemplate[];  // One per training day.
  explanationPl: string;             // Polish paragraph.
}

interface SplitDayTemplate {
  dayIndex: number;                  // 1-based.
  dayName: string;                   // e.g. "Góra A".
  subtitle: string;                  // e.g. "Klatka + Barki".
  primaryVolumeTargetIds: number[];  // Which targets this day primarily trains.
}
```

### 25.6 GeneratedPlanDraft

```typescript
interface GeneratedPlanDraft {
  planId: number;                    // Created/updated plan in workout_plans.
  clientId: number;
  surveyId: number;
  experienceLevelUsed: string;
  splitType: string;
  days: GeneratedPlanDay[];
  volumeDecisions: VolumeTargetDecision[];
  warnings: GeneratorWarning[];
  metadata: GenerationMetadata;
}
```

### 25.7 GeneratedPlanDay

```typescript
interface GeneratedPlanDay {
  planDayId: number;                 // Created day in workout_plan_days.
  dayOrder: number;
  dayName: string;
  subtitle: string;
  warmupDescriptionPl: string;       // Written to workout_plan_days.description (MVP).
  estimatedDurationMinutes: number;  // Written to workout_plan_days.estimatedDurationMinutes.
  exercises: GeneratedExercisePrescription[];
  durationEstimate: DurationEstimate;
}
```

### 25.8 GeneratedExercisePrescription

```typescript
interface GeneratedExercisePrescription {
  planExerciseId: number;            // Created row in workout_plan_exercises.
  exerciseId: number;
  exerciseName: string;
  orderInDay: number;
  workingSets: number;
  warmUpSets: number;
  repType: "range" | "exact" | "time" | "distance" | "open";
  repRangeMin?: number;
  repRangeMax?: number;
  repTimeSeconds?: number;
  repDistanceMeters?: number;
  loadType: string;
  rir: number;
  tempo: string;
  restSeconds: number;
  notes?: string;                    // Trainer-private context.
  clientInstructions?: string;       // Progression rule.
  selectionReasons: ExerciseSelectionReason;
  warnings: GeneratorWarning[];      // Exercise-scoped warnings.
}
```

### 25.9 GeneratedWarmup

```typescript
// MVP: text only, written to workout_plan_days.description.
// Post-MVP: this interface will map to a workout_plan_warmup table.
interface GeneratedWarmup {
  generalWarmupDescriptionPl: string;
  estimatedDurationMinutes: number;
  preparationSets?: WarmupPreparationSet[];  // Post-MVP.
}
```

### 25.10 ExerciseSelectionReason

```typescript
interface ExerciseSelectionReason {
  exerciseId: number;
  score: number;                     // 0–100 normalized score.
  matchReasonsPl: string[];          // Polish bullet points (why selected).
  warnReasonsPl: string[];           // Polish bullet points (caveats).
  rankPosition: number;              // Position in ranked list for this slot.
  alternativeExerciseIds: number[];  // Up to 3 alternatives trainer could choose.
}
```

Reuses existing `matchReasons` / `warnReasons` from the recommendation engine.

### 25.11 GeneratorWarning

```typescript
interface GeneratorWarning {
  code: string;                      // From warning catalogue.
  severity: "info" | "notice" | "warning" | "error";
  scope: "plan" | "day" | "exercise";
  blocking: boolean;
  dayIndex?: number;                 // If scope = "day".
  exerciseId?: number;               // If scope = "exercise".
  messagePl: string;                 // Polish message.
  detailPl?: string;                 // Optional Polish detail.
  recommendedActionPl?: string;      // What the trainer should do.
}

// Reuses the existing AnalysisWarning shape from planAnalyzer.ts — same fields.
// If the existing type matches this interface, use it directly.
```

### 25.12 DurationEstimate

```typescript
interface DurationEstimate {
  estimatedMinutes: number;
  availableMinutes: number;
  status: "within" | "exceeded" | "significantly_exceeded";
  overageMinutes?: number;
  suggestions: string[];             // Polish suggestions if exceeded.
  breakdown: {
    generalWarmupMinutes: number;
    workingExercisesMinutes: number;
    warmupSetsMinutes: number;
    transitionMinutes: number;
  };
}
```

### 25.13 GenerationMetadata

```typescript
interface GenerationMetadata {
  generatedAt: string;               // ISO timestamp.
  generatorVersion: string;          // Semantic version of the generator service.
  surveyId: number;                  // Which survey snapshot was used.
  iterationCount: number;            // Volume allocation iterations used.
  unresolvedGaps: string[];          // Polish descriptions of targets not met.
  inputSnapshot: PlanDraftGenerationInput;  // Stored for audit; do not use for re-generation.
}
```

---

## 26. MVP Scope

The MVP includes:

- [ ] Wizard entry point: "Generuj szkic" button on ClientDetail (Plans tab)
- [ ] Wizard step 1: Client and survey data summary
- [ ] Wizard step 2: Plan preferences (days, session duration, split, goal, block duration)
- [ ] Wizard step 3: Volume target review with per-target override
- [ ] Wizard step 4: Generated draft preview (read-only)
- [ ] Generator service: `planDraftGeneratorService.ts` (backend, no AI)
- [ ] Volume starting-value algorithm (§10)
- [ ] Split recommendation logic (§12)
- [ ] Exercise selection with extended recommendation engine (§13)
- [ ] Exercise ordering (§14)
- [ ] Set allocation iterative algorithm (§15)
- [ ] Repetition range assignment (§16)
- [ ] RIR assignment (§17)
- [ ] Simple tempo assignment (§18)
- [ ] Rest period assignment (§19)
- [ ] Warm-up sets count per exercise (§20.2)
- [ ] General warm-up text in day description (§20.1)
- [ ] Duration estimation per day (§21)
- [ ] Double-progression clientInstructions text (§22)
- [ ] All new warning codes from §23
- [ ] Exercise selection explanation (§24.1)
- [ ] Volume selection explanation (§24.2)
- [ ] Split selection explanation (§24.3)
- [ ] Save generated plan as draft (via existing plan API)
- [ ] Open generated draft in existing PlanEditor (no new UI)
- [ ] `POST /plans/generate-draft` endpoint (new)
- [ ] Zod schemas for all new interfaces

---

## 27. Deferred Scope

The following are explicitly out of scope for MVP:

| Feature | Reason |
|---|---|
| AI / LLM integration | Explicitly excluded by product principle |
| Automatic medical decisions | Safety and liability risk |
| Advanced periodization (block/wave loading) | Requires new DB schema |
| Automatic deload | No plan periodization model |
| Supersets, drop sets, rest-pause, forced reps | Static plan model; no set-entry table |
| Automatic adaptation based on client performance | No tracking system exists |
| Automatic weekly plan changes | Static template model |
| Per-set load prescriptions for warm-up | Requires new workout_plan_set_entries table |
| Session-level warm-up table | Requires schema migration |
| `workout_plan_warmup` table | Post-MVP |
| `splitType` column in surveysTable | Optional — wizard can store it transiently |
| `progressionType` column in workout_plan_exercises | Post-MVP |
| Wizard entry from empty PlanEditor | Phase 1 secondary entry point |
| Mobile-specific UI | Existing trainer app is web-only |

---

## 28. Implementation Roadmap

### Phase 1 — Generator Input and Configuration Wizard

**Scope:**
- `PlanDraftGenerationInput` and `PlanDraftGenerationPreferences` Zod schemas
- Survey data normalizer (equipment text parser, sessionDuration parseInt, recoveryQuality composite)
- Wizard UI: steps 1 and 2 (read survey, show summary, allow overrides)
- `POST /plans/generate-draft` endpoint skeleton (validates input, returns MISSING_EXPERIENCE_LEVEL if needed)
- Entry point: "Generuj szkic" button on ClientDetail

**Independently testable:** Unit tests for survey normalizer; E2E test for wizard step 1 and 2 rendering and validation.

### Phase 2 — Weekly Volume-Target Decision Engine

**Scope:**
- Volume starting-value algorithm (§10)
- `VolumeTargetDecision` generation
- Polish reason string generation
- Wizard step 3 (per-target review and override)

**Independently testable:** Unit tests for volume algorithm across all 44 guideline rows and all recovery/priority combinations.

### Phase 3 — Training Split and Volume-Distribution Engine

**Scope:**
- Split recommendation logic (§12)
- `RecommendedTrainingSplit` and `SplitDayTemplate` generation
- Volume distribution across days (§11)
- Recovery spacing check
- Session volume limit enforcement
- Warnings: INSUFFICIENT_RECOVERY, TOO_MANY_DAYS_FOR_LEVEL

**Independently testable:** Unit tests for split selection matrix; unit tests for distribution algorithm; tests for recovery spacing.

### Phase 4 — Exercise Selection and Ordering Engine

**Scope:**
- Hard filter pipeline (§13.1)
- Recommendation engine extension (new scoring factors in §13.2)
- `ExerciseSelectionReason` generation
- Exercise ordering logic (§14)
- Warnings: UNAVAILABLE_EQUIPMENT, UNSUITABLE_EXPERIENCE_LEVEL, NO_EXERCISE_FOR_PATTERN, TOO_MANY_DEMANDING_EXERCISES, TOO_MANY_SPOTTER_EXERCISES, CLIENT_AVOIDS_EXERCISE (at generation stage)

**Independently testable:** Unit tests for hard filters; scoring extension; ordering for each split type and experience level.

### Phase 5 — Sets, Repetitions, RIR, Tempo and Rest Engine

**Scope:**
- Set allocation iterative algorithm (§15)
- Repetition rule tables (§16)
- RIR assignment (§17)
- Tempo assignment (§18)
- Rest assignment (§19)
- Warm-up set count assignment (§20.2)
- Volume tolerance checks
- Warnings: VOLUME_BELOW_TARGET, VOLUME_ABOVE_TARGET

**Independently testable:** Unit tests for set allocation convergence; unit tests for rep/RIR/tempo/rest tables; volume tolerance; max-coefficient integration.

### Phase 6 — Warm-up and Preparation Sets

**Scope:**
- General warm-up text generation per day type and experience level (§20.1)
- Preparation set count assignment (§20.2)
- `clientInstructions` progression text (§22)

**Independently testable:** Snapshot tests for generated warm-up text; progression text per exercise type.

### Phase 7 — Duration Estimate, Explanations and Warnings

**Scope:**
- Duration estimation formula (§21)
- Duration written to `workout_plan_days.estimatedDurationMinutes`
- Duration display in wizard step 4 and analysis panel
- Exercise selection explanation display (§24.1, §24.2, §24.3)
- All remaining warning codes (INSUFFICIENT_SESSION_TIME, HEALTH_LIMITATION_PRESENT, etc.)

**Independently testable:** Duration calculation unit tests for each experience level; explanation string snapshot tests.

### Phase 8 — Draft Review, Manual Editing and Saving

**Scope:**
- Wizard step 4 draft preview component (read-only)
- "Edytuj w kreatorze" → opens PlanEditor with generated plan
- "Zapisz szkic" → calls existing PATCH plan endpoint
- Warning display in wizard step 4 (reuse AnalysisPanel components)
- Volume summary table in wizard step 4

**Independently testable:** E2E test: wizard step 1–4 → save draft → verify plan in DB → open in PlanEditor.

### Phase 9 — End-to-End Tests and Production Validation

**Scope:**
- Full E2E: survey data → wizard → generated draft → plan editor → save → activate
- All 4 experience levels tested
- 2/3/4/5-day splits tested
- Edge cases: missing equipment, no priorityMuscles, health limitations present, all exercises avoided
- Performance: generation < 3 seconds for 4-day plan
- Regression: existing plan builder tests still pass

---

## 29. Test Strategy

### Unit Tests (backend — vitest)

| Component | Test Coverage |
|---|---|
| Survey normalizer | Equipment parser, sessionDuration parse, recoveryQuality composite |
| Volume algorithm | All 44 guideline rows × all recovery/priority combinations |
| Split recommendation | All days × all experience levels (exhaustive matrix) |
| Volume distribution | Frequency selection, recovery spacing, per-session limits |
| Hard filters | Each filter type × exercises with and without required metadata |
| Recommendation engine extension | Each new scoring factor in isolation |
| Set allocation | Convergence within 20 iterations for typical inputs; edge cases |
| Duration estimator | Each exercise type, tempo string formats, overcap cases |
| Warning generator | Each warning code triggered and not triggered by known inputs |

### Integration Tests (backend — vitest + real DB)

| Scenario | Coverage |
|---|---|
| Generate draft for "Brak aktywności fizycznej" client | Sanity: volume, exercise count, sets, RIR |
| Generate draft for "Zaawansowany" client | Higher volume, more exercises, correct RIR |
| Missing experience level → MISSING_EXPERIENCE_LEVEL | Blocking check |
| Missing equipment → MISSING_EQUIPMENT | Warning, not blocking |
| All exercises avoided → CLIENT_AVOIDS_EXERCISE on generated | Non-blocking |
| Health limitations present → HEALTH_LIMITATION_PRESENT | Notice only |
| Session duration exceeded → INSUFFICIENT_SESSION_TIME | Notice + suggestions |

### E2E Tests (Playwright — existing test infrastructure)

| Flow | Assertions |
|---|---|
| Wizard entry from ClientDetail | Button visible, wizard opens with correct client name |
| Step 1 renders survey data correctly | All fields displayed; missing field flagged |
| Step 2 allows override of days and split | Updated value reflected in step 3 volume |
| Step 3 volume targets shown with reasons | All 11 targets visible; override field works |
| Step 4 preview rendered with exercises | Days, exercises, warnings, volume summary |
| Save draft → plan appears in client profile | plan.status = "draft" in plans list |
| Open in editor → trainer can edit | RIR field editable, sets editable, save works |

### Regression Tests

- All 310 existing tests continue to pass after implementing the generator
- Volume calculator (`computeVolumeCore`) output unchanged for identical inputs
- Plan analyzer (`planAnalyzer.ts`) warnings unchanged for existing plans

---

## 30. Risks and Unresolved Decisions

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Equipment text parsing failure | High | Maintain a canonical mapping table; reject unknown strings with MISSING_EQUIPMENT |
| Volume algorithm produces values outside guideline range | High | Clamp final value to [sessionMin, weeklyAbsoluteCeiling] before writing |
| Set allocation non-convergence | Medium | Cap at 20 iterations; report unresolved gaps; never block saving |
| Exercise library gaps (missing metadata) | Medium | Emit INCOMPLETE_EXERCISE_METADATA; fallback to score 0 for missing factors |
| Split recommendation inappropriate for client | Medium | Always show recommendation as overridable; trainer is always in control |
| Duration estimation inaccuracy | Low | Show as estimate; trainer can re-assess; no hard blocks |
| Health limitations misinterpreted | High | Never parse medically; emit HEALTH_LIMITATION_PRESENT (notice) only |
| Recommendation engine score collisions | Low | Deterministic tiebreaker; trainer can always replace |

### Unresolved Product Decisions

| Decision | Options | Recommendation |
|---|---|---|
| **Where is splitType stored?** | (A) Only in wizard state (transient), (B) New column on surveysTable, (C) New column on workout_plans | Recommend (C): add `splitType` to `workout_plans` — it is a plan property, not a client property |
| **planBlockDuration storage** | (A) Written to plan description text only, (B) New column on workout_plans | Recommend (B): add `blockDurationWeeks integer` to `workout_plans` |
| **Wizard entry from PlanEditor** | (A) Phase 1 includes both entry points, (B) PlanEditor entry in Phase 8 | Recommend (B): keep Phase 1 simpler, add PlanEditor entry after validation |
| **Recovery quality composite** | (A) Use the formula in §10.1, (B) Let trainer rate recovery 1–5 in wizard | Recommend (A) for MVP; trainer can override volume in step 3 |
| **surveyId on generated plan** | (A) Always link to latest survey, (B) Wizard shows which survey is used and allows selecting a different one | Recommend (A) for MVP; multi-survey selection deferred |
| **Equipment normalization mapping** | Must be maintained as a static lookup table — who maintains it? | Trainer-app admin panel for equipment management (post-MVP) |
| **Wizard navigation mode** | (A) All wizard steps on one long page (mobile-friendly scroll), (B) Multi-step pagination | Recommend (B): pagination matches existing trainer-app patterns |
| **Can trainer save mid-wizard?** | (A) Save only at step 5 (draft), (B) Save wizard state to sessionStorage between steps | Recommend (B): prevent data loss on accidental navigation |

### Decisions Requiring Trainer Approval Before Implementation

1. **Split type enum values** — the exact Polish labels and technical codes for splits (e.g. is it "full_body" or "FBW"?) must be confirmed with the lead trainer.
2. **Volume starting-position fractions** — the base fractions (0.40, 0.50, 0.60, 0.70) and modifiers are engineering estimates. The lead trainer should review and adjust before Phase 2.
3. **Preparation set thresholds** — which exercises require warm-up sets and how many, by experience level, should be validated by the lead trainer.
4. **Tempo defaults** — all tempo codes in §18 must be verified by the lead trainer against their preferred coaching style.
5. **Rest period defaults** — all rest ranges in §19 must be verified by the lead trainer.
6. **Warning thresholds** — e.g. TOO_MANY_DEMANDING_EXERCISES threshold (1/2/3/4 per session by level) must be confirmed by the lead trainer.

---

## Final Report

### 1. Files Inspected

- `lib/db/src/schema/surveys.ts`
- `lib/db/src/schema/clients.ts`
- `lib/db/src/schema/exercises.ts`
- `lib/db/src/schema/plans.ts`
- `lib/db/src/schema/muscles.ts`
- `lib/db/src/schema/exercise-relations.ts`
- `lib/db/src/schema/` (volume targets, guidelines, assignments)
- `lib/db/src/seeds/volumeGuidelines.ts`
- `artifacts/api-server/src/services/volumeCalculator.ts`
- `artifacts/api-server/src/services/planAnalyzer.ts`
- `artifacts/api-server/src/services/exerciseRecommendationEngine.ts`
- `artifacts/api-server/src/routes/plans.ts`
- `artifacts/api-server/src/routes/exercises.ts`
- `artifacts/api-server/src/routes/surveys.ts`
- `artifacts/api-server/src/routes/public.ts`
- `artifacts/trainer-app/src/pages/PlanEditor.tsx`
- `artifacts/trainer-app/src/pages/ClientDetail.tsx`
- `lib/api-zod/src/avoided-exercises.ts`
- `artifacts/client-landing/src/components/SurveyForm.tsx`
- `artifacts/client-landing/src/components/AvoidedExercisesPicker.tsx`

### 2. Features Ready to Reuse

- Survey data (all fields confirmed)
- 4 experience levels (confirmed in DB, engine, UI)
- 11 volume targets and 44 guidelines (confirmed in DB)
- Volume calculator with max-coefficient rule
- Exercise library (87 active exercises with full metadata)
- Exercise recommendation engine (0–100 score, 9 factors, matchReasons/warnReasons)
- Exercise progressions table (harder/easier exercise links)
- Plan CRUD API (create, read, update, delete, days, exercises, reorder)
- Full prescription model (sets, reps, RIR, tempo, rest, loadType, warmUpSets)
- Movement analysis and balance warnings
- CLIENT_AVOIDS_EXERCISE warning system
- Plan saving (draft) and activation flow
- PlanEditor UI (exercise picker, day management, DND, analysis panel)
- Avoided exercises resolver endpoint

### 3. Partially Ready Features

- Warm-up: `warmUpSets` count exists; no session warm-up model, no set-type selector
- Recommendation engine: usable but missing 5 scoring factors needed for generation
- Session duration column: `estimatedDurationMinutes` exists but is never populated

### 4. Missing Capabilities

- Training split concept (no structured field, no recommendation logic)
- Session duration estimation service
- Volume starting-value algorithm
- Volume distribution across days
- Generator service (`planDraftGeneratorService.ts`)
- Generator wizard UI (5-step)
- `POST /plans/generate-draft` endpoint
- Explanation model (ExerciseSelectionReason)
- 17 new warning codes
- Equipment text normalizer
- Recovery quality composite function

### 5. Architecture Limitations

- Survey `equipment` stored as free text — requires normalizer
- No `splitType` field on plans or surveys
- No `blockDurationWeeks` on plans
- No session-level warm-up table
- No plan-level progression rules
- Static weekly template (no periodization)

### 6. Recommended UX Flow

5-step wizard → Step 1 (client summary) → Step 2 (plan preferences) → Step 3 (volume targets) → Step 4 (generated draft preview) → Step 5 (existing PlanEditor). Entry point from ClientDetail "Generuj szkic" button.

### 7. Recommended MVP

All 30-section specification above. Key constraints: no AI, no medical decisions, no advanced periodization, trainer retains full control, generation non-blocking, draft only, never auto-activate.

### 8. Recommended Rule-Engine Architecture

Pure TypeScript service (`planDraftGeneratorService.ts`) with:
- No side effects in generation functions (pure functions, testable in isolation)
- Input → normalized input → volume decisions → split → day templates → exercise selection (per day) → set allocation → prescription → duration estimate → warnings → draft saved to DB
- `computeVolumeCore` reused without modification for volume verification
- `exerciseRecommendationEngine` extended with new scoring factors without modifying the existing engine signature

### 9. Recommended Data Contracts

See §25 for all 13 interfaces. Key: `PlanDraftGenerationInput`, `PlanDraftGenerationPreferences`, `GeneratedPlanDraft`, `GeneratedExercisePrescription`, `VolumeTargetDecision`, `GeneratorWarning`.

### 10. Recommended Implementation Phases

9 phases (§28): Input/wizard → Volume engine → Split/distribution → Exercise selection → Sets/reps/RIR/tempo/rest → Warm-up → Duration/explanations/warnings → Draft review/save → E2E validation.

### 11. Possible Later Database Changes

- `workout_plans.splitType text`
- `workout_plans.blockDurationWeeks integer`
- `workout_plan_warmup` table (general + preparation warm-up model)
- `workout_plan_exercises.progressionType text`
- `workout_plan_exercises.loadProgressionRule jsonb`
- Equipment normalization lookup table

### 12. Possible Later API Changes

- `POST /plans/generate-draft` (new endpoint, Phase 1)
- `GET /clients/:clientId/survey-summary` (new, aggregates survey fields for wizard step 1)
- Extension of `POST /plans/analysis-preview` to include session duration
- Extension of `GET /plans/:id` to include `splitType`, `blockDurationWeeks`, `generationMetadata`

### 13. Possible Later Frontend Changes

- New `GenerateDraftWizard` component (multi-step, 5 steps)
- "Generuj szkic" button on `ClientDetail` Plans tab
- Volume target override inputs in wizard step 3
- Draft preview component in wizard step 4
- Exercise explanation popover in plan editor
- Duration display in analysis panel
- Volume target vs generated comparison in analysis panel

### 14. Test Strategy

See §29: unit tests for every algorithm, integration tests with real DB for all 4 experience levels, E2E test for full wizard flow, regression confirmation that all 310 existing tests still pass.

### 15. Risks

See §30. Highest risks: equipment text parsing, health limitations interpretation, volume non-convergence. All mitigated by non-blocking approach, trainer override, and explicit gap reporting.

### 16. Decisions Requiring Trainer Approval

1. Split type enum values (Polish labels)
2. Volume starting-position fractions
3. Preparation set thresholds by experience level
4. All tempo defaults
5. All rest period defaults
6. TOO_MANY_DEMANDING_EXERCISES thresholds
7. Recovery quality composite thresholds (sleep/stress cutoffs)

### 17. Documentation File Location

`docs/workout-plan-draft-generator-spec.md`

---

## Confirmations

- ✅ No production code was modified
- ✅ No database data was modified
- ✅ No migration was created
- ✅ No plan was generated
- ✅ Volume formulas remained unchanged
- ✅ No AI was implemented

---

**READY FOR IMPLEMENTATION**
