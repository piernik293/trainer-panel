export type ClientStatusValue = "active" | "paused" | "finished";
export type SurveyStatusValue = "not_started" | "incomplete" | "completed";

export const CLIENT_STATUS_LABELS: Record<ClientStatusValue, string> = {
  active: "Aktywny",
  paused: "Wstrzymany",
  finished: "Zakończony",
};

export const SURVEY_STATUS_LABELS: Record<SurveyStatusValue, string> = {
  not_started: "Nie rozpoczęta",
  incomplete: "Niekompletna",
  completed: "Wypełniona",
};

// Defensive: tolerates legacy/unknown values instead of crashing the UI.
export function clientStatusLabel(status: string | null | undefined): string {
  if (status && status in CLIENT_STATUS_LABELS) {
    return CLIENT_STATUS_LABELS[status as ClientStatusValue];
  }
  return CLIENT_STATUS_LABELS.active;
}

export function surveyStatusLabel(status: string | null | undefined): string {
  if (status && status in SURVEY_STATUS_LABELS) {
    return SURVEY_STATUS_LABELS[status as SurveyStatusValue];
  }
  return SURVEY_STATUS_LABELS.not_started;
}
