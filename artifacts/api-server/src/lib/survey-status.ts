import { desc } from "drizzle-orm";
import { db, surveysTable, type Survey } from "@workspace/db";

export type SurveyStatusValue = "not_started" | "incomplete" | "completed";

// Fields required for a public survey submission (see PublicSurveySubmission in
// the OpenAPI spec). Used to decide whether a client's latest survey counts as
// fully "Completed" or only "Incomplete". Tolerant of legacy records: any of
// these fields being null/undefined/empty just means "incomplete", never a crash.
const REQUIRED_FIELDS: (keyof Survey)[] = [
  "dateOfBirth",
  "gender",
  "heightCm",
  "weightKg",
  "experienceLevel",
  "activityLevel",
  "sleepHours",
  "planStylePreference",
];

export function computeSurveyStatus(survey: Survey | undefined | null): SurveyStatusValue {
  if (!survey) return "not_started";
  const missingRequiredField = REQUIRED_FIELDS.some((field) => {
    const value = survey[field];
    return value === null || value === undefined || value === "";
  });
  return missingRequiredField ? "incomplete" : "completed";
}

/**
 * Given a flat list of survey rows (potentially several per client, since surveys
 * are append-only history), returns a map of clientId -> most recent survey.
 */
export function pickLatestSurveyPerClient(surveys: Survey[]): Map<number, Survey> {
  const latestByClient = new Map<number, Survey>();
  for (const survey of surveys) {
    const existing = latestByClient.get(survey.clientId);
    if (!existing || new Date(survey.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      latestByClient.set(survey.clientId, survey);
    }
  }
  return latestByClient;
}

/**
 * Fetches only the most recent survey per client directly from the database
 * (via DISTINCT ON), instead of loading the full survey history into memory
 * and reducing it in application code. Scales flat as survey history grows.
 */
export async function fetchLatestSurveyPerClient(): Promise<Map<number, Survey>> {
  const rows = await db
    .selectDistinctOn([surveysTable.clientId])
    .from(surveysTable)
    .orderBy(surveysTable.clientId, desc(surveysTable.createdAt));

  const latestByClient = new Map<number, Survey>();
  for (const survey of rows) {
    latestByClient.set(survey.clientId, survey);
  }
  return latestByClient;
}
