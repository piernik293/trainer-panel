/**
 * Tajne fragmenty adresów (token wywiadu, token zaproszenia, kod trenera) nie mogą trafiać do logów ani do dziennika błędów:
 * kto zna adres z logu, mógłby wypełnić cudzy wywiad, przejąć zaproszenie albo poprosić o dołączenie do trenera.
 */
const SECRET_SEGMENT = /(\/(?:public\/survey|client-invitations|join)\/)[^/?#\s]+/gi;

export function maskSecretsInPath(path: string | null | undefined): string {
  return (path ?? "").replace(SECRET_SEGMENT, "$1:token");
}
