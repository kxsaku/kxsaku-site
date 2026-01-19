// SNS Design System - Spacing
// Ported from styles.css

export const spacing = {
  xs: 6,     // 0.35rem
  sm: 10,    // 0.6rem
  md: 16,    // 1rem
  lg: 20,    // 1.25rem
  xl: 28,    // 1.75rem
  xxl: 44,
} as const;

export const radius = {
  sm: 14,
  md: 18,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export type SpacingKey = keyof typeof spacing;
export type RadiusKey = keyof typeof radius;
