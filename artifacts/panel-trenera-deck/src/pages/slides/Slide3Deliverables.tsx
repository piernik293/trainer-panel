export default function Slide3Deliverables() {
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "7vh" }}>
        <div style={{ position: "relative" }}>
          <div style={{
            position: "absolute", left: "-1vw", top: "1.5vh",
            width: "22vw", height: "3vh",
            backgroundColor: "#0A1628", opacity: 0.08, zIndex: 0,
          }} />
          <h2 style={{
            fontSize: "3.5vw", fontWeight: 900, color: "#0A1628",
            margin: 0, lineHeight: 1, letterSpacing: "-0.03em",
            position: "relative", zIndex: 1,
          }}>
            Co zostało zbudowane
          </h2>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.2vw", fontWeight: 800, color: "#0A1628", letterSpacing: "-0.02em" }}>
          trener
        </div>
      </div>

      <p style={{ fontSize: "1.5vw", fontWeight: 500, color: "#4A5568", lineHeight: 1.5, margin: "0 0 6vh 0", maxWidth: "60vw" }}>
        Dwa produkty — jeden wspólny backend. Kompletny, niezależny system gotowy do wdrożenia.
      </p>

      <div style={{ display: "flex", gap: "3vw", flex: 1, minHeight: 0 }}>
        <div style={{
          flex: 1, borderTop: "2px solid #0A1628", paddingTop: "3vh",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#A0AEC0", marginBottom: "2vh", fontWeight: 500 }}>01</div>
          <h3 style={{ fontSize: "1.8vw", fontWeight: 800, color: "#0A1628", margin: "0 0 2vh 0", letterSpacing: "-0.02em" }}>Panel Trenera</h3>
          <p style={{ fontSize: "1.2vw", color: "#4A5568", lineHeight: 1.6, margin: 0 }}>
            Prywatna aplikacja administracyjna. Pulpit, baza klientów, podgląd ankiet, eksport PDF.
          </p>
          <div style={{
            marginTop: "auto",
            padding: "1.5vh 1.5vw",
            backgroundColor: "#0A1628",
            display: "inline-block",
            alignSelf: "flex-start",
          }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0" }}>React + Vite</span>
          </div>
        </div>

        <div style={{
          flex: 1, borderTop: "2px solid #0A1628", paddingTop: "3vh",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#A0AEC0", marginBottom: "2vh", fontWeight: 500 }}>02</div>
          <h3 style={{ fontSize: "1.8vw", fontWeight: 800, color: "#0A1628", margin: "0 0 2vh 0", letterSpacing: "-0.02em" }}>Strona Klienta</h3>
          <p style={{ fontSize: "1.2vw", color: "#4A5568", lineHeight: 1.6, margin: 0 }}>
            Publiczny landing page. Premium fitness design, pełny formularz ankiety, sukces po wysłaniu.
          </p>
          <div style={{
            marginTop: "auto",
            padding: "1.5vh 1.5vw",
            backgroundColor: "#0A1628",
            display: "inline-block",
            alignSelf: "flex-start",
          }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0" }}>React + Vite</span>
          </div>
        </div>

        <div style={{
          flex: 1, borderTop: "2px solid #E2E8F0", paddingTop: "3vh",
          display: "flex", flexDirection: "column",
          backgroundColor: "#F0F4F8",
          padding: "3vh 2vw",
        }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#A0AEC0", marginBottom: "2vh", fontWeight: 500 }}>03</div>
          <h3 style={{ fontSize: "1.8vw", fontWeight: 800, color: "#0A1628", margin: "0 0 2vh 0", letterSpacing: "-0.02em" }}>API Server</h3>
          <p style={{ fontSize: "1.2vw", color: "#4A5568", lineHeight: 1.6, margin: 0 }}>
            Wspólny backend z bazą PostgreSQL. 12 endpointów REST, walidacja Zod, powiadomienia e-mail.
          </p>
          <div style={{
            marginTop: "auto",
            padding: "1.5vh 1.5vw",
            border: "1px solid #CBD5E0",
            display: "inline-block",
            alignSelf: "flex-start",
          }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#718096" }}>Express + PostgreSQL</span>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: "5vh", left: "5vw", right: "5vw",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid #E2E8F0", paddingTop: "2vh",
      }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0" }}>Deliverables / Panel Trenera</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#0A1628", fontWeight: 600 }}>03</div>
      </div>
    </div>
  );
}
