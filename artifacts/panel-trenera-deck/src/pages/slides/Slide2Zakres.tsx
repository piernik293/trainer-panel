export default function Slide2Zakres() {
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
            Zakres projektu
          </h2>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.2vw", fontWeight: 800, color: "#0A1628", letterSpacing: "-0.02em" }}>
          trener
        </div>
      </div>

      <div style={{ display: "flex", gap: "5vw", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "3vh", minHeight: 0 }}>
          <p style={{ fontSize: "1.5vw", fontWeight: 500, color: "#4A5568", lineHeight: 1.5, margin: 0 }}>
            Trener personalny potrzebował cyfrowego narzędzia do prowadzenia swojej praktyki.
          </p>
          <div style={{ width: "100%", height: "1px", backgroundColor: "#E2E8F0" }} />
          <div style={{ display: "flex", gap: "2vw" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.1vw", color: "#A0AEC0", fontWeight: 600, flexShrink: 0, width: "2.5vw" }}>01</div>
            <p style={{ fontSize: "1.3vw", color: "#0A1628", lineHeight: 1.5, margin: 0, fontWeight: 500 }}>Prowadzenia bazy klientów w jednym miejscu</p>
          </div>
          <div style={{ display: "flex", gap: "2vw" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.1vw", color: "#A0AEC0", fontWeight: 600, flexShrink: 0, width: "2.5vw" }}>02</div>
            <p style={{ fontSize: "1.3vw", color: "#0A1628", lineHeight: 1.5, margin: 0, fontWeight: 500 }}>Zbierania wywiadów treningowych przed współpracą</p>
          </div>
          <div style={{ display: "flex", gap: "2vw" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.1vw", color: "#A0AEC0", fontWeight: 600, flexShrink: 0, width: "2.5vw" }}>03</div>
            <p style={{ fontSize: "1.3vw", color: "#0A1628", lineHeight: 1.5, margin: 0, fontWeight: 500 }}>Szybkiego podglądu ankiet i eksportu do PDF</p>
          </div>
          <div style={{ display: "flex", gap: "2vw" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.1vw", color: "#A0AEC0", fontWeight: 600, flexShrink: 0, width: "2.5vw" }}>04</div>
            <p style={{ fontSize: "1.3vw", color: "#0A1628", lineHeight: 1.5, margin: 0, fontWeight: 500 }}>Publicznej strony — klienci sami wypełniają ankietę</p>
          </div>
        </div>

        <div style={{
          flex: 1, backgroundColor: "#0A1628",
          padding: "4vh 3vw",
          display: "flex", flexDirection: "column", justifyContent: "center",
        }}>
          <h4 style={{
            fontSize: "0.9vw", fontFamily: "'DM Mono', monospace",
            fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
            color: "#A0AEC0", margin: "0 0 3vh 0",
          }}>
            Cel projektu
          </h4>
          <p style={{
            fontSize: "2vw", fontWeight: 800, color: "#FFFFFF",
            lineHeight: 1.25, margin: "0 0 5vh 0", letterSpacing: "-0.02em",
          }}>
            "Jeden system zamiast notatek i arkuszy — dane klientów w jednym miejscu."
          </p>
          <div>
            <div style={{ fontSize: "1vw", fontFamily: "'DM Mono', monospace", color: "#E2E8F0", fontWeight: 500 }}>Panel Trenera</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#718096", marginTop: "0.5vh" }}>Lipiec 2026</div>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: "5vh", left: "5vw", right: "5vw",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid #E2E8F0", paddingTop: "2vh",
      }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0" }}>Zakres projektu / Panel Trenera</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#0A1628", fontWeight: 600 }}>02</div>
      </div>
    </div>
  );
}
