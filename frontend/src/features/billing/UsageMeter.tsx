import { UsageSummary } from "../../types";

interface UsageMeterProps {
  label: string;
  used: number;
  limit: number;
  unit?: string;
}

export function UsageMeter({ label, used, limit, unit }: UsageMeterProps) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const suffix = unit ? ` ${unit}` : "";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-slate-600">
          {used}
          {suffix} / {limit}
          {suffix}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        className="h-2 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={`h-full rounded-full ${percent >= 100 ? "bg-red-500" : "brand-gradient"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function UsageMeters({ usage }: { usage: UsageSummary }) {
  return (
    <div className="grid gap-4">
      <UsageMeter label="AI messages" used={usage.aiMessages.used} limit={usage.aiMessages.limit} />
      <UsageMeter label="Uploads" used={usage.uploads.used} limit={usage.uploads.limit} />
      <UsageMeter label="Storage" used={usage.storageMb.used} limit={usage.storageMb.limit} unit="MB" />
    </div>
  );
}
