import { Link } from "wouter";
import { LEGAL_DOCUMENTS } from "@workspace/survey-config";

/** Footer links to the legal documents (skeletons, see lib/survey-config/src/legal.ts). */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground ${className}`} aria-label="Dokumenty prawne" data-testid="legal-links">
      {LEGAL_DOCUMENTS.map((d) => (
        <Link key={d.slug} href={`/legal/${d.slug}`} className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground">{d.title}</Link>
      ))}
    </nav>
  );
}
