/**
 * CollapsibleSurveySection + DetailRow
 *
 * "Summary first, details on demand" accordion pattern for client interview
 * sections. The header always shows a title, icon, and an optional status badge
 * (the most important conclusion). Full source values appear inside the
 * expandable body.
 *
 * Accessibility:
 *  - The header button carries aria-expanded and aria-controls.
 *  - Chevron is aria-hidden; the visible label text conveys the state.
 *  - Keyboard-operable via native <button>.
 *
 * Usage rules (from spec):
 *  - NEVER wrap pain warnings, medical contraindications, or blocking errors
 *    in this component — they must remain visible at all times.
 */

import { useState, useId } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";

// ─── Detail row ───────────────────────────────────────────────────────────────

interface DetailRowProps {
  label: string;
  /** Pass null / undefined to suppress the row entirely. */
  value: React.ReactNode;
}

export function DetailRow({ label, value }: DetailRowProps) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/30 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0 min-w-[140px]">{label}</span>
      <span className="text-sm font-medium text-right break-words">{value}</span>
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

interface CollapsibleSurveySectionProps {
  icon: React.ReactNode;
  title: string;
  /**
   * The label for the summary badge (e.g. "Jakość regeneracji").
   * Displayed alongside summaryValue in a pill beside the title.
   */
  summaryLabel?: string;
  /**
   * The value for the summary badge (e.g. "Słaba").
   * Both summaryLabel and summaryValue must be provided for the badge to appear.
   */
  summaryValue?: string;
  /**
   * Tailwind classes for badge background, text, and border colour.
   * Defaults to muted style when not supplied.
   */
  badgeClass?: string;
  children: React.ReactNode;
  /** Forwarded to the root <Card> for testing and automation. */
  "data-testid"?: string;
}

export function CollapsibleSurveySection({
  icon,
  title,
  summaryLabel,
  summaryValue,
  badgeClass,
  children,
  "data-testid": testId,
}: CollapsibleSurveySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();

  const showBadge = Boolean(summaryLabel && summaryValue);

  return (
    <Card
      className="border-border/50 shadow-sm print-break-inside-avoid overflow-hidden"
      data-testid={testId ?? "collapsible-section"}
    >
      {/* ── Toggle button — the whole header row is the click target ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className={[
          "w-full text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          "rounded-t-xl",
          // rounded-b only when collapsed so the card doesn't gain an internal gap
          !expanded && "rounded-b-xl",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex items-center justify-between px-5 py-4 gap-3">
          {/* Left: icon + title + optional status badge */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="shrink-0 text-muted-foreground" aria-hidden="true">
              {icon}
            </span>
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            {showBadge && (
              <span
                className={[
                  "inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border",
                  badgeClass ?? "bg-muted text-muted-foreground border-border/50",
                ].join(" ")}
                data-testid="summary-badge"
              >
                {summaryLabel}: {summaryValue}
              </span>
            )}
          </div>

          {/* Right: expand / collapse label + chevron */}
          <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
            <span className="text-xs" data-testid="toggle-label">
              {expanded ? "Ukryj szczegóły" : "Pokaż szczegóły"}
            </span>
            {expanded ? (
              <ChevronUp size={15} aria-hidden="true" />
            ) : (
              <ChevronDown size={15} aria-hidden="true" />
            )}
          </div>
        </div>
      </button>

      {/* ── Detail body ── */}
      {expanded && (
        <div
          id={bodyId}
          className="border-t border-border/40 px-5 pb-5 pt-4"
          data-testid="section-details"
        >
          {children}
        </div>
      )}
    </Card>
  );
}
