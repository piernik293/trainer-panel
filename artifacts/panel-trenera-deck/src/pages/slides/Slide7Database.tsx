export default function Slide7Database() {
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
            width: "16vw", height: "3vh",
            backgroundColor: "#0A1628", opacity: 0.08, zIndex: 0,
          }} />
          <h2 style={{
            fontSize: "3.5vw", fontWeight: 900, color: "#0A1628",
            margin: 0, lineHeight: 1, letterSpacing: "-0.03em",
            position: "relative", zIndex: 1,
          }}>
            Baza danych i API
          </h2>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.2vw", fontWeight: 800, color: "#0A1628", letterSpacing: "-0.02em" }}>
          trener
        </div>
      </div>

      <div style={{ display: "flex", gap: "3vw", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2.5vw" }}>
          <div style={{ display: "flex", gap: "2vw" }}>
            <div style={{
              flex: 1, backgroundColor: "#0A1628",
              padding: "3vh 2.5vw",
            }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "4.5vw", fontWeight: 900, color: "#FFFFFF", lineHeight: 1, letterSpacing: "-0.04em" }}>2</div>
              <div style={{ fontSize: "1.1vw", color: "#A0AEC0", marginTop: "1.5vh", lineHeight: 1.4 }}>tabele PostgreSQL</div>
              <div style={{ fontSize: "1vw", color: "#718096", marginTop: "0.5vh" }}>clients + surveys</div>
            </div>
            <div style={{
              flex: 1, border: "1px solid #E2E8F0",
              padding: "3vh 2.5vw",
            }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "4.5vw", fontWeight: 900, color: "#0A1628", lineHeight: 1, letterSpacing: "-0.04em" }}>12</div>
              <div style={{ fontSize: "1.1vw", color: "#4A5568", marginTop: "1.5vh", lineHeight: 1.4 }}>endpointów REST</div>
              <div style={{ fontSize: "1vw", color: "#718096", marginTop: "0.5vh" }}>CRUD + stats + public</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ display: "flex", gap: "2vw", padding: "1.5vh 0", borderTop: "1px solid #E2E8F0" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85vw", color: "#A0AEC0", width: "10vw", flexShrink: 0 }}>clients</div>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", margin: 0, lineHeight: 1.5 }}>Imię, nazwisko, e-mail, telefon, notatki, timestamps</p>
            </div>
            <div style={{ display: "flex", gap: "2vw", padding: "1.5vh 0", borderTop: "1px solid #E2E8F0" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85vw", color: "#A0AEC0", width: "10vw", flexShrink: 0 }}>surveys</div>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", margin: 0, lineHeight: 1.5 }}>13 pól wywiadu, relacja 1:1 z klientem (unique constraint)</p>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2vh" }}>
          <h4 style={{
            fontSize: "0.85vw", fontFamily: "'DM Mono', monospace",
            fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
            color: "#A0AEC0", margin: "0 0 1vh 0",
          }}>
            Walidacja danych
          </h4>
          <p style={{ fontSize: "1.3vw", fontWeight: 500, color: "#4A5568", lineHeight: 1.5, margin: 0 }}>
            Schematy Zod generowane automatycznie z OpenAPI — walidacja po stronie serwera i frontendu.
          </p>
          <div style={{ width: "100%", height: "1px", backgroundColor: "#E2E8F0", margin: "1vh 0" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ display: "flex", gap: "2vw", padding: "1.5vh 0", borderTop: "1px solid #E2E8F0" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85vw", color: "#A0AEC0", width: "10vw", flexShrink: 0 }}>CRUD klientów</div>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", margin: 0 }}>GET / POST / PATCH / DELETE /clients</p>
            </div>
            <div style={{ display: "flex", gap: "2vw", padding: "1.5vh 0", borderTop: "1px solid #E2E8F0" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85vw", color: "#A0AEC0", width: "10vw", flexShrink: 0 }}>Ankiety</div>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", margin: 0 }}>GET + PUT /clients/:id/survey (upsert)</p>
            </div>
            <div style={{ display: "flex", gap: "2vw", padding: "1.5vh 0", borderTop: "1px solid #E2E8F0" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85vw", color: "#A0AEC0", width: "10vw", flexShrink: 0 }}>Statystyki</div>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", margin: 0 }}>GET /stats + /training-goals-distribution</p>
            </div>
            <div style={{ display: "flex", gap: "2vw", padding: "1.5vh 0", borderTop: "1px solid #E2E8F0" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85vw", color: "#A0AEC0", width: "10vw", flexShrink: 0 }}>Publiczny</div>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", margin: 0 }}>POST /public/survey — klient + ankieta w jednym</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: "5vh", left: "5vw", right: "5vw",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid #E2E8F0", paddingTop: "2vh",
      }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0" }}>Baza danych i API / Panel Trenera</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#0A1628", fontWeight: 600 }}>07</div>
      </div>
    </div>
  );
}
