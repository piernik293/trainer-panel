/** Wniosek o dostęp trenera na ekranie konta bez roli trenera (czysta logika widoku). */
export interface AccessRoles { application: { status: "pending" | "accepted" | "rejected"; canApply: boolean; applyAgainFrom: string | null } | null }

export const ACCESS_SENT_TEXT = "Wniosek wysłany. Odpowiemy zwykle w ciągu 24 godzin.";

export function accessView(r: AccessRoles | null, justSent: boolean): "form" | "sent" | "rejected_wait" {
  if (justSent) return "sent";
  const a = r?.application;
  if (a?.status === "pending") return "sent";
  if (a?.status === "rejected" && !a.canApply) return "rejected_wait";
  return "form";
}
