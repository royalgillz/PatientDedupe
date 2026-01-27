import type { Band } from "@/lib/api";

// Charts read the confidence colors from the CSS design tokens instead of keeping a
// second hardcoded copy. That copy is exactly what drifted when the palette was
// darkened for contrast: the badges moved and the charts did not. One source of truth
// keeps "a color means one thing" true across the whole console (CONSOLE-008).

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function bandColors(): Record<Band, string> {
  return {
    match: cssVar("--color-match", "#136e33"),
    review: cssVar("--color-review", "#985108"),
    "no-match": cssVar("--color-miss", "#a81f14"),
  };
}

export const axisInk = () => cssVar("--color-ink-3", "#6f6857");
export const brandTeal = () => cssVar("--color-brand", "#0e7c7b");
