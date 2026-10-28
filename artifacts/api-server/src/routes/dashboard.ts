import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import {
  db,
  bookingsTable,
  clientInvitationsTable,
  clientsTable,
  surveyInvitesTable,
  surveysTable,
  workoutPlansTable,
  painReportsTable,
  workoutSessionsTable,
  clientPackagesTable,
  attentionDismissalsTable,
  trainerAttentionSettingsTable,
  trainerJoinRequestsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { computeSurveyStatus, fetchLatestSurveyPerClient } from "../lib/survey-status";
import { buildAttention, buildOnboarding, joinRequestItems, limitBlockedInviteItems, ATTENTION_KINDS, type AttentionKind } from "../services/dashboardAttention";
import { usedCounts } from "../services/packages";
import { z } from "zod";

const router: IRouter = Router();

const DAY_MS = 86_400_000;
const warsawDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" });

// ─── GET /dashboard/summary ──────────────────────────────────────────────────
// Everything on the Pulpit in one call. Every query is scoped to the signed-in
// trainer (also for app admins — this is a personal work list, not a report).

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const trainerId = req.trainer!.id;
  const now = new Date();
  const today = warsawDay.format(now);

  const clients = await db
    .select({
      id: clientsTable.id,
      firstName: clientsTable.firstName,
      lastName: clientsTable.lastName,
      status: clientsTable.status,
    })
    .from(clientsTable)
    .where(eq(clientsTable.trainerId, trainerId));
  const clientIds = clients.map((c) => c.id);
  const nameOf = new Map(clients.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));

  const latest = await fetchLatestSurveyPerClient(clientIds.length > 0 ? clientIds : null);
  const latestSurveys = clientIds.length > 0 ? [...latest.values()].filter((s) => nameOf.has(s.clientId)) : [];

  const plans =
    clientIds.length > 0
      ? await db
          .select({
            id: workoutPlansTable.id,
            clientId: workoutPlansTable.clientId,
            status: workoutPlansTable.status,
            createdAt: workoutPlansTable.createdAt,
            activatedAt: workoutPlansTable.activatedAt,
            endDate: workoutPlansTable.endDate,
          })
          .from(workoutPlansTable)
          .where(inArray(workoutPlansTable.clientId, clientIds))
      : [];

  const invites = await db
    .select({
      id: surveyInvitesTable.id,
      clientId: surveyInvitesTable.clientId,
      intendedEmail: surveyInvitesTable.intendedEmail,
      createdAt: surveyInvitesTable.createdAt,
      expiresAt: surveyInvitesTable.expiresAt,
      usedAt: surveyInvitesTable.usedAt,
      limitBlockedAt: surveyInvitesTable.limitBlockedAt,
      clientName: surveyInvitesTable.clientName,
    })
    .from(surveyInvitesTable)
    .where(eq(surveyInvitesTable.trainerId, trainerId));
  const pendingInvites = await db
    .select({ id: surveyInvitesTable.id })
    .from(surveyInvitesTable)
    .where(
      and(
        eq(surveyInvitesTable.trainerId, trainerId),
        isNull(surveyInvitesTable.usedAt),
        isNull(surveyInvitesTable.revokedAt),
        isNull(surveyInvitesTable.archivedAt),
      ),
    );
  const pendingIds = new Set(pendingInvites.map((i) => i.id));

  const unreadPains =
    clientIds.length > 0
      ? await db
          .select({ clientId: painReportsTable.clientId, createdAt: painReportsTable.createdAt, area: painReportsTable.area, severity: painReportsTable.severity })
          .from(painReportsTable)
          .where(and(inArray(painReportsTable.clientId, clientIds), isNull(painReportsTable.readByTrainerAt)))
      : [];

  // Finished sessions (newest first, enough to judge "za ciężko 2×" and the last training day), active packages, dismissals, threshold.
  const finishedSessions =
    clientIds.length > 0
      ? await db
          .select({ clientId: workoutSessionsTable.clientId, id: workoutSessionsTable.id, date: workoutSessionsTable.sessionDate, rating: workoutSessionsTable.sessionRating })
          .from(workoutSessionsTable)
          .where(and(inArray(workoutSessionsTable.clientId, clientIds), eq(workoutSessionsTable.isCompleted, true)))
          .orderBy(desc(workoutSessionsTable.sessionDate), desc(workoutSessionsTable.id))
          .limit(2000)
      : [];
  const activePackages = await db.select().from(clientPackagesTable).where(and(eq(clientPackagesTable.trainerId, trainerId), eq(clientPackagesTable.status, "active")));
  const usedByPackage = await usedCounts(activePackages.map((p) => p.id));
  const dismissedRows = await db.select({ kind: attentionDismissalsTable.kind, ref: attentionDismissalsTable.ref }).from(attentionDismissalsTable).where(eq(attentionDismissalsTable.trainerId, trainerId));
  const [settings] = await db.select().from(trainerAttentionSettingsTable).where(eq(trainerAttentionSettingsTable.trainerId, trainerId));

  const joinRows = await db
    .select({ id: trainerJoinRequestsTable.id, firstName: clientsTable.firstName, createdAt: trainerJoinRequestsTable.createdAt })
    .from(trainerJoinRequestsTable)
    .innerJoin(clientsTable, eq(clientsTable.id, trainerJoinRequestsTable.clientId))
    .where(and(eq(trainerJoinRequestsTable.trainerId, trainerId), eq(trainerJoinRequestsTable.status, "pending")));

  const attention = buildAttention({
    extraItems: [...joinRequestItems(joinRows), ...limitBlockedInviteItems(invites.filter((i) => pendingIds.has(i.id) && i.expiresAt.getTime() > now.getTime()))],
    sessions: finishedSessions.map((x) => ({ clientId: x.clientId, id: x.id, date: String(x.date), rating: x.rating })),
    packages: activePackages.map((p) => ({ clientId: p.clientId, id: p.id, totalSessions: p.totalSessions, used: usedByPackage.get(p.id) ?? 0, validUntil: p.validUntil })),
    silenceDays: settings?.silenceDays ?? 7,
    dismissed: new Set(dismissedRows.map((d) => `${d.kind}|${d.ref}`)),
    pains: unreadPains.map((p) => ({ ...p, createdAt: new Date(p.createdAt) })),
    clients,
    surveys: latestSurveys.map((s) => ({
      clientId: s.clientId,
      createdAt: new Date(s.createdAt),
      completed: computeSurveyStatus(s) === "completed",
    })),
    plans: plans.map((p) => ({
      id: p.id,
      clientId: p.clientId,
      status: p.status,
      createdAt: new Date(p.createdAt),
      endDate: p.endDate,
      activatedAt: p.activatedAt ? new Date(p.activatedAt) : null,
    })),
    invites: invites.filter((i) => pendingIds.has(i.id)),
    today,
    now,
  });

  // Today's bookings (Warsaw calendar day), booked only.
  const bookingRows = await db
    .select({
      id: bookingsTable.id,
      clientId: bookingsTable.clientId,
      startsAt: bookingsTable.startsAt,
      durationMinutes: bookingsTable.durationMinutes,
      firstName: clientsTable.firstName,
      lastName: clientsTable.lastName,
    })
    .from(bookingsTable)
    .innerJoin(clientsTable, eq(bookingsTable.clientId, clientsTable.id))
    .where(
      and(
        eq(bookingsTable.trainerId, trainerId),
        eq(bookingsTable.status, "booked"),
        gte(bookingsTable.startsAt, new Date(now.getTime() - DAY_MS)),
      ),
    )
    .orderBy(asc(bookingsTable.startsAt));
  const todayBookings = bookingRows
    .filter((b) => warsawDay.format(b.startsAt) === today)
    .map((b) => ({
      id: b.id,
      clientId: b.clientId,
      clientName: `${b.firstName} ${b.lastName}`.trim(),
      startsAt: b.startsAt.toISOString(),
      durationMinutes: b.durationMinutes,
    }));

  // Recent real events (last 14 days).
  const since = new Date(now.getTime() - 14 * DAY_MS);
  const surveyEvents =
    clientIds.length > 0
      ? await db
          .select({ clientId: surveysTable.clientId, at: surveysTable.createdAt })
          .from(surveysTable)
          .where(and(inArray(surveysTable.clientId, clientIds), gte(surveysTable.createdAt, since)))
          .orderBy(desc(surveysTable.createdAt))
          .limit(10)
      : [];
  const portalEvents = await db
    .select({ clientId: clientInvitationsTable.clientId, at: clientInvitationsTable.usedAt })
    .from(clientInvitationsTable)
    .where(and(eq(clientInvitationsTable.trainerId, trainerId), gte(clientInvitationsTable.usedAt, since)))
    .limit(10);
  const recentEvents = [
    ...surveyEvents.map((e) => ({ type: "interview_submitted" as const, clientId: e.clientId, at: e.at })),
    ...plans
      .filter((p) => p.activatedAt && p.activatedAt >= since)
      .map((p) => ({ type: "plan_activated" as const, clientId: p.clientId, at: p.activatedAt! })),
    ...portalEvents
      .filter((e) => e.at)
      .map((e) => ({ type: "portal_joined" as const, clientId: e.clientId, at: e.at! })),
  ]
    .filter((e) => nameOf.has(e.clientId))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 5)
    .map((e) => ({ type: e.type, clientId: e.clientId, clientName: nameOf.get(e.clientId)!, at: e.at.toISOString() }));

  const [anyPortalInvitation] = await db
    .select({ id: clientInvitationsTable.id })
    .from(clientInvitationsTable)
    .where(eq(clientInvitationsTable.trainerId, trainerId))
    .limit(1);

  const livePlans = plans.filter((p) => p.status !== "archived");
  const withPlan = new Set(livePlans.map((p) => p.clientId));
  const byNewestSurvey = [...latestSurveys].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const onboarding = buildOnboarding(
    {
      anyInvitation: invites.length > 0 || !!anyPortalInvitation,
      anyInterview: latestSurveys.length > 0,
      anyPlan: livePlans.length > 0,
      anyActivePlan: plans.some((p) => p.status === "active"),
    },
    {
      interviewClientId: byNewestSurvey[0]?.clientId ?? null,
      planClientId: (byNewestSurvey.find((s) => !withPlan.has(s.clientId)) ?? byNewestSurvey[0])?.clientId ?? null,
      draftPlanId: plans.find((p) => p.status === "draft")?.id ?? null,
      activePlanClientId: plans.find((p) => p.status === "active")?.clientId ?? null,
    },
  );

  res.json({
    today,
    trainerName: req.trainer!.displayName ?? null,
    counts: {
      totalClients: clients.length,
      activeClients: clients.filter((c) => c.status === "active").length,
      newInterviews: attention.byKind.interview,
      plansEndingSoon: attention.byKind.plan_ending,
    },
    attention: { items: attention.items, allItems: attention.allItems, total: attention.total, silenceDays: settings?.silenceDays ?? 7 },
    todayBookings,
    recentEvents,
    onboarding,
  });
});

