/** Po zapisie szkicu kreator przenosi do planu z `?po-zapisie=1` — wtedy edytor pokazuje „Aktywuj teraz” / „Jeszcze poprawię”. */
export const JUST_SAVED_PARAM = "po-zapisie";
export const planUrlAfterSave = (planId: number) => `/plans/${planId}?${JUST_SAVED_PARAM}=1`;
export const isJustSaved = (search: string) => new URLSearchParams(search).get(JUST_SAVED_PARAM) === "1";
