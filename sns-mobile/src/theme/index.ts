// SNS Design System - Theme Index
export { colors } from './colors';
export { spacing, radius } from './spacing';
export { typography } from './typography';

import { colors } from './colors';
import { spacing, radius } from './spacing';
import { typography } from './typography';

export const theme = {
  colors,
  spacing,
  radius,
  typography,
} as const;

export type Theme = typeof theme;
