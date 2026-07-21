/**
 * DailyAllocationEngine — Stage 1
 *
 * Allocates ALL muscle targets simultaneously across training days while
 * respecting per-session capacity constraints.
 *
 * ── Design goals ────────────────────────────────────────────────────────────
 *   • Sees the entire week at once (vs. per-target distribution in the current
 *     system which ignores that session capacity is shared).
 *   • Never exceeds sessionMax on any day (hard constraint).
 *   • Tracks every unit of volume: weeklyAllocated + weeklyUnresolved = weeklyTargets.
 *   • Reports feasibility so callers know when volume cannot be fully placed.
 *
 * ── What Stage 1 does NOT do ────────────────────────────────────────────────
 *   • Session duration estimation / indirect volume modelling.
 *   • Exercise-level logic, priority-exercise rules, ordering.
 *   • Redistribution heuristics beyond a single greedy pass.
 *   • Scoring systems.
 *
 * ── Integration ─────────────────────────────────────────────────────────────
 *   The existing distributeTargetVolume() in planDraftVolumeDistributionService.ts
 *   is NOT removed or replaced yet.  This engine lives as a separate module
 *   and may be wired in via an adapter once Stage 2 is validated.
 */

// ─── Input / Output contracts ────────────────────────────────────────────────

/**
 * One training day in the allocation week.
 */
export interface AllocationDay {
  dayIndex: number;
  /** e.g. "push" | "pull" | "legs" | "upper" | "lower" | "full_body" | "custom" */
  dayType: string;
}

/**
 * Input to the DailyAllocationEngine.
 *
 * `eligibleDayTypes` maps each targetId to the set of dayType strings on which
 * that target may be trained.  When a targetId has no entry (or the map is
 * omitted entirely) every day is eligible for that target — this is the
 * "full body / unknown" fallback.
 *
 * `priorities` is accepted for forward-compatibility with Stage 2 but is
 * intentionally ignored in Stage 1.
 */
export interface DailyAllocationInput {
  days: AllocationDay[];

  /** targetId (string) → weekly volume to place */
  weeklyTargets: Record<string, number>;

  /**
   * targetId → array of dayType strings that are eligible for that target.
   * Absent entry or omitted map → all days are eligible.
   */
  eligibleDayTypes?: Record<string, string[]>;

  /** Reserved for Stage 2 — ignored in Stage 1. */
  priorities?: Record<string, number>;

  constraints: {
    /** Hard maximum total volume per session. Never exceeded. */
    sessionMax: number;
    /** Soft minimum per target per session; informational only in Stage 1. */
    sessionMin: number;
  };
}

/**
 * Per-day slice of the allocation result.
 */
export interface AllocationDayResult {
  dayIndex: number;
  dayType: string;
  /** targetId → volume allocated on this day */
  allocations: Record<string, number>;
  /** Sum of all allocations on this day */
  total: number;
}

/**
 * Output of the DailyAllocationEngine.
 *
 * Conservation invariant (always holds):
 *   weeklyAllocated[t] + weeklyUnresolved[t] === weeklyTargets[t]  for every t
 */
export interface DailyAllocationResult {
  days: AllocationDayResult[];

  /** targetId → total volume successfully placed across the week */
  weeklyAllocated: Record<string, number>;

  /**
   * targetId → volume that could NOT be placed.
   * Causes: no eligible days for the target, OR all eligible days at capacity.
   * Zero entries are still present so callers can iterate all targets uniformly.
   */
  weeklyUnresolved: Record<string, number>;

  /**
   * "feasible"               — all volume placed, no day near sessionMax ceiling
   * "feasible_with_tradeoffs" — some volume unresolved (capacity) or days near max
   * "infeasible"             — at least one target has no eligible days at all,
   *                            making its volume permanently unplaceable
   */
  status: "feasible" | "feasible_with_tradeoffs" | "infeasible";
}

// ─── Allocation algorithm ────────────────────────────────────────────────────

/**
 * A day that is eligible for a given target, augmented with its current
 * running total so the greedy pass can respect sessionMax.
 */
interface EligibleSlot {
  dayIndex: number;
  /** Current total (updated in-place during allocation). */
  runningTotal: number;
}

/**
 * Greedy single-pass distributor for one target across its eligible days.
 *
 * Strategy:
 *   1. Sort eligible days by ascending running total so the least-loaded day
 *      receives volume first (natural load-balancing).
 *   2. Walk through days in that order.  For each day compute:
 *        ideal  = ceil(remaining / daysLeftInPass)
 *        alloc  = min(ideal, availableCapacity)
 *      then deduct alloc from `remaining`.
 *   3. Whatever is left in `remaining` after the full pass is unresolved.
 *
 * Using ceil() ensures we front-load: earlier (less-loaded) days take slightly
 * more, reducing fragmentation.  The last day corrects any overshoot naturally
 * because `remaining` tracks exactly what is still to place.
 *
 * Returns { placed, unresolved } where placed + unresolved = volume (integer).
 */
