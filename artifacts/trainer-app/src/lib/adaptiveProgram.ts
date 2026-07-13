/**
 * Phase A — Adaptive Program: centralized read-only configuration
 *
 * "Program adaptacyjny 4–8 tygodni" for clients in the "Start adaptacyjny"
 * segment (experienceLevel = "Brak aktywności fizycznej").
 *
 * DO NOT wire into full plan generation until Phase B.
 * This object is a reference spec — trainers adapt it per client.
 */

// ─── Defaults object ─────────────────────────────────────────────────────────

export const ADAPTIVE_PROGRAM_DEFAULTS = {
  /**
   * Programme duration in weeks.
   * Min 4 weeks (minimum for any meaningful adaptation).
   * Max 8 weeks (beyond which client should be progressed or reassessed).
   * Default 4 — start conservative; extend based on progress.
   */
  durationWeeks: { min: 4, max: 8, default: 4 },

  /**
   * Training days per week.
   * 2 sessions is the adaptive entry point — enough stimulus, plenty of recovery.
   * 3 sessions only after the client demonstrates consistent attendance and recovery.
   */
  trainingDays: { allowed: [2, 3] as const, default: 2 },

  /**
   * Preferred training split.
   * Full-body A/B alternation — exposes every pattern every session,
   * maximises technical practice frequency, simplest for beginners to follow.
   */
  preferredSplit: "full_body_ab" as const,

  /**
   * Exercises per session.
   * 5 minimum — enough to cover major patterns.
   * 7 maximum — keeps sessions to ~45 min and avoids cognitive overload.
   */
  exercisesPerSession: { min: 5, max: 7 },

  /**
   * Working sets per exercise — whole integers only.
   * Early phase (weeks 1–3): 2 sets — establish the movement pattern first.
   * Later phase (weeks 4+): 2–3 sets — add one set only when technique is solid.
   */
  workingSets: {
    minimum: 2,
    earlyPhase: 2,
    laterPhase: { min: 2, max: 3 },
  },

  /**
   * Recommended Reps in Reserve (RIR) target.
   * 3–4 RIR: leaves significant margin from failure.
   * Keeps technique clean, reduces injury risk, and teaches effort self-regulation.
   */
  recommendedRIR: { min: 3, max: 4 },

  /**
   * Training to muscular failure is contraindicated in the adaptive phase.
   * Clients have not yet developed the motor patterns or recovery capacity.
   */
  failureTraining: false,

  /**
   * Progression order — unlock the next stage only when the current one is stable.
   *
   * 1. technique    — master the movement pattern first; no progression until form is consistent.
   * 2. repetitions  — increase reps within the target range (e.g. 8 → 12) before adding load.
   * 3. load         — increase weight only after reps are controlled at the top of the rep range.
   */
  progressionOrder: ["technique", "repetitions", "load"] as const,
} as const;

export type AdaptiveProgramDefaults = typeof ADAPTIVE_PROGRAM_DEFAULTS;

// ─── Future-ready completion criteria (Phase B) ───────────────────────────────

/**
 * Criteria for a trainer to consider when evaluating whether a client is ready
 * to transition from "Brak aktywności fizycznej" → "Początkujący".
 *
 * IMPORTANT: This transition requires EXPLICIT TRAINER APPROVAL.
 * It must NEVER be automated.
 *
 * All six criteria below should be assessed holistically.  A single concern
 * (e.g. one missed session) should not block progression if the overall
 * picture is positive.
 */
export const ADAPTIVE_COMPLETION_CRITERIA = [
  /**
   * attendanceConsistency — Client shows up reliably across the programme.
   * Rough guide: ≥ 80 % of planned sessions completed over the last 3 weeks.
   */
  "attendanceConsistency",

  /**
   * movementControl — Acceptable technique on all programme exercises.
   * Trainer judges: form is safe and consistent; minor cues still needed but
   * no fundamental breakdowns under light load.
   */
  "movementControl",

  /**
   * volumeTolerance — Current volume is well tolerated.
   * Signs: no excessive next-day fatigue, DOMS resolves within ~48 h,
   * no session-to-session performance decline.
   */
  "volumeTolerance",

  /**
   * noPainWorsening — No new or worsening pain/injury signals.
   * Any new joint pain, sharp sensation, or worsening of a pre-existing
   * complaint must be investigated before progressing.
   */
  "noPainWorsening",

  /**
   * effortControlAwareness — Client understands and can self-regulate effort.
   * They can stop a set 3–4 reps before failure when asked, and describe
   * their perceived exertion in meaningful terms.
   */
  "effortControlAwareness",

  /**
   * adequateRecovery — Client recovers adequately between sessions.
   * Proxy: client reports good energy on training days, soreness from the
   * previous session is largely resolved before the next session begins.
   */
  "adequateRecovery",
] as const;

export type AdaptiveCompletionCriterion =
  (typeof ADAPTIVE_COMPLETION_CRITERIA)[number];
