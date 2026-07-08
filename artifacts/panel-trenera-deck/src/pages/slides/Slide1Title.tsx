export default function Slide1Title() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{
        backgroundColor: "#F8F9FC",
        fontFamily: "'Inter', sans-serif",
        boxSizing: "border-box",
        padding: "5vh 5vw",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: "1.5vw", fontWeight: 800, color: "#0A1628", letterSpacing: "-0.02em", fontFamily: "'DM Mono', monospace" }}>
          trener
        </div>
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "0.9vw",
          color: "#4A5568",
          display: "flex",
          flexDirection: "column",
          gap: "1vh",
          textAlign: "right",
        }}>
          <div><span style={{ color: "#A0AEC0", marginRight: "1vw" }}>Projekt:</span>Panel Trenera</div>
          <div><span style={{ color: "#A0AEC0", marginRight: "1vw" }}>Data:</span>Lipiec 2026</div>
          <div><span style={{ color: "#A0AEC0", marginRight: "1vw" }}>Status:</span>Gotowy do wdrożenia</div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "15vh", left: "5vw", width: "90vw" }}>
        <div style={{ position: "relative" }}>
          <div style={{
            position: "absolute",
            left: "-2vw",
            top: "2vh",
            width: "36vw",
            height: "5vh",
            backgroundColor: "#0A1628",
            opacity: 0.08,
            zIndex: 0,
          }} />
          <h1 style={{
            fontSize: "8vw",
            fontWeight: 900,
            color: "#0A1628",
            margin: 0,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            position: "relative",
            zIndex: 1,
          }}>
            Panel Trenera
          </h1>
        </div>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: "6vh",
        }}>
          <p style={{
            fontSize: "1.8vw",
            fontWeight: 500,
            color: "#4A5568",
            margin: 0,
            maxWidth: "55vw",
            lineHeight: 1.4,
          }}>
            Aplikacja do zarządzania klientami trenera personalnego.
          </p>
          <div style={{ width: "30vw", height: "1px", backgroundColor: "#E2E8F0" }} />
        </div>
      </div>
    </div>
  );
}
