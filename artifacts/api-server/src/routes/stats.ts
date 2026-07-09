import { Router, type IRouter } from "express";
import { desc, count, eq, gte } from "drizzle-orm";
import { db, clientsTable, surveysTable } from "@workspace/db";
import {
  GetStatsResponse,
  GetTrainingGoalsDistributionResponse,
} from "@workspace/api-zod";
import { computeSurveyStatus, pickLatestSurveyPerClient } from "../lib/survey-status";

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const [totalRow] = await db.select({ total: count() }).from(clientsTable);
  const totalClients = totalRow?.total ?? 0;

  const [activeRow] = await db
    .select({ total: count() })
    .from(clientsTable)
    .where(eq(clientsTable.status, "active"));
  const [pausedRow] = await db
    .select({ total: count() })
    .from(clientsTable)
    .where(eq(clientsTable.status, "paused"));
  const [finishedRow] = await db
    .select({ total: count() })
    .from(clientsTable)
    .where(eq(clientsTable.status, "finished"));

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [newSurveysRow] = await db
    .select({ total: count() })
    .from(surveysTable)
    .where(gte(surveysTable.createdAt, oneWeekAgo));

  const allClients = await db.select().from(clientsTable);
  const allSurveys = await db.select().from(surveysTable);
  const latestByClient = pickLatestSurveyPerClient(allSurveys);

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

router.get("/training-goals-distribution", async (_req, res): Promise<void> => {
  const surveys = await db
    .select({ trainingGoal: surveysTable.trainingGoal, clientId: surveysTable.clientId, createdAt: surveysTable.createdAt })
    .from(surveysTable);

  // Only count each client's latest survey toward the distribution.
  const latestByClient = new Map<number, { trainingGoal: string | null; createdAt: Date }>();
  for (const s of surveys) {
    const existing = latestByClient.get(s.clientId);
    if (!existing || s.createdAt.getTime() > existing.createdAt.getTime()) {
      latestByClient.set(s.clientId, { trainingGoal: s.trainingGoal, createdAt: s.createdAt });
    }
  }

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
