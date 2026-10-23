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

import { withEffectiveLevel } from "../lib/effectiveLevel";
import { Router, type IRouter } from "express";
import { eq, sql, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  clientsTable,
  surveysTable,
  exercisesTable,
  clientExerciseUsageLogTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";
import { scoreExercise } from "../lib/recommendation-engine";
import { computeCompleteness, fetchMuscleStats } from "../lib/exercise-completeness";
import {
  buildCompatibilityFilter,
  type SubTargetBiases,
} from "../services/planDraftDayRecommendationsService";
import { normalizeMovementCategory } from "../services/planAnalyzer";
import {
  runExerciseSelectionEngineV0,
  type V0SessionType,
  type V0PriorityContext,
} from "../services/ExerciseSelectionEngineV0";
import { buildGoalProfile } from "../services/goalProfileService";
import {
  deriveExerciseClassForOutput,
  sessionOrderRank,
  prescribeExercise,
} from "../services/exercisePrescriptionService.js";
import { PRIORITY_ELIGIBLE_EXPERIENCE_LEVELS } from "@workspace/api-zod";
import { mainPlanRoleCondition } from "../lib/exerciseRoles";
import { requireAuth } from "../middlewares/requireAuth";
import {
  authorizeGeneratedDay,
  hashGenerationRequest,
  isGenerationSessionError,
  isSubscriptionLimitError,
  recordGeneratedDayOutput,
} from "../services/subscriptionService";

const router: IRouter = Router();

const ParamsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

const BodySchema = z.object({
  generationId: z.string().uuid(),
  generationDayIndex: z.number().int().min(0).max(6),
  expectedDayCount: z.number().int().min(1).max(7),
  /**
   * V0 session type — determines which slot template to apply.
   * "push" | "pull" | "legs" | "upper" | "lower"
   */
  v0SessionType: z.enum(["push", "pull", "legs", "upper", "lower", "plyo", "full_body"]),
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
  /**
   * Muscle group names (mainMuscleGroup level, e.g. "Plecy", "Barki") that are
   * severely under-covered — below 50 % of their proposed weekly volume.
   *
   * When provided, the selection engine boosts exercises that target these muscles
   * in optional accessory slots, preferring gap-fixing exercises over filler.
   * Use norm()-comparable strings; the engine lowercases them internally.
   *
   * Omit or pass an empty array to disable the boost (default behaviour).
   */
  undercoveredMuscleGroups: z.array(z.string()).optional().default([]),
  /**
   * BALANCE PASS — Cross-session weekly volume context (FULL_BODY only).
   *
   * Raw exercises from all previously generated days in the same week.
   * Each entry carries the exercise DB id and the number of working sets
   * that were prescribed for that exercise in the earlier session.
   *
   * The generate-day route uses this list to compute accumulated effective
   * sets per volume target (by loading exercise-muscle coefficients from the
   * DB) and then runs a post-prescription balance pass that reduces sets for
   * exercises whose target would otherwise exceed the weekly absolute ceiling.
   *
   * Reduction priority (cheapest first):
   *   0 — non-priority isolation / core
   *   1 — non-priority compound
   *   2 — priority isolation
   *   3 — priority compound   (last resort)
   *
   * Omit or pass an empty array to skip the weekly context (Day 1 or
   * non-full_body sessions).  Balance pass is a no-op when omitted.
   */
  weekExercisesRaw: z.array(
    z.object({
      exerciseId: z.number().int().positive(),
      sets: z.number().int().min(1),
    }),
  ).optional().default([]),
});

router.post(
  "/clients/:clientId/plan-draft/generate-day",
  requireAuth,
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
          "v0SessionType is required: push | pull | legs | upper | lower | plyo | full_body",
      });
      return;
    }

    const { clientId } = params.data;
    const { v0SessionType } = body.data;

    // ── Verify client belongs to the authenticated trainer ────────────────────
    const [client] = await db
      .select({ id: clientsTable.id, adaptiveStartDecision: clientsTable.adaptiveStartDecision, experienceLevelOverride: clientsTable.experienceLevelOverride })
      .from(clientsTable)
      .where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));

    if (!client) {
      res.status(404).json({ error: "Klient nie znaleziony" });
      return;
    }

    // ── Fetch latest survey ────────────────────────────────────────────────────
    const [rawSurvey] = await db
      .select()
      .from(surveysTable)
      .where(eq(surveysTable.clientId, clientId))
      .orderBy(desc(surveysTable.createdAt))
      .limit(1);
    // The generator works on the effective level (2-year rule, trainer override).
    const survey = rawSurvey ? withEffectiveLevel(rawSurvey, client.experienceLevelOverride) : undefined;

    if (!survey) {
      res.json({ hasProfile: false, hasLocationData: false, exercises: [] });
      return;
    }

    // Reserve/validate the monthly generation session before running the
    // selection engine. A failed attempt can be retried with the exact same
    // day payload, but cannot be changed into another plan under the same ID.
    try {
      await authorizeGeneratedDay({
        trainerId: req.trainer!.id,
        clientId,
        generationId: body.data.generationId,
        expectedDayCount: body.data.expectedDayCount,
        dayIndex: body.data.generationDayIndex,
        requestHash: hashGenerationRequest(body.data),
      });
    } catch (error) {
      if (isSubscriptionLimitError(error)) {
        res.status(409).json(error.toResponse());
        return;
      }
      if (isGenerationSessionError(error)) {
        res.status(409).json(error.toResponse());
        return;
      }
      throw error;
    }

    const hasLocationData =
      !!(survey.trainingLocation?.trim()) && !!(survey.equipment?.trim());
    const hasEquipmentData = !!(survey.equipment?.trim());

    // adaptiveStartMode: trainer has explicitly accepted the adaptive-start
    // recommendation for this client (stored as adaptiveStartDecision === "adaptive").
    const adaptiveStartMode = client.adaptiveStartDecision === "accepted";

    const avoidedExerciseIds = new Set<number>(survey.avoidedExerciseIds ?? []);

    // ── Fetch all active exercises ─────────────────────────────────────────────
    const exercises = await db
      .select()
      .from(exercisesTable)
      .where(and(eq(exercisesTable.isActive, true), mainPlanRoleCondition()))
      .orderBy(exercisesTable.name);

    // ── Filter to complete exercises ───────────────────────────────────────────
    const statsMap = await fetchMuscleStats(exercises.map((e) => e.id));
    const completeExercises = exercises.filter((ex) => {
      const stats = statsMap.get(ex.id);
      const { isComplete } = computeCompleteness(ex, stats);
      return isComplete;
    });

    // Build the generator pool through the same canonical hard filter used by
    // day recommendations. The generate-day route starts from an empty session,
    // so the already-added set is intentionally empty. Every V0 path below
    // (slots, fallbacks, thin-pool retry, safe reuse and beginner balancing)
    // receives only this compatible subset.
    const compatibilityFilter = buildCompatibilityFilter(
      survey.trainingLocation,
      survey.equipment,
      new Set<number>(),
    );
    const compatibleExercises = completeExercises.filter((ex) =>
      compatibilityFilter({
        id: ex.id,
        trainingLocation: ex.trainingLocation ?? [],
        equipment: ex.equipment ?? [],
        requiredEquipmentAll: ex.requiredEquipmentAll ?? [],
      }),
    );

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

    const BEGINNER_EXPERIENCE_LEVELS_FOR_ADAPTIVE = new Set([
      "Brak aktywności fizycznej",
      "Początkujący",
    ]);
    const pool = [];
    for (const ex of compatibleExercises) {
      const { score, matchReasons, warnReasons } = scoreExercise(
        ex,
        survey,
        adaptiveStartMode ? { useAdaptiveStart: true } : undefined,
      );

      pool.push({
        id: ex.id,
        name: ex.name,
        mainMuscleGroup: ex.mainMuscleGroup ?? "",
        secondaryMuscleGroups: ex.secondaryMuscleGroups ?? [],
        equipment: ex.equipment ?? [],
        requiredEquipmentAll: ex.requiredEquipmentAll ?? [],
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
    //
    // adaptiveStartMode extends this behaviour to "Początkujący" clients when the
    // trainer has explicitly accepted the adaptive-start recommendation: the engine
    // treats them identically to an inactive client — preferring simple, stable,
    // suitableForNoActivity exercises and applying the stricter slot constraints.
    const isNoActivityClient =
      survey.experienceLevel === "Brak aktywności fizycznej" || adaptiveStartMode;
    // "Początkujący" is a distinct, separate level from "Brak aktywności fizycznej".
    // It allows more basic compound lifting but still prefers simpler exercises over
    // complex isolation-heavy choices — the engine's isBeginnerClient sort step handles this.
    const isBeginnerClient = survey.experienceLevel === "Początkujący";

    // ── Equipment flags ────────────────────────────────────────────────────────
    const surveyEquipLower = (survey.equipment ?? "").toLowerCase();
    // Full gym: barbell + weight plates + machines (original full-gym gate)
    const isFullGym =
      !!(survey.equipment) &&
      (surveyEquipLower.includes("sztanga i talerze") ||
        surveyEquipLower.includes("maszyny") ||
        (surveyEquipLower.includes("sztanga") &&
          surveyEquipLower.includes("maszynami")));
    // Loadable equipment: any equipment that enables progressive overload.
    // Includes dumbbell-only setups — used as a wider gate than isFullGym.
    const hasLoadableEquipment =
      surveyEquipLower.includes("hantle") ||
      surveyEquipLower.includes("sztanga") ||
      surveyEquipLower.includes("kettlebell");

    // ── Push-up contextual deprioritisation (Stage G — Part 2) ────────────────
    //
    // "Pompki" should not win the chest-compound slot by default when the client
    // has any loadable pressing option (dumbbells, barbell, kettlebell).
    //
    // Extended from the original full-gym-only gate to cover dumbbell-only clients:
    // an intermediate client with just a bench and dumbbells should see dumbbell
    // bench press before incline push-ups in every pressing slot.
    //
    // Fires when ALL of:
    //   1. Loadable equipment available (Hantle / Sztanga / Kettlebell — or full gym)
    //   2. Client is intermediate or advanced (isPriorityEligible)
    //   3. Goal bias is strength, athletic, or hypertrophy
    //   4. Client did NOT explicitly list push-ups in preferred exercises
    //
    // Push-ups are NOT banned — they remain as a fallback and may appear once
    // per session as an accessory or finisher (see capPushUpsAtOne).
    const prefersPushUps = preferredExerciseKeywords.some((kw) =>
      "pompki".includes(kw) || kw.includes("pompk"),
    );
    const isDeprioritizableBias =
      goalProfile.exerciseClassBias === "strength" ||
      goalProfile.exerciseClassBias === "athletic" ||
      goalProfile.exerciseClassBias === "hypertrophy";
    const deprioritizePushUps =
      (isFullGym || hasLoadableEquipment) &&
      isPriorityEligible &&
      isDeprioritizableBias &&
      !prefersPushUps;

    // ── Push-up session cap ────────────────────────────────────────────────────
    //
    // For intermediate+ clients with loadable equipment, at most one push-up
    // variant is allowed per session.  Prevents multiple "Pompki" exercises
    // (incline, flat, decline, close-grip) from dominating pressing slots when
    // dumbbell / barbell alternatives are available.
    //
    // The cap is applied inside runExerciseSelectionEngineV0 via the pick()
    // closure — once one Pompki is in the results, further Pompki picks are
    // excluded.  Push-ups remain selectable as a single accessory or finisher.
    const capPushUpsAtOne = hasLoadableEquipment && isPriorityEligible;

    // ── Load per-client exercise novelty history (§7) ──────────────────────────
    //
    // Two queries, both non-fatal — a failure silently disables novelty ranking
    // for this request without affecting the rest of generation.
    //
    //  1. Most recent 4 generation IDs → cooldown set (exercises to deprioritise)
    //  2. Per-exercise use count + last timestamp → N2-N4 sort keys
    let usageHistory:
      | Map<number, { totalGenerations: number; lastUsedAt: Date }>
      | undefined;
    let cooldownIds: Set<number> | undefined;

    try {
      // Query 1: last 4 complete generations for this client.
      const recentGensResult = await db.execute(sql`
        SELECT generation_id
        FROM client_exercise_usage_log
        WHERE client_id = ${clientId}
        GROUP BY generation_id
        ORDER BY MAX(generated_at) DESC
        LIMIT 4
      `);
      const recentGenIds = (
        recentGensResult.rows as Array<{ generation_id: string }>
      ).map((r) => r.generation_id);

      if (recentGenIds.length > 0) {
        // Query 1b: all exercise IDs that appeared in any of those 4 generations.
        const cooldownRows = await db
          .selectDistinct({ exerciseId: clientExerciseUsageLogTable.exerciseId })
          .from(clientExerciseUsageLogTable)
          .where(
            and(
              eq(clientExerciseUsageLogTable.clientId, clientId),
              inArray(clientExerciseUsageLogTable.generationId, recentGenIds),
            ),
          );
        cooldownIds = new Set(cooldownRows.map((r) => r.exerciseId));
      }

      // Query 2: total distinct-generation count and last-used timestamp per exercise.
      const usageResult = await db.execute(sql`
        SELECT
          exercise_id,
          COUNT(DISTINCT generation_id)::int AS total_generations,
          MAX(generated_at)                  AS last_used_at
        FROM client_exercise_usage_log
        WHERE client_id = ${clientId}
        GROUP BY exercise_id
      `);
      if (usageResult.rows.length > 0) {
        usageHistory = new Map(
          (
            usageResult.rows as Array<{
              exercise_id: number;
              total_generations: number;
              last_used_at: string | Date;
            }>
          ).map((r) => [
            r.exercise_id,
            {
              totalGenerations: r.total_generations,
              lastUsedAt:
                r.last_used_at instanceof Date
                  ? r.last_used_at
                  : new Date(r.last_used_at),
            },
          ]),
        );
      }
    } catch (err) {
      console.error(
        "NOVELTY_HISTORY_LOAD_ERROR: failed to load usage history —",
        err,
      );
      // Non-fatal: generation continues without novelty ranking.
    }

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
      capPushUpsAtOne,
      goalProfile,
      // Severely under-covered muscle groups — lower-cased for norm() comparison.
      // When non-empty the engine boosts gap-fixing exercises in optional slots.
      undercoveredMuscleGroups: (body.data.undercoveredMuscleGroups ?? []).map(
        (s) => s.trim().toLowerCase(),
      ),
      usageHistory,
      cooldownIds,
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
    // sameTypePreviousExercises drives band-level implement/angle diversity for
    // alt sessions (e.g. Upper B avoids barbell when Upper A already used it).
    // Pass it through to the engine so the diversity logic actually fires.
    const sameTypePrev = body.data.sameTypePreviousExercises ?? [];
    let v0Result = runExerciseSelectionEngineV0(
      pool,
      v0SessionType as V0SessionType,
      usedExerciseIds,
      priorityContext,
      { alternativeIndex, sameTypePreviousExercises: sameTypePrev },
    );

    // ── Thin-pool retry for alternative sessions ──────────────────────────────
    //
    // Problem: weekUsedExerciseIds accumulates ALL exercises from every prior
    // session in the generated week (upper + lower + full_body).  For equipment-
    // constrained clients (e.g. dumbbell-only), this cross-session exclusion
    // depletes the pool below MIN_EXERCISES for the second occurrence of a
    // session type — upper-body exercises used in a full_body day are blocked
    // from reappearing in the second upper day, even though the weekly training
    // structure makes that repetition acceptable.
    //
    // Fix: when the first attempt fails on an alternative session (altIdx > 0),
    // retry using only the same-type previous exercises as the exclusion set.
    // This restores pool depth by allowing exercises from other session types to
    // re-enter while still enforcing variety vs. the immediately preceding
    // same-type session.
    if (!v0Result.valid && alternativeIndex > 0 && weekIds.length > sameTypePrev.length) {
      const sameTypeOnlyIds = new Set<string>(sameTypePrev.map((e) => String(e.id)));
      console.log(
        `V0_RETRY_THIN_POOL: altIdx=${alternativeIndex} ` +
        `full-week excluded=${weekIds.length} same-type excluded=${sameTypeOnlyIds.size} — ` +
        `retrying with same-type-only exclusion`,
      );
      v0Result = runExerciseSelectionEngineV0(
        pool,
        v0SessionType as V0SessionType,
        sameTypeOnlyIds,
        priorityContext,
        { alternativeIndex, sameTypePreviousExercises: sameTypePrev },
      );
      if (v0Result.valid) {
        console.log(
          `V0_RETRY_THIN_POOL_SUCCESS: ${v0Result.exercises.length} exercises selected ` +
          `(cross-session dedup relaxed due to thin pool)`,
        );
      }
    }

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

    // ── Class-based prescription + coach-like session ordering (Stage H) ──────
    //
    // Every selected exercise is enriched with:
    //   exerciseClass  — plyometric_power | main_compound | secondary_compound |
    //                    isolation | core | regression_beginner
    //   prescription   — sets / repsLabel / restSeconds / prescriptionNote,
    //                    calibrated per class × goal bias so that:
    //                      • plyometric drills never look like 3×8-12 accessories
    //                      • main compounds get heavier prescription than isolation
    //                      • core always looks different from a biceps curl
    //                      • bodyweight moves in full-gym contexts are demoted from
    //                        main_compound to secondary_compound prescription
    //
    // Exercises are then stable-sorted by session position rank so the output
    // order is coach-like regardless of which slot the engine filled first:
    //   0  plyometric_power    — explosive primer before CNS fatigue
    //   1  main_compound       — structural anchor
    //   2  secondary_compound  — supportive / complementary lifts
    //   3  isolation / regression — direct / accessory work
    //   5  core                — trunk-control finisher
    const goalBias = goalProfile.exerciseClassBias;

    let enrichedExercises = v0Result.exercises
      .map((ex) => {
        const exerciseClass = deriveExerciseClassForOutput(ex);
        // Part 6: Pompki that survive into a full-gym plan receive secondary_compound
        // prescription rather than main_compound — they are fallbacks, not anchors.
        const isBodyweightInGym =
          deprioritizePushUps && ex.name.trim().toLowerCase().startsWith("pompki");
        const prescription = prescribeExercise(exerciseClass, goalBias, isBodyweightInGym);
        // restrictionLabel is already set on DayRecommendationExercise by the
        // V0 engine (Step 5) when the exercise was chosen for a confirmed
        // restriction with action = "regression".  Just spread it through.
        return { ...ex, exerciseClass, prescription, _rank: sessionOrderRank(exerciseClass) };
      })
      .sort((a, b) => a._rank - b._rank)
      .map(({ _rank, ...ex }) => ex);

    // ── Post-prescription balance pass (FULL_BODY only) ───────────────────────
    //
    // For FULL_BODY plans generated across multiple days, indirect volume from
    // compound exercises accumulates week-over-week. This pass ensures no volume
    // target exceeds its weekly absolute ceiling by reducing exercise set counts
    // in priority order:
    //
    //   0 — non-priority isolation / core          (reduce first)
    //   1 — non-priority compound
    //   2 — priority isolation
    //   3 — priority compound                      (last resort)
    //
    // Minimum allowed sets: 2 for main_compound; 1 for all other classes.
    // The pass loops until all targets are within ceiling or structural minimums
    // are hit throughout (residual overages from compound indirect volume are
    // logged but do not block the response).
    //
    // Caller (Step4Exercises.tsx) supplies weekExercisesRaw with the prescribed
    // {exerciseId, sets} for all exercises from prior days so the route can
    // compute the accumulated contribution before adding this day's work.

    if (v0SessionType === "full_body") {
      const weekRaw = body.data.weekExercisesRaw ?? [];

      try {
        // 1. Load weekly absolute ceilings for the client's experience level.
        const expLevel = survey.experienceLevel ?? "Początkujący";
        const guidelinesResult = await db.execute(sql`
          SELECT vg.volume_target_id::int   AS target_id,
                 vg.weekly_absolute_ceiling::numeric AS ceiling
          FROM volume_guidelines vg
          JOIN volume_targets vt ON vt.id = vg.volume_target_id
          WHERE vg.experience_level = ${expLevel}
            AND vt.is_active = true
        `);

        const ceilingMap = new Map<number, number>();
        for (const row of guidelinesResult.rows as Array<Record<string, unknown>>) {
          ceilingMap.set(Number(row.target_id), Number(row.ceiling));
        }

        if (ceilingMap.size > 0) {
          // 2. Collect all exercise IDs needed (current session + prior days).
          const currentExIds = enrichedExercises.map((e) => e.id);
          const prevExIds = weekRaw.map((w) => w.exerciseId);
          const allExIds = [...new Set([...currentExIds, ...prevExIds])];

          // 3. Load max coefficient per exercise-target pair.
          const coeffResult = await db.execute(sql`
            SELECT ema.exercise_id::int         AS exercise_id,
                   vtm.volume_target_id::int    AS target_id,
                   MAX(ema.coefficient)::numeric AS max_coeff
            FROM exercise_muscle_assignments ema
            JOIN volume_target_members vtm
              ON vtm.specific_muscle_id = ema.specific_muscle_id
            JOIN volume_targets vt ON vt.id = vtm.volume_target_id
            WHERE vt.is_active = true
              AND ema.exercise_id = ANY(
                    ARRAY[${sql.raw(allExIds.join(","))}]::int[]
                  )
            GROUP BY ema.exercise_id, vtm.volume_target_id
          `);

          // Build: exerciseId → Map<targetId, maxCoeff>
          const exCoeffMap = new Map<number, Map<number, number>>();
          for (const row of coeffResult.rows as Array<Record<string, unknown>>) {
            const exId = Number(row.exercise_id);
            const tId  = Number(row.target_id);
            const coef = Number(row.max_coeff);
            if (!exCoeffMap.has(exId)) exCoeffMap.set(exId, new Map());
            exCoeffMap.get(exId)!.set(tId, coef);
          }

          // 4. Compute accumulated effective sets from prior-day exercises.
          const accumulated = new Map<number, number>();
          for (const { exerciseId, sets } of weekRaw) {
            const coeffs = exCoeffMap.get(exerciseId);
            if (!coeffs) continue;
            for (const [tId, coef] of coeffs) {
              accumulated.set(tId, (accumulated.get(tId) ?? 0) + sets * coef);
            }
          }

          // 5. Mutable set-count array for the current session.
          const sessionSets = enrichedExercises.map(
            (e) => e.prescription?.sets ?? 3,
          );

          // Helper: compute this session's contribution to each target.
          const computeSessionTotals = (): Map<number, number> => {
            const totals = new Map<number, number>();
            for (let i = 0; i < enrichedExercises.length; i++) {
              const coeffs = exCoeffMap.get(enrichedExercises[i].id);
              if (!coeffs) continue;
              for (const [tId, coef] of coeffs) {
                totals.set(tId, (totals.get(tId) ?? 0) + sessionSets[i] * coef);
              }
            }
            return totals;
          };

          // Priority muscles for this client (lowercased for comparison).
          const priorityMuscles = new Set([
            ...(priorityContext.tierA ?? []).map((s) => s.toLowerCase()),
            ...(priorityContext.tierB ?? []).map((s) => s.toLowerCase()),
          ]);

          // Reduction tier: 0 = reduce first, 3 = reduce last.
          const getReductionTier = (ex: (typeof enrichedExercises)[0]): number => {
            const mm = (ex.mainMuscleGroup ?? "").toLowerCase();
            const isPriority =
              priorityMuscles.size > 0 &&
              [...priorityMuscles].some(
                (pm) => mm.includes(pm) || pm.includes(mm),
              );
            const isCompound =
              ex.exerciseClass === "main_compound" ||
              ex.exerciseClass === "secondary_compound";
            if (ex.exerciseClass === "core") return 0;      // core — reduce early
            if (!isPriority && !isCompound)   return 0;     // non-priority isolation
            if (!isPriority &&  isCompound)   return 1;     // non-priority compound
            if ( isPriority && !isCompound)   return 2;     // priority isolation
            return 3;                                         // priority compound — last
          };

          // Minimum allowed sets per class.
          const minSets = (ex: (typeof enrichedExercises)[0]): number =>
            ex.exerciseClass === "main_compound" ? 2 : 1;

          // Sort indices by reduction tier (ascending).
          const sortedIndices = enrichedExercises
            .map((ex, i) => ({ i, tier: getReductionTier(ex) }))
            .sort((a, b) => a.tier - b.tier)
            .map(({ i }) => i);

          // 6. Balance loop — reduce one set at a time until all targets within ceiling.
          const MAX_ITER = 80;
          for (let iter = 0; iter < MAX_ITER; iter++) {
            const sessionTotals = computeSessionTotals();

            // Find the target with the largest overage.
            let worstTargetId = -1;
            let worstDeficit  = 0;
            for (const [tId, ceiling] of ceilingMap) {
              const total = (accumulated.get(tId) ?? 0) + (sessionTotals.get(tId) ?? 0);
              const deficit = total - ceiling;
              if (deficit > worstDeficit) {
                worstDeficit  = deficit;
                worstTargetId = tId;
              }
            }

            if (worstDeficit <= 0) break; // All targets within ceiling.

            // Reduce the first exercise (lowest tier) that contributes to the worst target.
            let reduced = false;
            for (const idx of sortedIndices) {
              if (sessionSets[idx] <= minSets(enrichedExercises[idx])) continue;
              const contrib = exCoeffMap.get(enrichedExercises[idx].id)?.get(worstTargetId) ?? 0;
              if (contrib > 0) {
                sessionSets[idx]--;
                reduced = true;
                console.log(
                  `[BalancePass] "${enrichedExercises[idx].name}" ` +
                  `${sessionSets[idx] + 1}→${sessionSets[idx]} sets ` +
                  `(target=${worstTargetId} deficit=${worstDeficit.toFixed(2)})`,
                );
                break;
              }
            }

            if (!reduced) break; // Structural minimum reached — accept residual overage.
          }

          // 7. Apply balanced set counts to the prescription.
          enrichedExercises = enrichedExercises.map((ex, i) =>
            ex.prescription
              ? { ...ex, prescription: { ...ex.prescription, sets: sessionSets[i] } }
              : ex,
          );

          // Log any targets that remain above ceiling after the pass.
          const finalTotals = computeSessionTotals();
          for (const [tId, ceiling] of ceilingMap) {
            const total = (accumulated.get(tId) ?? 0) + (finalTotals.get(tId) ?? 0);
            if (total > ceiling) {
              console.log(
                `[BalancePass] Residual overage target ${tId}: ` +
                `${total.toFixed(1)} vs ceiling ${ceiling} ` +
                `(structural minimum — adjust guidelines or session count)`,
              );
            }
          }
        }
      } catch (err) {
        // Balance pass is best-effort — never block the response.
        console.error("[BalancePass] Non-fatal error:", err);
      }
    }

    // ── Ordering / prescription explanation notes ──────────────────────────────
    const hasPlyo      = enrichedExercises.some((e) => e.exerciseClass === "plyometric_power");
    const hasMainLift  = enrichedExercises.some((e) => e.exerciseClass === "main_compound");
    const hasAccessory = enrichedExercises.some(
      (e) => e.exerciseClass === "isolation" || e.exerciseClass === "regression_beginner",
    );
    const hasCore      = enrichedExercises.some((e) => e.exerciseClass === "core");

    if (hasPlyo) {
      generatorNotes.push(
        "Element eksplozywny ustawiono na początku sesji ze względu na cel sportowy / dynamikę.",
      );
    }
    if (hasMainLift && (hasAccessory || hasCore)) {
      generatorNotes.push(
        "Ćwiczenia główne otrzymały dłuższe przerwy niż akcesoria — zgodnie z hierarchią sesji.",
      );
    }
    if (hasCore) {
      generatorNotes.push("Core ustawiono na końcu jako wsparcie kontroli tułowia.");
    }

    // §6: Structural warnings (e.g. missing pull for bodyweight-only inactive clients).
    // Appended to generatorNotes so they appear in the explanation panel, and also
    // returned as a dedicated top-level field for the frontend to surface prominently.
    for (const w of v0Result.warnings ?? []) {
      generatorNotes.push(`⚠️ ${w}`);
    }

    // Equipment-data warning: if the client profile has no equipment list the
    // generator silently fell back to bodyweight-only.  Surface this so the
    // trainer knows the session may be incomplete.
    const equipmentWarnings: string[] = [];
    if (!hasEquipmentData) {
      const msg =
        "Brak informacji o dostępnym sprzęcie — generator użył wyłącznie ćwiczeń z masą własnego ciała.";
      equipmentWarnings.push(msg);
      generatorNotes.push(`⚠️ ${msg}`);
    }

    try {
      await recordGeneratedDayOutput({
        trainerId: req.trainer!.id,
        clientId,
        generationId: body.data.generationId,
        dayIndex: body.data.generationDayIndex,
        exerciseIds: enrichedExercises.map((exercise) => exercise.id),
      });
    } catch (error) {
      if (isGenerationSessionError(error)) {
        res.status(409).json(error.toResponse());
        return;
      }
      throw error;
    }

    res.json({
      hasProfile: true,
      hasLocationData,
      sessionType: v0SessionType,
      exercises: enrichedExercises,
      structuralWarnings: [...(v0Result.warnings ?? []), ...equipmentWarnings],
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
