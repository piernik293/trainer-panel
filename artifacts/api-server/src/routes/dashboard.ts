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
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { computeSurveyStatus, fetchLatestSurveyPerClient } from "../lib/survey-status";
import { buildAttention, buildOnboarding } from "../services/dashboardAttention";

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

  const attention = buildAttention({
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

  const onboarding = buildOnboarding({
    anyInvitation: invites.length > 0 || !!anyPortalInvitation,
    anyInterview: latestSurveys.length > 0,
    anyPlan: plans.some((p) => p.status !== "archived"),
    anyActivePlan: plans.some((p) => p.status === "active"),
  });

  res.json({
    today,
    trainerName: req.trainer!.displayName ?? null,
    counts: {
      totalClients: clients.length,
      activeClients: clients.filter((c) => c.status === "active").length,
      newInterviews: attention.byKind.interview,
      plansEndingSoon: attention.byKind.plan_ending,
    },
    attention: { items: attention.items, total: attention.total },
    todayBookings,
    recentEvents,
    onboarding,
  });
});

export default router;
