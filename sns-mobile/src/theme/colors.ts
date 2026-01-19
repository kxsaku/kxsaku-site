// SNS Design System - Colors
// Ported from styles.css

export const colors = {
  // Backgrounds
  bgPrimary: '#050315',
  bgSecondary: '#020010',
  bgGradient: ['#342067', '#050315', '#020010'] as const,

  // Surfaces
  surfaceCard: 'rgba(9, 6, 34, 0.9)',
  surfaceGlass: 'rgba(10, 6, 28, 0.42)',
  surfaceInput: 'rgba(9, 6, 34, 0.95)',
  surfaceBtn: 'rgba(15, 10, 55, 0.80)',
  surfaceBtnSoft: 'rgba(15, 10, 55, 0.55)',

  // Text
  textPrimary: '#f4f0ff',
  textMuted: 'rgba(244, 240, 255, 0.72)',
  textMuted2: 'rgba(244, 240, 255, 0.55)',
  textLabel: '#cfc8ff',
  textSub: '#bdb7ff',

  // Accent
  accent: '#b37cff',
  accentSoft: 'rgba(179, 124, 255, 0.18)',
  accentBorder: 'rgba(179, 124, 255, 0.45)',

  // Status
  success: '#6cffb0',
  error: '#ff6262',
  warning: '#ffd45a',
  info: '#7bb8ff',

  // Borders
  border: 'rgba(129, 118, 255, 0.35)',
  borderSubtle: 'rgba(129, 118, 255, 0.18)',
  borderCard: 'rgba(130, 106, 255, 0.3)',
  borderInput: 'rgba(129, 118, 255, 0.35)',

  // Glow
  glowAccent: 'rgba(125, 95, 255, 0.22)',

  // Additional UI colors
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const;

export type ColorKey = keyof typeof colors;
