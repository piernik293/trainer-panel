import { useParams, Link } from "wouter";
import { LEGAL_DOCUMENTS, legalDocument, LEGAL_PLACEHOLDER } from "@workspace/survey-config";

/** Legal documents — skeletons to be filled in by a lawyer (public page, no sign-in). */
export default function Legal() {
  const { slug } = useParams<{ slug: string }>();
  const doc = legalDocument(slug);
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Dokumenty">
        {LEGAL_DOCUMENTS.map((d) => (
          <Link key={d.slug} href={`/legal/${d.slug}`} className={d.slug === slug ? "font-semibold text-foreground" : "text-muted-foreground underline underline-offset-2"}>{d.title}</Link>
        ))}
      </nav>
      {!doc ? <p>Nie znaleziono dokumentu.</p> : (
        <article>
          <h1 className="text-2xl font-bold tracking-tight">{doc.title}</h1>
          <p className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-sm" role="note" data-testid="legal-draft-note">
            {LEGAL_PLACEHOLDER}. To jest szkielet dokumentu — treść nie jest ostateczna. Wersja: {doc.version}.
          </p>
          {doc.sections.map((s) => (
            <section key={s.heading} className="mt-6">
              <h2 className="text-lg font-semibold">{s.heading}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </section>
          ))}
        </article>
      )}
    </div>
  );
}
