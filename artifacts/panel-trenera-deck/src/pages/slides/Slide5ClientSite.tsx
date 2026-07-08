export default function Slide5ClientSite() {
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
            width: "24vw", height: "3vh",
            backgroundColor: "#0A1628", opacity: 0.08, zIndex: 0,
          }} />
          <h2 style={{
            fontSize: "3.5vw", fontWeight: 900, color: "#0A1628",
            margin: 0, lineHeight: 1, letterSpacing: "-0.03em",
            position: "relative", zIndex: 1,
          }}>
            Strona Klienta
          </h2>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.2vw", fontWeight: 800, color: "#0A1628", letterSpacing: "-0.02em" }}>
          trener
        </div>
      </div>

      <div style={{ display: "flex", gap: "5vw", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2.5vh" }}>
          <p style={{ fontSize: "1.3vw", fontWeight: 500, color: "#4A5568", lineHeight: 1.5, margin: 0 }}>
            Publiczny landing page — klient otwiera link i samodzielnie wypełnia ankietę.
          </p>
          <div style={{ width: "100%", height: "1px", backgroundColor: "#E2E8F0" }} />

          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#A0AEC0", fontWeight: 500, flexShrink: 0, width: "2.5vw" }}>01</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628", margin: "0 0 0.5vh 0" }}>Premium fitness design</h3>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", lineHeight: 1.5, margin: 0 }}>Ciemny motyw, eleganckie akcenty, responsywny na telefon i komputer</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#A0AEC0", fontWeight: 500, flexShrink: 0, width: "2.5vw" }}>02</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628", margin: "0 0 0.5vh 0" }}>13-sekcjowy wywiad</h3>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", lineHeight: 1.5, margin: 0 }}>Cel, doświadczenie, zdrowie, preferencje, metody zaawansowane</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#A0AEC0", fontWeight: 500, flexShrink: 0, width: "2.5vw" }}>03</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628", margin: "0 0 0.5vh 0" }}>Automatyczny zapis</h3>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", lineHeight: 1.5, margin: 0 }}>Dane trafiają do bazy i panelu trenera w czasie rzeczywistym</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#A0AEC0", fontWeight: 500, flexShrink: 0, width: "2.5vw" }}>04</div>
            <div>
              <h3 style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628", margin: "0 0 0.5vh 0" }}>Powiadomienie e-mail</h3>
              <p style={{ fontSize: "1.1vw", color: "#4A5568", lineHeight: 1.5, margin: 0 }}>Opcjonalne powiadomienie do trenera o nowym zgłoszeniu</p>
            </div>
          </div>
        </div>

        <div style={{
          flex: 1, border: "1px solid #E2E8F0",
          padding: "4vh 3vw",
          display: "flex", flexDirection: "column",
          backgroundColor: "#FFFFFF",
        }}>
          <h4 style={{
            fontSize: "0.9vw", fontFamily: "'DM Mono', monospace",
            fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
            color: "#A0AEC0", margin: "0 0 3vh 0",
          }}>
            Hero strony klienta
          </h4>
          <div style={{
            flex: 1,
            backgroundColor: "#0A1628",
            padding: "3vh 2.5vw",
            display: "flex", flexDirection: "column", justifyContent: "center",
          }}>
            <p style={{
              fontSize: "1.6vw", fontWeight: 800, color: "#FFFFFF",
              lineHeight: 1.3, margin: "0 0 2vh 0", letterSpacing: "-0.02em",
            }}>
              "Indywidualny plan treningowy dopasowany do Twojego celu"
            </p>
            <p style={{ fontSize: "1vw", color: "#A0AEC0", lineHeight: 1.5, margin: "0 0 3vh 0" }}>
              Przed rozpoczęciem współpracy wypełnij krótką ankietę.
            </p>
            <div style={{
              padding: "1.2vh 2vw",
              backgroundColor: "#C9A84C",
              display: "inline-block",
              alignSelf: "flex-start",
            }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#0A1628", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Rozpocznij ankietę
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: "5vh", left: "5vw", right: "5vw",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid #E2E8F0", paddingTop: "2vh",
      }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0" }}>Strona Klienta — publiczny formularz</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#0A1628", fontWeight: 600 }}>05</div>
      </div>
    </div>
  );
}
