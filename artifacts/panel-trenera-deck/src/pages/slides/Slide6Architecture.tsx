export default function Slide6Architecture() {
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
            width: "23vw", height: "3vh",
            backgroundColor: "#0A1628", opacity: 0.08, zIndex: 0,
          }} />
          <h2 style={{
            fontSize: "3.5vw", fontWeight: 900, color: "#0A1628",
            margin: 0, lineHeight: 1, letterSpacing: "-0.03em",
            position: "relative", zIndex: 1,
          }}>
            Architektura techniczna
          </h2>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1.2vw", fontWeight: 800, color: "#0A1628", letterSpacing: "-0.02em" }}>
          trener
        </div>
      </div>

      <p style={{ fontSize: "1.4vw", fontWeight: 500, color: "#4A5568", lineHeight: 1.5, margin: "0 0 5vh 0", maxWidth: "55vw" }}>
        Nowoczesny, skalowalny stack. Monorepo z pnpm — wspólne typy i schematy między pakietami.
      </p>

      <div style={{ display: "flex", gap: "3vw", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0" }}>
          <div style={{ display: "flex", gap: "2.5vw", alignItems: "center", padding: "2.5vh 0", borderTop: "1px solid #E2E8F0" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85vw", color: "#A0AEC0", width: "8vw", flexShrink: 0, fontWeight: 500 }}>Frontend</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628" }}>React + Vite + Tailwind CSS</span>
              <span style={{ fontSize: "1.1vw", color: "#718096", marginLeft: "1.5vw" }}>shadcn/ui, Wouter, TanStack Query</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "2.5vw", alignItems: "center", padding: "2.5vh 0", borderTop: "1px solid #E2E8F0" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85vw", color: "#A0AEC0", width: "8vw", flexShrink: 0, fontWeight: 500 }}>Backend</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628" }}>Node.js + Express 5</span>
              <span style={{ fontSize: "1.1vw", color: "#718096", marginLeft: "1.5vw" }}>Drizzle ORM, Pino logger, Zod validation</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "2.5vw", alignItems: "center", padding: "2.5vh 0", borderTop: "1px solid #E2E8F0" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85vw", color: "#A0AEC0", width: "8vw", flexShrink: 0, fontWeight: 500 }}>Baza danych</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628" }}>PostgreSQL</span>
              <span style={{ fontSize: "1.1vw", color: "#718096", marginLeft: "1.5vw" }}>Replit managed, migracje Drizzle-kit</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "2.5vw", alignItems: "center", padding: "2.5vh 0", borderTop: "1px solid #E2E8F0" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85vw", color: "#A0AEC0", width: "8vw", flexShrink: 0, fontWeight: 500 }}>API</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628" }}>OpenAPI 3.1 — contract-first</span>
              <span style={{ fontSize: "1.1vw", color: "#718096", marginLeft: "1.5vw" }}>Orval codegen, React Query hooks</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "2.5vw", alignItems: "center", padding: "2.5vh 0", borderTop: "1px solid #E2E8F0", borderBottom: "1px solid #E2E8F0" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85vw", color: "#A0AEC0", width: "8vw", flexShrink: 0, fontWeight: 500 }}>Monorepo</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "1.3vw", fontWeight: 700, color: "#0A1628" }}>pnpm workspace</span>
              <span style={{ fontSize: "1.1vw", color: "#718096", marginLeft: "1.5vw" }}>Wspólne typy TS, schematy Zod, API client</span>
            </div>
          </div>
        </div>

        <div style={{
          width: "22vw",
          backgroundColor: "#0A1628",
          padding: "3vh 2.5vw",
          display: "flex", flexDirection: "column", justifyContent: "center",
          flexShrink: 0,
        }}>
          <h4 style={{
            fontSize: "0.85vw", fontFamily: "'DM Mono', monospace",
            fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
            color: "#A0AEC0", margin: "0 0 3vh 0",
          }}>
            Wspólne pakiety
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#E2E8F0" }}>@workspace/api-spec</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#E2E8F0" }}>@workspace/api-zod</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#E2E8F0" }}>@workspace/api-client-react</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#E2E8F0" }}>@workspace/db</div>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: "5vh", left: "5vw", right: "5vw",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid #E2E8F0", paddingTop: "2vh",
      }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#A0AEC0" }}>Architektura techniczna / Panel Trenera</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", color: "#0A1628", fontWeight: 600 }}>06</div>
      </div>
    </div>
  );
}
