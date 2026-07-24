import { motion } from "framer-motion";
import SurveyForm from "@/components/SurveyForm";
import heroGym from "@assets/generated_images/hero-gym.jpg";
import { ChevronDown } from "lucide-react";

export default function Home() {
  const scrollToForm = () => {
    document.getElementById("survey-section")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 selection:text-white">
      {/* HERO SECTION */}
      <section className="relative min-h-[100dvh] flex flex-col justify-center overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0 bg-black">
          <img 
            src={heroGym} 
            alt="Elite personal training" 
            className="w-full h-full object-cover object-top opacity-50 mix-blend-luminosity scale-105 motion-safe:animate-[pulse_10s_ease-in-out_infinite_alternate]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background"></div>
          {/* Subtle noise texture */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjAwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44IiBucdW1PY3RhdmVzPSIzIiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsdGVyPSJ1cmwoI24pIiBvcGFjaXR5PSIwLjUiLz48L3N2Zz4=')]"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 w-full max-w-6xl mx-auto px-6 md:px-12 pt-20">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-block mb-6 border border-primary/30 bg-primary/5 px-4 py-1.5 backdrop-blur-sm">
              <span className="text-primary text-sm font-semibold tracking-[0.2em] uppercase">Elitarna Współpraca</span>
            </div>
            
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight mb-8 text-white leading-[1.1]">
              Twój indywidualny plan treningowy zaczyna się tutaj.
            </h1>
            
            <p className="text-lg md:text-2xl text-muted-foreground max-w-3xl mb-12 leading-relaxed font-light">
              Wypełnij krótki wywiad treningowy, dzięki któremu przygotuję plan dopasowany do Twojego celu, poziomu zaawansowania, możliwości oraz stylu życia.
            </p>
            
            <button 
              onClick={scrollToForm}
              className="inline-flex items-center justify-center gap-4 px-10 py-5 bg-primary text-primary-foreground font-semibold text-lg uppercase tracking-wider hover:bg-primary/90 transition-all rounded-none hover:gap-6 group"
            >
              Rozpocznij wywiad treningowy
              <ChevronDown className="w-5 h-5 group-hover:translate-y-1 transition-transform" />
            </button>
          </motion.div>
        </div>

      </section>

      {/* FORM SECTION */}
      <section id="survey-section" className="py-32 px-6 md:px-12 relative z-10 bg-background">
        <div className="max-w-4xl mx-auto">
          <div className="mb-20 text-center">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
              className="text-4xl md:text-5xl font-bold mb-6 tracking-tight"
            >
              Wywiad Treningowy
            </motion.h2>
            <motion.div 
              initial={{ opacity: 0, scaleX: 0 }}
              whileInView={{ opacity: 1, scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="w-24 h-[2px] bg-primary mx-auto origin-left"
            ></motion.div>
            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="mt-8 text-muted-foreground text-lg max-w-2xl mx-auto"
            >
              Odpowiedz na kilka prostych pytań. Dzięki temu przygotuję plan treningowy dopasowany do Twoich potrzeb, możliwości oraz celu treningowego.
            </motion.p>
          </div>
          
          <SurveyForm />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-12 text-center bg-card/50">
        <p className="text-muted-foreground text-sm uppercase tracking-widest">
          © {new Date().getFullYear()} Premium Personal Training. Wszelkie prawa zastrzeżone.
        </p>
      </footer>
    </div>
  );
}