// ─── "Załatwione" and the silence threshold ─────────────────────────────────────

const DismissBody = z.object({ kind: z.enum(ATTENTION_KINDS as unknown as [AttentionKind, ...AttentionKind[]]), ref: z.string().min(1).max(200) });

/** Marks a reason as done. The ref must belong to the trainer's own client (the id before the first ":" — 0 = no client, an invitation). */
router.post("/dashboard/attention/dismiss", requireAuth, async (req, res): Promise<void> => {
  const b = DismissBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Nieprawidłowe dane." }); return; }
  const clientId = Number(b.data.ref.split(":")[0]);
  if (!Number.isInteger(clientId) || clientId < 0) { res.status(400).json({ error: "Nieprawidłowe dane." }); return; }
  if (clientId > 0) {
    const [own] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, req.trainer!.id)));
    if (!own) { res.status(404).json({ error: "Klient nie znaleziony." }); return; }
  }
  await db.insert(attentionDismissalsTable).values({ trainerId: req.trainer!.id, kind: b.data.kind, ref: b.data.ref }).onConflictDoNothing();
  res.json({ ok: true });
});

const SettingsBody = z.object({ silenceDays: z.union([z.literal(7), z.literal(10), z.literal(14)]) });
router.get("/dashboard/attention-settings", requireAuth, async (req, res): Promise<void> => {
  const [s] = await db.select().from(trainerAttentionSettingsTable).where(eq(trainerAttentionSettingsTable.trainerId, req.trainer!.id));
  res.json({ silenceDays: s?.silenceDays ?? 7 });
});
router.put("/dashboard/attention-settings", requireAuth, async (req, res): Promise<void> => {
  const b = SettingsBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Wybierz 7, 10 lub 14 dni." }); return; }
  await db.insert(trainerAttentionSettingsTable).values({ trainerId: req.trainer!.id, silenceDays: b.data.silenceDays })
    .onConflictDoUpdate({ target: trainerAttentionSettingsTable.trainerId, set: { silenceDays: b.data.silenceDays, updatedAt: new Date() } });
  res.json({ silenceDays: b.data.silenceDays });
});

export default router;
