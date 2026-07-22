/**
 * Plan-Draft Generate Day — HTTP route
 *
 * POST /api/clients/:clientId/plan-draft/generate-day
 *
 * True empty-session generator: builds a complete training day from scratch
 * using ExerciseSelectionEngineV0.  Unlike the day-recommendations endpoint
 * (which continues an already-started session via alreadyAdded), this route
 * starts with ZERO selected exercises and fills all slots in one call.
 *
 * Body (JSON):
 *   { "v0SessionType": "push" | "pull" | "legs" | "upper" | "lower" }
 *
 * Generation guarantees:
 *   - usedExerciseIds is created empty at session start
 *   - no alreadyAdded seed is accepted or required
 *   - equipment / location hard filters applied (same as recommendations route)
 *   - avoided exercises excluded
 *   - V0 slot structure enforced (core last, no near-duplicates, etc.)
 *   - returns 422 when required slots cannot be filled
 *
 * The OLD autofill path (GET .../day-recommendations) is completely unchanged.
 *
 * Response:
 *   { hasProfile, hasLocationData, sessionType, exercises: DayRecommendationExercise[] }
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  clientsTable,
  surveysTable,
  exercisesTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";
import { scoreExercise } from "../lib/recommendation-engine";
import { computeCompleteness, fetchMuscleStats } from "../lib/exercise-completeness";
import {
  isLocationCompatible,
  isEquipmentCompatible,
  type SubTargetBiases,
} from "../services/planDraftDayRecommendationsService";
import { normalizeMovementCategory } from "../services/planAnalyzer";
import {
  runExerciseSelectionEngineV0,
  type V0SessionType,
  type V0PriorityContext,
} from "../services/ExerciseSelectionEngineV0";
import { buildGoalProfile } from "../services/goalProfileService";
import { PRIORITY_ELIGIBLE_EXPERIENCE_LEVELS } from "@workspace/api-zod";

const router: IRouter = Router();

const ParamsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

const BodySchema = z.object({
  /**
   * V0 session type — determines which slot template to apply.
   * "push" | "pull" | "legs" | "upper" | "lower"
   */
  v0SessionType: z.enum(["push", "pull", "legs", "upper", "lower", "plyo"]),
  /**
   * Controlled variety index (optional, default 0).
   *
   * 0 = stable default — rank-1 candidate always wins each slot (deterministic).
   * 1 = first alternative — prefer the first pattern-diverse candidate in each slot's band.
   * 2 = second alternative — prefer the second pattern-diverse candidate, etc.
   *
   * Protected main-lift slots draw from a band of 3; accessory slots from a band of 5.
   * Passing any value > 0 produces a structurally identical but exercise-diverse session.
   */
  alternativeIndex: z.number().int().min(0).optional(),
  /**
   * BLOCKER 3 FIX — Cross-session memory for multi-day week generation.
   *
   * Optional list of exercise IDs already used in earlier sessions of the
   * same generated week.  When provided, V0 excludes these exercises from
   * all slots before running the slot-fill algorithm — the same deduplication
   * mechanism that already prevents repeats within a single session.
   *
   * Behaviour:
   *   - omitted / empty → single isolated session, unchanged behaviour
   *   - non-empty       → V0 starts with these IDs pre-marked as used,
   *                       producing a day that shares no exercises with
   *                       the earlier sessions unless the pool is exhausted
   *
   * Design constraints:
   *   - deterministic: no randomness added; the same week context always
   *     produces the same session given the same alt index
   *   - does not affect equipment/location/safety filtering
   *   - does not alter session structure (slot order, core-last rule, etc.)
   *   - the caller accumulates IDs from each generated day and passes them
   *     to subsequent calls; the server holds no inter-request state
   */
  weekUsedExerciseIds: z.array(z.coerce.number().int().positive()).optional(),
  /**
   * Exercises from the previous occurrence of this same session type
   * (e.g. Upper A's exercises when generating Upper B).
   *
   * These exercises are already hard-excluded from the pool via weekUsedExerciseIds.
   * This list provides the equipment context needed to also deprioritize exercises
   * that use the SAME IMPLEMENT as the previous same-type selection — steering each
   * slot's band selection toward genuine angle, grip, or tool variation.
   *
   * When omitted (first occurrence or single-session call), the engine still applies
   * pattern + equipment diversity within the local band.
   */
  sameTypePreviousExercises: z.array(
    z.object({
      id: z.number().int().positive(),
      equipment: z.array(z.string()),
    }),
  ).optional().default([]),
});