function distributeToSlots(
  volume: number,
  slots: EligibleSlot[],
  sessionMax: number,
  dayAllocations: Map<number, Record<string, number>>,
  targetId: string,
): { placed: number; unresolved: number } {
  // Work in whole integers throughout to avoid floating-point accumulation.
  let remaining = Math.round(volume);

  // Sort: least loaded first; tiebreak by dayIndex for determinism.
  const sorted = [...slots].sort(
    (a, b) => a.runningTotal - b.runningTotal || a.dayIndex - b.dayIndex,
  );

  for (let i = 0; i < sorted.length; i++) {
    if (remaining <= 0) break;

    const slot = sorted[i]!;
    const capacity = sessionMax - slot.runningTotal;
    if (capacity <= 0) continue;

    const daysLeft = sorted.length - i;
    const ideal = Math.ceil(remaining / daysLeft);
    const alloc = Math.min(ideal, capacity);

    if (alloc <= 0) continue;

    // Commit allocation
    const record = dayAllocations.get(slot.dayIndex)!;
    record[targetId] = (record[targetId] ?? 0) + alloc;

    // Update running total on the slot (shared reference via `slots` array)
    slot.runningTotal += alloc;

    remaining -= alloc;
  }

  const placed = Math.round(volume) - remaining;
  return { placed, unresolved: remaining };
}

// ─── Main engine function ────────────────────────────────────────────────────

/**
 * Allocates all targets simultaneously across the supplied days.
 *
 * The function is pure (no side effects, no DB access) and deterministic for
 * a given input.
 */
export function allocateDaily(input: DailyAllocationInput): DailyAllocationResult {
  const { days, weeklyTargets, constraints } = input;
  const { sessionMax } = constraints;

  // ── Initialise per-day state ─────────────────────────────────────────────

  /** dayIndex → { targetId: volume } */
  const dayAllocations = new Map<number, Record<string, number>>();
  /** dayIndex → current session total (shared with EligibleSlot.runningTotal) */
  const dayTotals = new Map<number, number>();

  for (const day of days) {
    dayAllocations.set(day.dayIndex, {});
    dayTotals.set(day.dayIndex, 0);
  }

  // ── Build one reusable EligibleSlot per day (running total mutated in-place)
  //    so all target passes share a single view of session load.
  const allSlots: EligibleSlot[] = days.map((day) => {
    const slot: EligibleSlot = {
      dayIndex: day.dayIndex,
      // This object IS the shared state — dayTotals is kept in sync below.
      runningTotal: 0,
    };
    return slot;
  });

  // Quick lookup: dayIndex → slot (for total sync after each allocation)
  const slotByIndex = new Map<number, EligibleSlot>(
    allSlots.map((s) => [s.dayIndex, s]),
  );

  // ── Allocate each target ────────────────────────────────────────────────

  const weeklyAllocated: Record<string, number> = {};
  const weeklyUnresolved: Record<string, number> = {};
  let hasNoEligibleDayTarget = false;

  for (const [targetId, rawVolume] of Object.entries(weeklyTargets)) {
    const volume = Math.round(rawVolume);

    if (volume === 0) {
      weeklyAllocated[targetId] = 0;
      weeklyUnresolved[targetId] = 0;
      continue;
    }

    // Determine eligible days for this target.
    const allowedTypes = input.eligibleDayTypes?.[targetId];
    const eligibleDays = allowedTypes
      ? days.filter((d) => allowedTypes.includes(d.dayType))
      : days;

    if (eligibleDays.length === 0) {
      // Truly unplaceable — no eligible days exist.
      weeklyAllocated[targetId] = 0;
      weeklyUnresolved[targetId] = volume;
      hasNoEligibleDayTarget = true;
      continue;
    }

    // Gather the shared EligibleSlot objects for eligible days.
    const eligibleSlots: EligibleSlot[] = eligibleDays.map(
      (d) => slotByIndex.get(d.dayIndex)!,
    );

    const { placed, unresolved } = distributeToSlots(
      volume,
      eligibleSlots,
      sessionMax,
      dayAllocations,
      targetId,
    );

    weeklyAllocated[targetId] = placed;
    weeklyUnresolved[targetId] = unresolved;

    // Sync dayTotals from slot running totals.
    for (const slot of eligibleSlots) {
      dayTotals.set(slot.dayIndex, slot.runningTotal);
    }
  }

  // ── Build result days ───────────────────────────────────────────────────

  const resultDays: AllocationDayResult[] = days.map((day) => ({
    dayIndex: day.dayIndex,
    dayType: day.dayType,
    allocations: dayAllocations.get(day.dayIndex) ?? {},
    total: dayTotals.get(day.dayIndex) ?? 0,
  }));

  // ── Feasibility status ─────────────────────────────────────────────────

  const totalUnresolved = Object.values(weeklyUnresolved).reduce(
    (sum, v) => sum + v,
    0,
  );

  // "Near max" threshold: a day carrying ≥ 90 % of sessionMax is considered
  // at-risk and warrants a tradeoff flag even if all volume was placed.
  const nearMaxThreshold = sessionMax * 0.9;
  const anyDayNearMax = resultDays.some((d) => d.total >= nearMaxThreshold);

  let status: DailyAllocationResult["status"];
  if (hasNoEligibleDayTarget) {
    // At least one target has zero eligible days — permanently infeasible.
    status = "infeasible";
  } else if (totalUnresolved > 0 || anyDayNearMax) {
    status = "feasible_with_tradeoffs";
  } else {
    status = "feasible";
  }

  return {
    days: resultDays,
    weeklyAllocated,
    weeklyUnresolved,
    status,
  };
}
