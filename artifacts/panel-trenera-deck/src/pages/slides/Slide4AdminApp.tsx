export default function Slide4AdminApp() {
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
            width: "28vw", height: "3vh",
            backgroundColor: "#0A1628", opacity: 0.08, zIndex: 0,
          }} />
          <h2 style={{
            fontSize: "3.5vw", fontWeight: 900, color: "#0A1628",
            margin: 0, lineHeight: 1, letterSpacing: "-0.03em",
            position: "relative", zIndex: 1,
          }}>
            Panel Trenera
          </h2>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.2vw", fontWeight: 800, color: "#0A1628", letterSpacing: "-0.02em" }}>
          trener
        </div>
      </div>

      <div style={{ display: "flex", gap: "5vw", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2.5vh" }}>
          <p style={{ fontSize: "1.3vw", fontWeight: 500, color: "#4A5568", lineHeight: 1.5, margin: 0 }}>
            Prywatna aplikacja administracyjna — dostępna wyłącznie dla trenera.
          </p>
          <div style={{ width: "100%", height: "1px", backgroundColor: "#E2E8F0" }} />

          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#A0AEC0", fontWeight: 500, flexShrink: 0, width: "2.5vw" }}>01</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628", margin: "0 0 0.5vh 0" }}>Pulpit statystyk</h3>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", lineHeight: 1.5, margin: 0 }}>Liczba klientów, % wypełnionych ankiet, ostatnio dodani</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#A0AEC0", fontWeight: 500, flexShrink: 0, width: "2.5vw" }}>02</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628", margin: "0 0 0.5vh 0" }}>Lista klientów</h3>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", lineHeight: 1.5, margin: 0 }}>Wyszukiwarka, status ankiety, dodawanie i edycja</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#A0AEC0", fontWeight: 500, flexShrink: 0, width: "2.5vw" }}>03</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628", margin: "0 0 0.5vh 0" }}>Profil klienta</h3>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", lineHeight: 1.5, margin: 0 }}>Dane osobowe i pełny podgląd wywiadu treningowego</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#A0AEC0", fontWeight: 500, flexShrink: 0, width: "2.5vw" }}>04</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628", margin: "0 0 0.5vh 0" }}>Eksport do PDF</h3>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", lineHeight: 1.5, margin: 0 }}>Przycisk "Drukuj" — ankieta gotowa do wydruku lub zapisu</p>
            </div>
          </div>
        </div>

        <div style={{
          flex: 1, backgroundColor: "#0A1628",
          padding: "4vh 3vw",
          display: "flex", flexDirection: "column",
        }}>
          <h4 style={{
            fontSize: "0.9vw", fontFamily: "'DM Mono', monospace",
            fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
            color: "#A0AEC0", margin: "0 0 4vh 0",
          }}>
            Aplikacja administracyjna
          </h4>

          <div style={{ display: "flex", flexDirection: "column", gap: "3vh" }}>
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "3vh" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "4.5vw", fontWeight: 900, color: "#FFFFFF", lineHeight: 1, letterSpacing: "-0.04em" }}>
                5+
              </div>
              <div style={{ fontSize: "1.1vw", color: "#A0AEC0", marginTop: "1vh" }}>stron i widoków</div>
            </div>
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "3vh" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "4.5vw", fontWeight: 900, color: "#FFFFFF", lineHeight: 1, letterSpacing: "-0.04em" }}>
                100%
              </div>
              <div style={{ fontSize: "1.1vw", color: "#A0AEC0", marginTop: "1vh" }}>dane z prawdziwej bazy</div>
            </div>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "4.5vw", fontWeight: 900, color: "#FFFFFF", lineHeight: 1, letterSpacing: "-0.04em" }}>
                PDF
              </div>
              <div style={{ fontSize: "1.1vw", color: "#A0AEC0", marginTop: "1vh" }}>eksport jednym kliknięciem</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: "5vh", left: "5vw", right: "5vw",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid #E2E8F0", paddingTop: "2vh",
      }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0" }}>Panel Trenera — aplikacja administracyjna</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#0A1628", fontWeight: 600 }}>04</div>
      </div>
    </div>
  );
}
