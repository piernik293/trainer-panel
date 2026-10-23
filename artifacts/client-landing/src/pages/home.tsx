import { motion } from "framer-motion";
import { Link2 } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-brand-soft">
      {/* HERO SECTION */}
      <section className="relative min-h-[80dvh] flex flex-col justify-center">
        {/* Content */}
        <div className="relative z-10 w-full max-w-6xl mx-auto px-6 md:px-12 pt-20">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-block mb-6 rounded-sm bg-brand-soft px-3 py-1">
              <span className="section-label !text-primary">Elitarna Współpraca</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6 text-foreground leading-[1.1]">
              Twój indywidualny plan treningowy zaczyna się tutaj.
            </h1>
            
            <p className="text-base md:text-xl text-muted-foreground max-w-3xl mb-10 leading-relaxed">
              Aby wypełnić wywiad treningowy, potrzebujesz indywidualnego linku zaproszeniowego od swojego trenera.
            </p>

            <div className="inline-flex items-center gap-3 px-8 py-5 border border-border rounded-lg bg-card backdrop-blur-sm text-muted-foreground text-base">
              <Link2 className="w-5 h-5 text-primary shrink-0" />
              <span>
                Poproś swojego trenera o link zaproszeniowy do wywiadu treningowego.
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-12 text-center bg-card">
        <p className="section-label">
          © {new Date().getFullYear()} Premium Personal Training. Wszelkie prawa zastrzeżone.
        </p>
      </footer>
    </div>
  );
}
