import { Router, type IRouter } from "express";
import { desc, count, eq, gte, and, inArray } from "drizzle-orm";
import { db, clientsTable, surveysTable } from "@workspace/db";
import {
  GetStatsResponse,
  GetTrainingGoalsDistributionResponse,
} from "@workspace/api-zod";
import { computeSurveyStatus, fetchLatestSurveyPerClient } from "../lib/survey-status";
import { requireAuth, checkIsAppAdmin } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ─── GET /stats ────────────────────────────────────────────────────────────────

router.get("/stats", requireAuth, async (req, res): Promise<void> => {
  const trainerId = req.trainer!.id;
  const isAdmin = checkIsAppAdmin(req.clerkUserId);

  // Build the WHERE clause for all client-scoped queries.
  // Admins see all clients; ordinary trainers see only their own.
  const trainerFilter = isAdmin ? undefined : eq(clientsTable.trainerId, trainerId);

  const [totalRow] = await db
    .select({ total: count() })
    .from(clientsTable)
    .where(trainerFilter);
  const totalClients = totalRow?.total ?? 0;

  const [activeRow] = await db
    .select({ total: count() })
    .from(clientsTable)
    .where(
      trainerFilter
        ? and(trainerFilter, eq(clientsTable.status, "active"))
        : eq(clientsTable.status, "active")
    );
  const [pausedRow] = await db
    .select({ total: count() })
    .from(clientsTable)
    .where(
      trainerFilter
        ? and(trainerFilter, eq(clientsTable.status, "paused"))
        : eq(clientsTable.status, "paused")
    );
  const [finishedRow] = await db
    .select({ total: count() })
    .from(clientsTable)
    .where(
      trainerFilter
        ? and(trainerFilter, eq(clientsTable.status, "finished"))
        : eq(clientsTable.status, "finished")
    );

  // Fetch all clients for this trainer (or all if admin) for per-client survey processing.
  const allClients = await db
    .select()
    .from(clientsTable)
    .where(trainerFilter);

  const clientIds = allClients.map((c) => c.id);

  // Surveys created in the last week, scoped to this trainer's clients.
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [newSurveysRow] = await db
    .select({ total: count() })
    .from(surveysTable)
    .where(
      clientIds.length > 0
        ? and(
            gte(surveysTable.createdAt, oneWeekAgo),
            inArray(surveysTable.clientId, clientIds),
          )
        : gte(surveysTable.createdAt, oneWeekAgo)
    );

  // Latest survey per client, trainer-scoped.
  const latestByClient = await fetchLatestSurveyPerClient(clientIds.length > 0 ? clientIds : null);

  let surveysCompleted = 0;
  let incompleteSurveys = 0;
  let noSurveyClients = 0;
  for (const client of allClients) {
    const status = computeSurveyStatus(latestByClient.get(client.id));
    if (status === "completed") surveysCompleted++;
    else if (status === "incomplete") incompleteSurveys++;
    else noSurveyClients++;
  }

  const surveysPercent =
    totalClients > 0 ? Math.round((surveysCompleted / totalClients) * 100) : 0;

  const recentClients = await db
    .select()
    .from(clientsTable)
    .where(trainerFilter)
    .orderBy(desc(clientsTable.createdAt))
    .limit(5);

  const recentWithSurvey = recentClients.map((c) => {
    const latest = latestByClient.get(c.id);
    return {
      ...c,
      hasSurvey: !!latest,
      surveyStatus: computeSurveyStatus(latest),
      lastSurveyDate: latest ? latest.createdAt : null,
      trainingGoal: latest?.trainingGoal ?? null,
      experienceLevel: latest?.experienceLevel ?? null,
      weeklyFrequency: latest?.weeklyFrequency ?? null,
      preferredMuscles: latest?.preferredMuscles ?? null,
      priorityMuscle1: latest?.priorityMuscle1 ?? null,
      trainingLocation: latest?.trainingLocation ?? null,
      cardioPreference: latest?.cardioPreference ?? null,
    };
  });

  res.json(
    GetStatsResponse.parse({
      totalClients,
      surveysCompleted,
      surveysPercent,
      activeClients: activeRow?.total ?? 0,
      pausedClients: pausedRow?.total ?? 0,
      finishedClients: finishedRow?.total ?? 0,
      incompleteSurveys,
      noSurveyClients,
      newSurveysThisWeek: newSurveysRow?.total ?? 0,
      recentClients: recentWithSurvey,
    }),
  );
});

// ─── GET /training-goals-distribution ─────────────────────────────────────────

router.get("/training-goals-distribution", requireAuth, async (req, res): Promise<void> => {
  const trainerId = req.trainer!.id;
  const isAdmin = checkIsAppAdmin(req.clerkUserId);

  // Get the trainer's own clients (or all if admin).
  const ownedClients = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(isAdmin ? undefined : eq(clientsTable.trainerId, trainerId));

  const clientIds = ownedClients.map((c) => c.id);
  const latestByClient = await fetchLatestSurveyPerClient(clientIds.length > 0 ? clientIds : null);

  const counts: Record<string, number> = {};
  for (const { trainingGoal } of latestByClient.values()) {
    if (trainingGoal) {
      counts[trainingGoal] = (counts[trainingGoal] ?? 0) + 1;
    }
  }

  const distribution = Object.entries(counts).map(([goal, count]) => ({
    goal,
    count,
  }));

  res.json(GetTrainingGoalsDistributionResponse.parse(distribution));
});

export default router;
