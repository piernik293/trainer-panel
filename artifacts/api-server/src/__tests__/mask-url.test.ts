import { describe, it, expect } from "vitest";
import { maskSecretsInPath } from "../lib/maskUrl";
import { normalizePlace, scrubMessage } from "../services/errorLog";

const TOKEN = "8d81592254702e1fc3c3a530fd97d69eb555c674269e1bdb22bf80a90b5ae7c2";

describe("tajne adresy nie trafiają do logów i dziennika błędów", () => {
  it("maskuje token wywiadu, token zaproszenia i kod trenera", () => {
    expect(maskSecretsInPath(`/api/public/survey/${TOKEN}`)).toBe("/api/public/survey/:token");
    expect(maskSecretsInPath(`/api/client-invitations/${TOKEN}/activate`)).toBe("/api/client-invitations/:token/activate");
    expect(maskSecretsInPath("/api/join/F2YJ3QPE59")).toBe("/api/join/:token");
    expect(maskSecretsInPath("/api/join/F2YJ3QPE59/request")).toBe("/api/join/:token/request");
  });
  it("zwykłe adresy bez zmian, pusta wartość to pusty tekst", () => {
    expect(maskSecretsInPath("/api/clients/12/plans")).toBe("/api/clients/12/plans");
    expect(maskSecretsInPath(undefined)).toBe("");
  });
  it("miejsce błędu w dzienniku administratora też nie zawiera kodu ani tokenu", () => {
    expect(normalizePlace("POST /api/join/F2YJ3QPE59/request")).toBe("POST /api/join/:token/request");
    expect(normalizePlace(`GET /api/public/survey/${TOKEN}?x=1`)).not.toContain(TOKEN);
    expect(scrubMessage(`failed for /api/join/F2YJ3QPE59`)).not.toContain("F2YJ3QPE59");
  });
});
