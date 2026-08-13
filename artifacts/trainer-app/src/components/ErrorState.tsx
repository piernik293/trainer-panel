/**
 * ErrorState — the one consistent, user-friendly error panel.
 * Neutral wording, accessible (role="alert"), optional retry/back actions.
 */

import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface ErrorStateProps {
  /** Short neutral heading. Defaults to "Nie udało się wykonać tej operacji". */
  title?: string;
  /** Safe, already-humanized explanation (use humanizeError). */
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Back action: href for a Link, or a callback. */
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
}

export function ErrorState({
  title = "Nie udało się wykonać tej operacji",
  message,
  onRetry,
  retryLabel = "Spróbuj ponownie",
  backHref,
  onBack,
  backLabel = "Wróć",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-border/60 bg-muted/20 px-6 py-8 text-center max-w-lg mx-auto space-y-3"
    >
      <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" aria-hidden="true" />
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-2 justify-center pt-1">
        {onRetry && (
          <Button size="sm" onClick={onRetry} className="gap-1.5">
            <RefreshCw size={14} />
            {retryLabel}
          </Button>
        )}
        {backHref ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href={backHref}>
              <ArrowLeft size={14} />
              {backLabel}
            </Link>
          </Button>
        ) : onBack ? (
          <Button size="sm" variant="outline" onClick={onBack} className="gap-1.5">
            <ArrowLeft size={14} />
            {backLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
