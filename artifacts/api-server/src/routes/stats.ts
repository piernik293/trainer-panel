import { Router, type IRouter } from "express";
import { desc, count, isNotNull } from "drizzle-orm";
import { db, clientsTable, surveysTable } from "@workspace/db";
import {
  GetStatsResponse,
  GetTrainingGoalsDistributionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const [totalRow] = await db
    .select({ total: count() })
    .from(clientsTable);

  const [surveyCountRow] = await db
    .select({ surveyed: count() })
    .from(surveysTable);

  const totalClients = totalRow?.total ?? 0;
  const surveysCompleted = surveyCountRow?.surveyed ?? 0;
  const surveysPercent = totalClients > 0
    ? Math.round((surveysCompleted / totalClients) * 100)
    : 0;

  const recentClients = await db
    .select()
    .from(clientsTable)
    .orderBy(desc(clientsTable.createdAt))
    .limit(5);

  const surveyClientIds = await db
    .select({ clientId: surveysTable.clientId })
    .from(surveysTable);

  const surveySet = new Set(surveyClientIds.map((s) => s.clientId));

  const recentWithSurvey = recentClients.map((c) => ({
    ...c,
    hasSurvey: surveySet.has(c.id),
  }));

  res.json(
    GetStatsResponse.parse({
      totalClients,
      surveysCompleted,
      surveysPercent,
      recentClients: recentWithSurvey,
    }),
  );
});

router.get("/training-goals-distribution", async (_req, res): Promise<void> => {
  const surveys = await db
    .select({ trainingGoal: surveysTable.trainingGoal })
    .from(surveysTable)
    .where(isNotNull(surveysTable.trainingGoal));

  const counts: Record<string, number> = {};
  for (const s of surveys) {
    if (s.trainingGoal) {
      counts[s.trainingGoal] = (counts[s.trainingGoal] ?? 0) + 1;
    }
  }

  const distribution = Object.entries(counts).map(([goal, count]) => ({
    goal,
    count,
  }));

  res.json(GetTrainingGoalsDistributionResponse.parse(distribution));
});

export default router;
