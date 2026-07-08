export default function Slide8Email() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{
        backgroundColor: "#F8F9FC",
        fontFamily: "'Inter', sans-serif",
        boxSizing: "border-box",
        padding: "5vh 5vw 14vh 5vw",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6vh" }}>
        <div style={{ position: "relative" }}>
          <div style={{
            position: "absolute", left: "-1vw", top: "1.5vh",
            width: "19vw", height: "3vh",
            backgroundColor: "#0A1628", opacity: 0.08, zIndex: 0,
          }} />
          <h2 style={{
            fontSize: "3.5vw", fontWeight: 900, color: "#0A1628",
            margin: 0, lineHeight: 1, letterSpacing: "-0.03em",
            position: "relative", zIndex: 1,
          }}>
            Powiadomienia e-mail
          </h2>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.2vw", fontWeight: 800, color: "#0A1628", letterSpacing: "-0.02em" }}>
          trener
        </div>
      </div>

      <div style={{ display: "flex", gap: "5vw", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "3vh" }}>
          <p style={{ fontSize: "1.4vw", fontWeight: 500, color: "#4A5568", lineHeight: 1.5, margin: 0 }}>
            Trener może skonfigurować powiadomienia o nowych ankietach — wystarczy ustawić zmienne środowiskowe.
          </p>
          <div style={{ width: "100%", height: "1px", backgroundColor: "#E2E8F0" }} />
          <p style={{ fontSize: "1.2vw", color: "#4A5568", lineHeight: 1.5, margin: 0 }}>
            Jeśli zmienne nie są ustawione, aplikacja działa normalnie — bez wysyłania maili. Konfiguracja jest w pełni opcjonalna.
          </p>
          <div style={{ marginTop: "1vh" }}>
            <h4 style={{
              fontSize: "0.85vw", fontFamily: "'DM Mono', monospace",
              fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
              color: "#A0AEC0", margin: "0 0 2vh 0",
            }}>
              Powiadomienie zawiera
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
              <div style={{ display: "flex", gap: "2vw" }}>
                <div style={{ width: "4px", height: "1.4vw", backgroundColor: "#0A1628", flexShrink: 0, marginTop: "0.2vw" }} />
                <p style={{ fontSize: "1.2vw", color: "#4A5568", margin: 0 }}>Imię i nazwisko klienta</p>
              </div>
              <div style={{ display: "flex", gap: "2vw" }}>
                <div style={{ width: "4px", height: "1.4vw", backgroundColor: "#0A1628", flexShrink: 0, marginTop: "0.2vw" }} />
                <p style={{ fontSize: "1.2vw", color: "#4A5568", margin: 0 }}>Adres e-mail klienta (jeśli podany)</p>
              </div>
              <div style={{ display: "flex", gap: "2vw" }}>
                <div style={{ width: "4px", height: "1.4vw", backgroundColor: "#0A1628", flexShrink: 0, marginTop: "0.2vw" }} />
                <p style={{ fontSize: "1.2vw", color: "#4A5568", margin: 0 }}>Cel treningowy</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{
          flex: 1.2, backgroundColor: "#0A1628",
          padding: "3.5vh 3vw",
          display: "flex", flexDirection: "column",
        }}>
          <h4 style={{
            fontSize: "0.85vw", fontFamily: "'DM Mono', monospace",
            fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
            color: "#A0AEC0", margin: "0 0 3vh 0",
          }}>
            Konfiguracja — zmienne środowiskowe
          </h4>

          <div style={{ display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ padding: "1.5vh 1.5vw", border: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#79C0FF", fontWeight: 500 }}>ADMIN_EMAIL</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#718096" }}>adres docelowy</span>
            </div>
            <div style={{ padding: "1.5vh 1.5vw", border: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#79C0FF", fontWeight: 500 }}>SMTP_HOST</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#718096" }}>np. smtp.gmail.com</span>
            </div>
            <div style={{ padding: "1.5vh 1.5vw", border: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#79C0FF", fontWeight: 500 }}>SMTP_PORT</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#718096" }}>domyślnie 587</span>
            </div>
            <div style={{ padding: "1.5vh 1.5vw", border: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#79C0FF", fontWeight: 500 }}>SMTP_USER</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#718096" }}>login SMTP</span>
            </div>
            <div style={{ padding: "1.5vh 1.5vw", border: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#79C0FF", fontWeight: 500 }}>SMTP_PASS</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#718096" }}>hasło SMTP</span>
            </div>
          </div>

          <div style={{ marginTop: "auto", paddingTop: "3vh", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#718096", margin: 0, lineHeight: 1.5 }}>
              Obsługa przez Nodemailer — kompatybilny z Gmail, Mailgun, SendGrid i każdym SMTP.
            </p>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: "5vh", left: "5vw", right: "5vw",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid #E2E8F0", paddingTop: "2vh",
      }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0" }}>Powiadomienia e-mail / Panel Trenera</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#0A1628", fontWeight: 600 }}>08</div>
      </div>
    </div>
  );
}
