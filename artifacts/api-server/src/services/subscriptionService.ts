import { createHash } from "node:crypto";
import {
  clientsTable,
  clientExerciseUsageLogTable,
  db,
  exercisesTable,
  trainerGenerationSessionDaysTable,
  trainerGenerationSessionsTable,
  trainerSubscriptionsTable,
} from "@workspace/db";
import { and, asc, count, eq, sql } from "drizzle-orm";

export type PlanCode = "FREE" | "PRO" | "UNLIMITED";
export type SubscriptionMetric = "clients" | "customExercises" | "planGenerations";

type SubscriptionTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type PlanDefinition = {
  code: PlanCode;
  name: string;
  monthlyPricePln: number | null;
  limits: Record<SubscriptionMetric, number | null>;
  benefits: string[];
};

export const SUBSCRIPTION_PLANS: Record<PlanCode, PlanDefinition> = {
  FREE: {
    code: "FREE",
    name: "Free",
    monthlyPricePln: null,
    limits: { clients: 3, customExercises: 10, planGenerations: 1 },
    benefits: [
      "Do 3 klientów",
      "1 automatyczny plan miesięcznie",
      "Do 10 własnych ćwiczeń",
      "Ręczne plany i edycja bez ograniczeń",
    ],
  },
  PRO: {
    code: "PRO",
    name: "Pro",
    monthlyPricePln: 14.99,
    limits: { clients: 15, customExercises: null, planGenerations: 5 },
    benefits: [
      "Do 15 klientów",
      "5 automatycznych planów miesięcznie",
      "Nielimitowane własne ćwiczenia",
    ],
  },
  UNLIMITED: {
    code: "UNLIMITED",
    name: "Unlimited",
    monthlyPricePln: 29.99,
    limits: { clients: null, customExercises: null, planGenerations: null },
    benefits: [
      "Nielimitowani klienci",
      "Nielimitowany generator planów",
      "Nielimitowane własne ćwiczenia",
    ],
  },
};

const METRIC_LABELS: Record<SubscriptionMetric, string> = {
  clients: "Klienci",
  customExercises: "Własne ćwiczenia",
  planGenerations: "Automatyczne plany",
};

const METRIC_LOCK_KEYS: Record<SubscriptionMetric, number> = {
  clients: 11,
  customExercises: 12,
  planGenerations: 13,
};

export class SubscriptionLimitError extends Error {
  readonly code = "SUBSCRIPTION_LIMIT_REACHED";

  constructor(
    readonly metric: SubscriptionMetric,
    readonly planCode: PlanCode,
    readonly used: number,
    readonly limit: number,
    readonly resetsAt: string | null,
  ) {
    const resetSuffix = resetsAt ? ` Limit odnowi się ${resetsAt}.` : "";
    super(
      `Osiągnięto limit: ${METRIC_LABELS[metric].toLowerCase()} (${used}/${limit}).` +
        `${resetSuffix} Wyższy plan zwiększa ten limit.`,
    );
  }

  toResponse() {
    return {
      code: this.code,
      error: this.message,
      metric: this.metric,
      planCode: this.planCode,
      usage: {
        label: METRIC_LABELS[this.metric],
        used: this.used,
        limit: this.limit,
        remaining: 0,
        atLimit: true,
      },
      resetsAt: this.resetsAt,
    };
  }
}

export class GenerationSessionError extends Error {
  readonly code = "GENERATION_SESSION_INVALID";

  constructor(message: string) {
    super(message);
  }

  toResponse() {
    return { code: this.code, error: this.message };
  }
}

export function isSubscriptionLimitError(error: unknown): error is SubscriptionLimitError {
  return error instanceof SubscriptionLimitError;
}

export function isGenerationSessionError(error: unknown): error is GenerationSessionError {
  return error instanceof GenerationSessionError;
}

function getWarsawCalendarParts(now = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { year, month };
}

export function getSubscriptionPeriod(now = new Date()) {
  const { year, month } = getWarsawCalendarParts(now);
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const resetsAt = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { periodStart, resetsAt };
}

function normalizePlanCode(planCode: string, status: string): PlanCode {
  if (status !== "active" && status !== "trialing") return "FREE";
  if (planCode === "PRO" || planCode === "UNLIMITED") return planCode;
  return "FREE";
}

async function ensureSubscription(
  tx: SubscriptionTransaction,
  trainerId: number,
): Promise<PlanDefinition> {
  await tx
    .insert(trainerSubscriptionsTable)
    .values({ trainerId, planCode: "FREE", status: "active" })
    .onConflictDoNothing();
  const [subscription] = await tx
    .select({
      planCode: trainerSubscriptionsTable.planCode,
      status: trainerSubscriptionsTable.status,
    })
    .from(trainerSubscriptionsTable)
    .where(eq(trainerSubscriptionsTable.trainerId, trainerId));
  const planCode = normalizePlanCode(subscription?.planCode ?? "FREE", subscription?.status ?? "active");
  return SUBSCRIPTION_PLANS[planCode];
}

