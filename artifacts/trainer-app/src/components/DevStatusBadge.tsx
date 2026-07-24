/**
 * DevStatusBadge — small, unobtrusive badge for features not yet complete.
 *
 * Usage:
 *   <DevStatusBadge feature="cardio_section" />
 *
 * The badge reads its status from the central `featureStatuses` registry in
 * `src/lib/featureStatus.ts`. When the feature is marked "ready" (or not
 * listed), this component renders nothing. Remove the entry from the registry
 * to make the badge disappear without touching this file or any consumer.
 */

import { getFeatureStatus, type FeatureStatus } from "@/lib/featureStatus";

const TOOLTIP_TEXT =
  "Funkcja jest nadal rozwijana. Jej wygląd lub działanie może się jeszcze zmienić.";

interface LabelConfig {
  label: string;
  className: string;
}

const STATUS_CONFIG: Record<Exclude<FeatureStatus, "ready">, LabelConfig> = {
  in_progress: {
    label: "W trakcie",
    className:
      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium " +
      "bg-amber-50 text-amber-700 border border-amber-200 leading-none",
  },
  planned: {
    label: "Planowane",
    className:
      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium " +
      "bg-slate-100 text-slate-500 border border-slate-200 leading-none",
  },
};

interface DevStatusBadgeProps {
  /** Key from the `featureStatuses` registry in `src/lib/featureStatus.ts`. */
  feature: string;
}

export function DevStatusBadge({ feature }: DevStatusBadgeProps) {
  const status = getFeatureStatus(feature);
  if (status === "ready") return null;

  const config = STATUS_CONFIG[status];

  return (
    <span className={config.className} title={TOOLTIP_TEXT}>
      {config.label}
    </span>
  );
}
