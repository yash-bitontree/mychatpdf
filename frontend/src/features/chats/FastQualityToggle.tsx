import { ChatModelTier } from "../../types";

const tiers: Array<{ value: ChatModelTier; label: string }> = [
  { value: "fast", label: "Fast" },
  { value: "quality", label: "Quality" }
];

export function chatModelTier(model?: string | null): ChatModelTier {
  return model === "quality" ? "quality" : "fast";
}

export function FastQualityToggle({
  value,
  onChange,
  disabled = false,
  qualityAvailable,
  onQualityUnavailable
}: {
  value: ChatModelTier;
  onChange: (tier: ChatModelTier) => void;
  disabled?: boolean;
  qualityAvailable?: boolean;
  onQualityUnavailable?: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Answer quality"
      className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5"
    >
      {tiers.map(({ value: tier, label }) => {
        const isActive = value === tier;

        return (
          <button
            key={tier}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => {
              if (tier === "quality" && qualityAvailable === false) {
                onQualityUnavailable?.();
                return;
              }

              onChange(tier);
            }}
            className={`min-h-8 rounded-full px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isActive ? "bg-white text-sea shadow-sm ring-1 ring-teal-100" : "text-slate-600 hover:text-ink"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
