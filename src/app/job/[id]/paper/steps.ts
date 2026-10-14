/**
 * Paper pipeline steps — #64 (V3.0.0.2). Five steps became three: "Select
 * Idea" and "Find Papers" merged into Setup, and the separate "Paper Outline"
 * step was dropped in favor of Atlas Plan's outline mode.
 */
export type Step = "setup" | "plan" | "experiments";

export const STEPS: { id: Step; label: string }[] = [
  { id: "setup", label: "Setup" },
  { id: "plan", label: "Plan" },
  { id: "experiments", label: "Experiments" },
];

/** Step ids from before #64, still found in old `?step=` links and `paper-step:<jobId>` cache entries. */
const LEGACY_STEPS: Record<string, Step> = {
  context: "setup",
  papers: "setup",
  outline: "plan",
};

export function resolveStep(value: string | null | undefined): Step | null {
  if (!value) return null;
  if (STEPS.some((s) => s.id === value)) return value as Step;
  return LEGACY_STEPS[value] ?? null;
}
