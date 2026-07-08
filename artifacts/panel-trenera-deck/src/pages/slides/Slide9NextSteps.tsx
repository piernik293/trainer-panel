export default function Slide9NextSteps() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{
        backgroundColor: "#0A1628",
        fontFamily: "'Inter', sans-serif",
        boxSizing: "border-box",
        padding: "5vh 5vw",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10vh" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.5vw", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em" }}>
          trener
        </div>
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "0.9vw",
          color: "#A0AEC0",
          display: "flex",
          gap: "3vw",
        }}>
          <div>Lipiec 2026</div>
          <div>Panel Trenera</div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", gap: "8vw", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ position: "relative", marginBottom: "5vh" }}>
            <div style={{
              position: "absolute",
              left: "-2vw",
              top: "1.5vh",
              width: "25vw",
              height: "4vh",
              backgroundColor: "#FFFFFF",
              opacity: 0.05,
              zIndex: 0,
            }} />
            <h2 style={{
              fontSize: "5vw",
              fontWeight: 900,
              color: "#FFFFFF",
              margin: 0,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              position: "relative",
              zIndex: 1,
            }}>
              Dalsze rekomendacje
            </h2>
          </div>

          <p style={{
            fontSize: "1.6vw",
            color: "#E2E8F0",
            maxWidth: "45vw",
            lineHeight: 1.5,
            margin: 0,
            fontWeight: 400,
          }}>
            Opcjonalne następne kroki. System jest gotowy do produkcji — poniższe rozszerzenia to kolejna faza.
          </p>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0" }}>
          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start", padding: "2.5vh 0", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0", flexShrink: 0, width: "2vw" }}>01</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FFFFFF", margin: "0 0 0.5vh 0" }}>Autoryzacja</h3>
              <p style={{ fontSize: "1.1vw", color: "#718096", margin: 0, lineHeight: 1.4 }}>Logowanie do panelu — Clerk lub Replit Auth</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start", padding: "2.5vh 0", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0", flexShrink: 0, width: "2vw" }}>02</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FFFFFF", margin: "0 0 0.5vh 0" }}>Wiadomości do klientów</h3>
              <p style={{ fontSize: "1.1vw", color: "#718096", margin: 0, lineHeight: 1.4 }}>Wysyłka gotowego planu treningowego e-mailem</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start", padding: "2.5vh 0", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0", flexShrink: 0, width: "2vw" }}>03</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FFFFFF", margin: "0 0 0.5vh 0" }}>Kalendarze</h3>
              <p style={{ fontSize: "1.1vw", color: "#718096", margin: 0, lineHeight: 1.4 }}>Integracja z harmonogramem sesji treningowych</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start", padding: "2.5vh 0", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0", flexShrink: 0, width: "2vw" }}>04</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FFFFFF", margin: "0 0 0.5vh 0" }}>Statystyki klientów</h3>
              <p style={{ fontSize: "1.1vw", color: "#718096", margin: 0, lineHeight: 1.4 }}>Wykres postępów, historia zmian ankiet</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start", padding: "2.5vh 0", borderTop: "1px solid rgba(255,255,255,0.15)", borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0", flexShrink: 0, width: "2vw" }}>05</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FFFFFF", margin: "0 0 0.5vh 0" }}>Wdrożenie produkcyjne</h3>
              <p style={{ fontSize: "1.1vw", color: "#718096", margin: 0, lineHeight: 1.4 }}>Publikacja pod własną domeną</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: "5vh", left: "5vw", right: "5vw",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: "2vh",
      }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0" }}>Dalsze rekomendacje / Panel Trenera</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#FFFFFF", fontWeight: 600 }}>09</div>
      </div>
    </div>
  );
}