async function lockMetric(
  tx: SubscriptionTransaction,
  trainerId: number,
  metric: SubscriptionMetric,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${trainerId}, ${METRIC_LOCK_KEYS[metric]})`,
  );
}

async function countUsage(
  tx: SubscriptionTransaction,
  trainerId: number,
  metric: SubscriptionMetric,
  periodStart: string,
): Promise<number> {
  if (metric === "clients") {
    const [row] = await tx
      .select({ value: count() })
      .from(clientsTable)
      .where(eq(clientsTable.trainerId, trainerId));
    return Number(row?.value ?? 0);
  }
  if (metric === "customExercises") {
    const [row] = await tx
      .select({ value: count() })
      .from(exercisesTable)
      .where(eq(exercisesTable.createdByTrainerId, trainerId));
    return Number(row?.value ?? 0);
  }
  const [row] = await tx
    .select({ value: count() })
    .from(trainerGenerationSessionsTable)
    .where(
      and(
        eq(trainerGenerationSessionsTable.trainerId, trainerId),
        eq(trainerGenerationSessionsTable.periodStart, periodStart),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function assertSubscriptionLimitInTransaction(
  tx: SubscriptionTransaction,
  trainerId: number,
  metric: SubscriptionMetric,
  additional = 1,
  alreadyLocked = false,
): Promise<void> {
  if (!alreadyLocked) await lockMetric(tx, trainerId, metric);
  const plan = await ensureSubscription(tx, trainerId);
  const limit = plan.limits[metric];
  if (limit === null) return;
  const { periodStart, resetsAt } = getSubscriptionPeriod();
  const used = await countUsage(tx, trainerId, metric, periodStart);
  if (used + additional > limit) {
    throw new SubscriptionLimitError(
      metric,
      plan.code,
      used,
      limit,
      metric === "planGenerations" ? resetsAt : null,
    );
  }
}

export async function lockSubscriptionMetricInTransaction(
  tx: SubscriptionTransaction,
  trainerId: number,
  metric: SubscriptionMetric,
): Promise<void> {
  await lockMetric(tx, trainerId, metric);
}

export async function runWithSubscriptionLimit<T>(
  trainerId: number,
  metric: SubscriptionMetric,
  operation: (tx: SubscriptionTransaction) => Promise<T>,
  additional = 1,
): Promise<T> {
  return db.transaction(async (tx) => {
    await assertSubscriptionLimitInTransaction(tx, trainerId, metric, additional);
    return operation(tx);
  });
}

function usageStat(label: string, used: number, limit: number | null) {
  return {
    label,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    atLimit: limit !== null && used >= limit,
  };
}

export async function getSubscriptionSummary(trainerId: number) {
  return db.transaction(async (tx) => {
    const plan = await ensureSubscription(tx, trainerId);
    const { periodStart, resetsAt } = getSubscriptionPeriod();
    const [clients, customExercises, planGenerations] = await Promise.all([
      countUsage(tx, trainerId, "clients", periodStart),
      countUsage(tx, trainerId, "customExercises", periodStart),
      countUsage(tx, trainerId, "planGenerations", periodStart),
    ]);
    return {
      plan: {
        code: plan.code,
        name: plan.name,
        monthlyPricePln: plan.monthlyPricePln,
      },
      usage: {
        clients: usageStat(METRIC_LABELS.clients, clients, plan.limits.clients),
        customExercises: usageStat(
          METRIC_LABELS.customExercises,
          customExercises,
          plan.limits.customExercises,
        ),
        planGenerations: usageStat(
          METRIC_LABELS.planGenerations,
          planGenerations,
          plan.limits.planGenerations,
        ),
      },
      resetsAt,
      availablePlans: Object.values(SUBSCRIPTION_PLANS).map(
        ({ code, name, monthlyPricePln, benefits }) => ({
          code,
          name,
          monthlyPricePln,
          benefits,
        }),
      ),
    };
  });
}

export function hashGenerationRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function authorizeGeneratedDay(input: {
  trainerId: number;
  clientId: number;
  generationId: string;
  expectedDayCount: number;
  dayIndex: number;
  requestHash: string;
}): Promise<void> {
  if (input.dayIndex >= input.expectedDayCount) {
    throw new GenerationSessionError(
      "Indeks dnia wykracza poza liczbę dni zadeklarowaną dla tej sesji generatora.",
    );
  }
  await db.transaction(async (tx) => {
    await lockMetric(tx, input.trainerId, "planGenerations");
    const plan = await ensureSubscription(tx, input.trainerId);
    const { periodStart, resetsAt } = getSubscriptionPeriod();
    const [existingSession] = await tx
      .select()
      .from(trainerGenerationSessionsTable)
      .where(eq(trainerGenerationSessionsTable.id, input.generationId));

    if (existingSession) {
      if (
        existingSession.trainerId !== input.trainerId ||
        existingSession.clientId !== input.clientId ||
        existingSession.periodStart !== periodStart
      ) {
        throw new GenerationSessionError("Ta sesja generatora nie należy do bieżącego klienta lub miesiąca.");
      }
      if (existingSession.status !== "active") {
        throw new GenerationSessionError("Ta sesja generatora została już zakończona. Rozpocznij nowe generowanie.");
      }
      if (existingSession.expectedDayCount !== input.expectedDayCount) {
        throw new GenerationSessionError("Nie można zmienić liczby dni w rozpoczętej sesji generatora.");
      }
    } else {
      const limit = plan.limits.planGenerations;
      if (limit !== null) {
        const used = await countUsage(tx, input.trainerId, "planGenerations", periodStart);
        if (used >= limit) {
          throw new SubscriptionLimitError(
            "planGenerations",
            plan.code,
            used,
            limit,
            resetsAt,
          );
        }
      }
      await tx.insert(trainerGenerationSessionsTable).values({
        id: input.generationId,
        trainerId: input.trainerId,
        clientId: input.clientId,
        periodStart,
        expectedDayCount: input.expectedDayCount,
      });
    }

    const [existingDay] = await tx
      .select({ requestHash: trainerGenerationSessionDaysTable.requestHash })
      .from(trainerGenerationSessionDaysTable)
      .where(
        and(
          eq(trainerGenerationSessionDaysTable.sessionId, input.generationId),
          eq(trainerGenerationSessionDaysTable.dayIndex, input.dayIndex),
        ),
      );
    if (existingDay && existingDay.requestHash !== input.requestHash) {
      throw new GenerationSessionError(
        "Parametry wygenerowanego dnia uległy zmianie. Rozpocznij nowe generowanie planu.",
      );
    }
    if (!existingDay) {
      await tx.insert(trainerGenerationSessionDaysTable).values({
        sessionId: input.generationId,
        dayIndex: input.dayIndex,
        requestHash: input.requestHash,
      });
    }
  });
}

type GenerationSessionIdentity = {
  trainerId: number;
  clientId: number;
  generationId: string;
};

function exerciseIdsMatch(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function exerciseIdSetsMatch(left: number[], right: number[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((id) => rightSet.has(id));
}

async function getGenerationSession(
  tx: SubscriptionTransaction,
  input: GenerationSessionIdentity,
) {
  const { periodStart } = getSubscriptionPeriod();
  const [session] = await tx
    .select()
    .from(trainerGenerationSessionsTable)
    .where(eq(trainerGenerationSessionsTable.id, input.generationId));
  if (
    !session ||
    session.trainerId !== input.trainerId ||
    session.clientId !== input.clientId ||
    session.periodStart !== periodStart ||
    session.status !== "active"
  ) {
    throw new GenerationSessionError(
      "Brak aktywnej sesji generatora dla tego klienta. Rozpocznij nowe generowanie.",
    );
  }
  return session;
}

async function getCompletedDayOutputs(
  tx: SubscriptionTransaction,
  generationId: string,
  expectedDayCount: number,
): Promise<number[][]> {
  const rows = await tx
    .select({
      dayIndex: trainerGenerationSessionDaysTable.dayIndex,
      outputExerciseIds: trainerGenerationSessionDaysTable.outputExerciseIds,
    })
    .from(trainerGenerationSessionDaysTable)
    .where(eq(trainerGenerationSessionDaysTable.sessionId, generationId))
    .orderBy(asc(trainerGenerationSessionDaysTable.dayIndex));
  if (
    rows.length !== expectedDayCount ||
    rows.some(
      (row, index) =>
        row.dayIndex !== index ||
        !row.outputExerciseIds ||
        row.outputExerciseIds.length === 0,
    )
  ) {
    throw new GenerationSessionError(
      "Sesja generatora nie zawiera kompletu wygenerowanych dni.",
    );
  }
  return rows.map((row) => row.outputExerciseIds!);
}

export async function recordGeneratedDayOutput(input: GenerationSessionIdentity & {
  dayIndex: number;
  exerciseIds: number[];
}): Promise<void> {
  await db.transaction(async (tx) => {
    await lockMetric(tx, input.trainerId, "planGenerations");
    await getGenerationSession(tx, input);
    const [day] = await tx
      .select({
        outputExerciseIds: trainerGenerationSessionDaysTable.outputExerciseIds,
      })
      .from(trainerGenerationSessionDaysTable)
      .where(
        and(
          eq(trainerGenerationSessionDaysTable.sessionId, input.generationId),
          eq(trainerGenerationSessionDaysTable.dayIndex, input.dayIndex),
        ),
      );
    if (!day) {
      throw new GenerationSessionError("Nie znaleziono zarejestrowanego dnia sesji generatora.");
    }
    if (
      day.outputExerciseIds &&
      !exerciseIdsMatch(day.outputExerciseIds, input.exerciseIds)
    ) {
      throw new GenerationSessionError(
        "Ponowiona generacja zwróciła inny wynik dla tych samych parametrów.",
      );
    }
    if (!day.outputExerciseIds) {
      await tx
        .update(trainerGenerationSessionDaysTable)
        .set({ outputExerciseIds: input.exerciseIds })
        .where(
          and(
            eq(trainerGenerationSessionDaysTable.sessionId, input.generationId),
            eq(trainerGenerationSessionDaysTable.dayIndex, input.dayIndex),
          ),
        );
    }
  });
}

export async function runWithActiveGenerationSession<T>(
  input: GenerationSessionIdentity & { dayExerciseIds: number[][] },
  operation: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockMetric(tx, input.trainerId, "planGenerations");
    const session = await getGenerationSession(tx, input);
    const storedDays = await getCompletedDayOutputs(
      tx,
      input.generationId,
      session.expectedDayCount,
    );
    if (
      storedDays.length !== input.dayExerciseIds.length ||
      storedDays.some(
        (stored, index) => !exerciseIdsMatch(stored, input.dayExerciseIds[index] ?? []),
      )
    ) {
      throw new GenerationSessionError(
        "Dane tygodnia nie odpowiadają wynikom aktywnej sesji generatora.",
      );
    }
    return operation();
  });
}

export async function completeAndRecordGeneration(
  input: GenerationSessionIdentity & { exerciseIds: number[] },
): Promise<{ status: "committed" | "already_committed"; committed: number }> {
  return db.transaction(async (tx) => {
    await lockMetric(tx, input.trainerId, "planGenerations");
    const { periodStart } = getSubscriptionPeriod();
    const [session] = await tx
      .select()
      .from(trainerGenerationSessionsTable)
      .where(eq(trainerGenerationSessionsTable.id, input.generationId));
    if (
      !session ||
      session.trainerId !== input.trainerId ||
      session.clientId !== input.clientId ||
      session.periodStart !== periodStart
    ) {
      throw new GenerationSessionError("Nie znaleziono sesji generatora dla tego planu.");
    }

    const storedDays = await getCompletedDayOutputs(
      tx,
      input.generationId,
      session.expectedDayCount,
    );
    const generatedExerciseIds = [...new Set(storedDays.flat())];
    const incomingExerciseIds = [...new Set(input.exerciseIds)];
    if (!exerciseIdSetsMatch(generatedExerciseIds, incomingExerciseIds)) {
      throw new GenerationSessionError(
        "Lista ćwiczeń nie odpowiada wynikowi zapisanej sesji generatora.",
      );
    }

    const existing = await tx
      .select({ exerciseId: clientExerciseUsageLogTable.exerciseId })
      .from(clientExerciseUsageLogTable)
      .where(
        and(
          eq(clientExerciseUsageLogTable.clientId, input.clientId),
          eq(clientExerciseUsageLogTable.generationId, input.generationId),
        ),
      );
    if (existing.length > 0) {
      const existingIds = existing.map((row) => row.exerciseId);
      if (!exerciseIdSetsMatch(existingIds, generatedExerciseIds)) {
        throw new GenerationSessionError(
          "Ta sesja została już zapisana z innym zestawem ćwiczeń.",
        );
      }
      if (session.status !== "completed") {
        throw new GenerationSessionError("Sesja generatora ma niespójny stan zapisu.");
      }
      return { status: "already_committed", committed: existingIds.length };
    }
    if (session.status !== "active") {
      throw new GenerationSessionError("Ta sesja generatora została już zakończona.");
    }

    await tx.insert(clientExerciseUsageLogTable).values(
      generatedExerciseIds.map((exerciseId) => ({
        clientId: input.clientId,
        generationId: input.generationId,
        exerciseId,
      })),
    );
    const [completed] = await tx
      .update(trainerGenerationSessionsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(
        and(
          eq(trainerGenerationSessionsTable.id, input.generationId),
          eq(trainerGenerationSessionsTable.status, "active"),
        ),
      )
      .returning({ id: trainerGenerationSessionsTable.id });
    if (!completed) {
      throw new GenerationSessionError("Nie udało się atomowo zakończyć sesji generatora.");
    }
    return { status: "committed", committed: generatedExerciseIds.length };
  });
}