router.post(
  "/clients/:clientId/plan-draft/generate-day",
  async (req, res): Promise<void> => {
    // ── Parse + validate inputs ────────────────────────────────────────────────
    const params = ParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = BodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error:
          "v0SessionType is required: push | pull | legs | upper | lower | plyo",
      });
      return;
    }

    const { clientId } = params.data;
    const { v0SessionType } = body.data;

    // ── Verify client ──────────────────────────────────────────────────────────
    const [client] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId));

    if (!client) {
      res.status(404).json({ error: "Klient nie znaleziony" });
      return;
    }

    // ── Fetch latest survey ────────────────────────────────────────────────────
    const [survey] = await db
      .select()
      .from(surveysTable)
      .where(eq(surveysTable.clientId, clientId))
      .orderBy(desc(surveysTable.createdAt))
      .limit(1);

    if (!survey) {
      res.json({ hasProfile: false, hasLocationData: false, exercises: [] });
      return;
    }

    const hasLocationData =
      !!(survey.trainingLocation?.trim()) && !!(survey.equipment?.trim());

    const avoidedExerciseIds = new Set<number>(survey.avoidedExerciseIds ?? []);

    // ── Fetch all active exercises ─────────────────────────────────────────────
    const exercises = await db
      .select()
      .from(exercisesTable)
      .where(eq(exercisesTable.isActive, true))
      .orderBy(exercisesTable.name);

    // ── Filter to complete exercises ───────────────────────────────────────────
    const statsMap = await fetchMuscleStats(exercises.map((e) => e.id));
    const completeExercises = exercises.filter((ex) => {
      const stats = statsMap.get(ex.id);
      const { isComplete } = computeCompleteness(ex, stats);
      return isComplete;
    });

    // ── Family-level exercise blocking (Stage G — Part 1 — hard constraints) ──
    //
    // An excluded exercise often implies the entire movement family, not just
    // the exact DB row.  E.g. avoiding "martwy ciąg" should block "martwy ciąg
    // rumuński", "martwy ciąg sumo", etc.
    //
    // This expansion runs BEFORE pool building so that isAvoided propagates to
    // every family member via the same avoidedExerciseIds Set used in the pool
    // loop below.
    //
    // Conservative design: 6 practical families are mapped.  Any excluded
    // exercise whose name does not match a trigger is blocked exactly (exact-only).
    const FAMILY_BLOCKING_MAP: Array<{
      trigger: string;        // substring matched against the avoided exercise name
      blocksFragment: string; // substring matched against ALL active exercise names
      label: string;          // human-readable description for the explanation block
    }> = [
      { trigger: "martwy ciąg",          blocksFragment: "martwy ciąg",        label: "martwy ciąg i warianty (cała rodzina)" },
      { trigger: "wyciskanie nad głowę",  blocksFragment: "nad głowę",          label: "wyciskanie nad głowę i warianty (cała rodzina)" },
      { trigger: "ohp",                   blocksFragment: "nad głowę",          label: "wyciskanie nad głowę i warianty (cała rodzina)" },
      { trigger: "wiosłowanie",           blocksFragment: "wiosłowanie",        label: "wiosłowanie i warianty (cała rodzina)" },
      { trigger: "przysiad",              blocksFragment: "przysiad",           label: "przysiady i warianty (cała rodzina)" },
      { trigger: "wyciskanie sztangą",    blocksFragment: "wyciskanie sztangą", label: "wyciskanie sztangą i warianty (cała rodzina)" },
    ];

    // Tracks what was blocked and how — surfaced in the explanation block.
    const blockedFamilies: Array<{ avoidedName: string; label: string }> = [];
    const exactOnlyBlocks: string[] = [];

    for (const ex of exercises) {
      if (!avoidedExerciseIds.has(ex.id)) continue;
      const lowerName = (ex.name ?? "").trim().toLowerCase();

      const familyRule = FAMILY_BLOCKING_MAP.find((rule) =>
        lowerName.includes(rule.trigger),
      );
      if (familyRule) {
        // Expand: add every active exercise whose name contains the family fragment.
        blockedFamilies.push({ avoidedName: ex.name ?? "", label: familyRule.label });
        for (const candidate of exercises) {
          if ((candidate.name ?? "").toLowerCase().includes(familyRule.blocksFragment)) {
            avoidedExerciseIds.add(candidate.id);
          }
        }
      } else {
        exactOnlyBlocks.push(ex.name ?? "");
      }
    }

    // ── Build scored pool — equipment + location hard filters applied ──────────
    //
    // KEY DIFFERENCE from the recommendations route:
    //   alreadyAddedIds is intentionally absent — the pool includes ALL eligible
    //   exercises; deduplication happens inside V0 via usedExerciseIds (empty).
    const pool = [];
    for (const ex of completeExercises) {
      if (!isLocationCompatible(ex.trainingLocation ?? [], survey.trainingLocation)) continue;
      if (!isEquipmentCompatible(ex.equipment ?? [], survey.equipment)) continue;

      const { score, matchReasons, warnReasons } = scoreExercise(ex, survey);

      pool.push({
        id: ex.id,
        name: ex.name,
        mainMuscleGroup: ex.mainMuscleGroup ?? "",
        secondaryMuscleGroups: ex.secondaryMuscleGroups ?? [],
        equipment: ex.equipment ?? [],
        trainingLocation: ex.trainingLocation ?? [],
        score,
        matchReasons,
        warnReasons,
        isAvoided: avoidedExerciseIds.has(ex.id),
        exerciseType: ex.exerciseType ?? null,
        neurologicalFatigue: ex.neurologicalFatigue ?? null,
        learningDifficulty: ex.learningDifficulty ?? null,
        exercisePriority: ex.exercisePriority ?? null,
        movementPattern: ex.movementPattern ?? null,
        movementCategoryKey: normalizeMovementCategory(
          ex.movementPattern ?? null,
          ex.movementCategory ?? null,
        ),
        subTargetBiases: (ex.subTargetBiases as SubTargetBiases | null) ?? null,
        suitableForNoActivity: ex.suitableForNoActivity ?? null,
      });
    }

    // Sort by score desc, then name asc (deterministic, same as recommendations route).
    pool.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pl"));

    // ── Priority context — experience-aware muscle tier assignment ─────────────
    //
    // Builds the V0PriorityContext from survey fields.  Only intermediate and
    // advanced clients get true priority-muscle slot influence (Tier A / B / C).
    // Beginners and inactive clients fall back to balanced general-development
    // sorting (isPriorityEligible = false → sortDeterministic inside V0).
    const isPriorityEligible =
      !!survey.experienceLevel &&
      PRIORITY_ELIGIBLE_EXPERIENCE_LEVELS.has(survey.experienceLevel);

    // ── Bench-goal detection ───────────────────────────────────────────────────
    //
    // Activates barbell-preference sort (step 2.5 in sortWithPriority) when the
    // client's goal is explicitly bench-oriented AND barbell equipment is available.
    const BENCH_GOAL_KEYWORDS = [
      "klatę", "klatą", "bench", "wyciskanie", "wycisk", "ławka",
    ];
    const isBenchGoal =
      survey.trainingGoal
        ? BENCH_GOAL_KEYWORDS.some((kw) =>
            survey.trainingGoal!.toLowerCase().includes(kw),
          )
        : false;
    const hasBarbell = survey.equipment
      ? survey.equipment.toLowerCase().includes("sztanga")
      : false;

    // ── Plyometric permission ──────────────────────────────────────────────────
    //
    // Plyometric / explosive exercises are restricted to clients whose goal is
    // explicitly power / sport performance, or who have athlete status.
    // For all other goals (hypertrophy, fat loss, general health, beginner),
    // ctx.allowPlyometrics = false and the engine's Step 1 filter removes them.
    // The plyo session type always permits plyometrics regardless of this flag.
    const POWER_GOAL_KEYWORDS = [
      "moc", "power", "sport", "atletyczn", "wybuchow",
      "szybko", "skoczno", "zawodnik", "wydajno",
    ];
    const isPowerGoal = survey.trainingGoal
      ? POWER_GOAL_KEYWORDS.some((kw) =>
          survey.trainingGoal!.toLowerCase().includes(kw),
        )
      : false;
    const isAthleteClient =
      !!survey.athleteStatus && survey.athleteStatus !== "Nie";
    const allowPlyometrics = isPowerGoal || isAthleteClient || v0SessionType === "plyo";

    // ── Preferred exercise keywords ────────────────────────────────────────────
    //
    // Parse survey.favoriteExercises (free text, comma/semicolon/newline separated)
    // into lowercase keywords.  The engine boosts matching exercises to the front
    // of each slot's candidate band — they still must pass the slot's hard filter.
    const preferredExerciseKeywords: string[] = survey.favoriteExercises
      ? survey.favoriteExercises
          .split(/[,;\n]+/)
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.length >= 3)
      : [];

    // ── Goal profile ───────────────────────────────────────────────────────────
    //
    // Maps survey.trainingGoal to a structured profile that drives:
    //   - regression penalty (intermediate+ users no longer default to beginner moves)
    //   - isolation de-ranking in mixed slots (for strength/conditioning goals)
    //   - extra arm/shoulder slots in upper sessions (for hypertrophy/fat-loss goals)
    //   - conditioning component marker (fat-loss / kondycja goals signal cardio layer)
    const goalProfile = buildGoalProfile(
      survey.trainingGoal,
      survey.sportPerformanceNeeds ?? [],
      survey.athleteStatus,
    );

    // "Brak aktywności fizycznej" is treated as a distinct, more conservative level.
    // isPriorityEligible is always false for this level (handled by the set above),
    // but isNoActivityClient additionally signals the sort to actively prefer
    // suitableForNoActivity exercises within each slot's band.
    const isNoActivityClient = survey.experienceLevel === "Brak aktywności fizycznej";
    // "Początkujący" is a distinct, separate level from "Brak aktywności fizycznej".
    // It allows more basic compound lifting but still prefers simpler exercises over
    // complex isolation-heavy choices — the engine's isBeginnerClient sort step handles this.
    const isBeginnerClient = survey.experienceLevel === "Początkujący";

    // ── Push-up contextual deprioritisation (Stage G — Part 2) ────────────────
    //
    // In full-gym intermediate+ contexts, "Pompki" should not win the chest-compound
    // slot by default when barbell and dumbbell presses are available.
    //
    // Fires when ALL of:
    //   1. Full gym available — "Sztanga i talerze" (or "Maszyny") in equipment
    //   2. Client is intermediate or advanced (isPriorityEligible)
    //   3. Goal bias is strength, athletic, or hypertrophy
    //   4. Client did NOT explicitly list push-ups in preferred exercises
    //
    // Push-ups are NOT banned — they remain in the pool as a fallback.
    const isFullGym =
      !!(survey.equipment) &&
      (survey.equipment.toLowerCase().includes("sztanga i talerze") ||
        survey.equipment.toLowerCase().includes("maszyny") ||
        (survey.equipment.toLowerCase().includes("sztanga") &&
          survey.equipment.toLowerCase().includes("maszynami")));
    const prefersPushUps = preferredExerciseKeywords.some((kw) =>
      "pompki".includes(kw) || kw.includes("pompk"),
    );
    const isDeprioritizableBias =
      goalProfile.exerciseClassBias === "strength" ||
      goalProfile.exerciseClassBias === "athletic" ||
      goalProfile.exerciseClassBias === "hypertrophy";
    const deprioritizePushUps =
      isFullGym && isPriorityEligible && isDeprioritizableBias && !prefersPushUps;

    const priorityContext: V0PriorityContext = {
      isPriorityEligible,
      isNoActivityClient,
      isBeginnerClient,
      tierA: survey.priorityMuscle1 ? [survey.priorityMuscle1] : [],
      tierB: [survey.priorityMuscle2, survey.priorityMuscle3].filter(
        (v): v is string => v !== null && v !== undefined && v.trim() !== "",
      ),
      benchGoalActive: isPriorityEligible && isBenchGoal && hasBarbell,
      allowPlyometrics,
      preferredExerciseKeywords,
      deprioritizePushUps,
      goalProfile,
    };

    // ── Session start — seed cross-session memory if provided ─────────────────
    //
    // When weekUsedExerciseIds is supplied, pre-mark those exercise IDs as
    // already used so V0 excludes them from all slots.  This prevents the same
    // exercises appearing in multiple sessions of a generated week.
    //
    // When omitted (single-session call), behaviour is identical to before:
    // the set starts empty and V0 fills every slot from scratch.
    const weekIds = body.data.weekUsedExerciseIds ?? [];
    const usedExerciseIds = new Set<string>(weekIds.map(String));

    const sessionMode = weekIds.length > 0
      ? `week-aware (${weekIds.length} pre-excluded)`
      : "empty";
    console.log(`SESSION_START: ${sessionMode}`);
    console.log(`DAY_TYPE: ${v0SessionType}`);
    console.log(
      `USED_EXERCISE_IDS: [${weekIds.length > 0 ? weekIds.join(", ") : ""}]`,
    );

    // ── Run V0 slot-based generator ────────────────────────────────────────────
    const alternativeIndex = body.data.alternativeIndex ?? 0;
    const v0Result = runExerciseSelectionEngineV0(
      pool,
      v0SessionType as V0SessionType,
      usedExerciseIds,
      priorityContext,
      { alternativeIndex },
    );

    if (!v0Result.valid) {
      res.status(422).json({
        error: v0Result.error,
        hasProfile: true,
        hasLocationData,
        sessionType: v0SessionType,
        exercises: [],
      });
      return;
    }

    console.log(
      `SESSION_COMPLETE: ${v0Result.exercises.length} exercises selected for ${v0SessionType.toUpperCase()}`,
    );

    // ── Explanation block (Stage G — Part 4) ─────────────────────────────────
    //
    // Compact, trainer-facing explanation of what was selected, what was blocked,
    // and why.  Returned alongside exercises so trainers can hand a reasoned
    // plan to clients.  All strings are in Polish.

    // 1. Plan rationale — context bullets
    const explanationRationale: string[] = [];
    explanationRationale.push(
      `Poziom zaawansowania: ${survey.experienceLevel ?? "nieznany"}.`,
    );
    explanationRationale.push(
      `Cel treningowy: ${survey.trainingGoal ?? "ogólny"}.`,
    );
    explanationRationale.push(`Typ sesji: ${v0SessionType.toUpperCase()}.`);
    if (isPriorityEligible &&
      (priorityContext.tierA.length > 0 || priorityContext.tierB.length > 0)) {
      const allPriorities = [...priorityContext.tierA, ...priorityContext.tierB];
      explanationRationale.push(`Priorytety mięśniowe: ${allPriorities.join(", ")}.`);
    }
    if (goalProfile.isCompetitiveAthlete) {
      explanationRationale.push(
        "Profil sportowca zawodowego — ćwiczenia o wysokim obciążeniu neurologicznym mają pierwszeństwo.",
      );
    }

    // 2. Preferred exercise outcomes — keyword → used / not_used
    const preferredOutcomes = preferredExerciseKeywords.map((kw) => {
      const matched = v0Result.exercises.find((e) =>
        e.name.trim().toLowerCase().includes(kw),
      );
      return {
        keyword: kw,
        status: matched ? ("used" as const) : ("not_used" as const),
        note: matched
          ? `Użyte: "${matched.name}"`
          : "Brak pasującego ćwiczenia lub nie przeszło filtra slotu w tej sesji.",
      };
    });

    // 3. Excluded exercise outcomes — exact-only vs whole-family blocks
    const excludedOutcomes: Array<{
      name: string;
      scope: "exact" | "family";
      label?: string;
      reason: string;
    }> = [
      ...blockedFamilies.map((bf) => ({
        name: bf.avoidedName,
        scope: "family" as const,
        label: bf.label,
        reason: `Zablokowano całą rodzinę ruchową: ${bf.label}.`,
      })),
      ...exactOnlyBlocks.map((name) => ({
        name,
        scope: "exact" as const,
        reason: "Zablokowano dokładnie to ćwiczenie (bez rozszerzenia na rodzinę).",
      })),
    ];

    // 4. Generator notes — contextual decisions surfaced for the trainer
    const generatorNotes: string[] = [];
    if (deprioritizePushUps) {
      generatorNotes.push(
        "Pompki: zepchnięte za wyciskanie sztangą/hantlami — dostępny pełen sprzęt, " +
        "poziom i cel nie preferują ćwiczeń z masą ciała jako domyślnego wyboru. " +
        "Pompki nadal dostępne jako awaryjny wybór gdy brak innych opcji w slocie.",
      );
    }
    if (goalProfile.deprioritizeIsolationInMixedSlots) {
      generatorNotes.push(
        "Izolacja: w mieszanych slotach zepchnięta za wielostawowe — cel siłowy/kondycyjny.",
      );
    }
    if (goalProfile.preferHighNeurologicalLoad && goalProfile.isCompetitiveAthlete) {
      generatorNotes.push(
        "Obciążenie neurologiczne: priorytet ćwiczeń ≥ 4 — sport zawodowy z Dynamika/Szybkość.",
      );
    }
    if (blockedFamilies.length > 0) {
      generatorNotes.push(
        `Rozszerzenie blokad: ${blockedFamilies.length} rodzina(y) ruchowych zablokowana(ych) ` +
        "na podstawie podanych unikanych ćwiczeń.",
      );
    }

    res.json({
      hasProfile: true,
      hasLocationData,
      sessionType: v0SessionType,
      exercises: v0Result.exercises,
      explanation: {
        rationale: explanationRationale,
        preferredExercises: preferredOutcomes,
        excludedExercises: excludedOutcomes,
        notes: generatorNotes,
      },
    });
  },
);

export default router;
