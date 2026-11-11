// Pryntor theme for Astryx. INTERIM v0 (2026/11/11).
// Drafted from existing notes only: dark, restrained, no approved Pryntor palette or typeface exists yet
// (see docs/brand guardrails), so this uses cool neutral greys, a near-white accent and the system font
// stack (no web-font fetch: R0 and no third-party requests). Product accents (e.g. Exchange red) are set
// per product below, not here. Accent fails 4.5:1 as text on dark surfaces, so links use color="primary". Lebohang Loliwe approves any change to brand values.
import {defineTheme} from '@astryxdesign/core/theme';

export const pryntorTheme = defineTheme({
  name: 'pryntor-interim',
  color: {neutralStyle: 'cool', contrast: 'high'},
  typography: {
    scale: {base: 14, ratio: 1.2},
    body: {family: 'system-ui', fallbacks: '-apple-system, "Segoe UI", Roboto, Arial, sans-serif'},
    heading: {weight: 'semibold', weights: {1: 'semibold', 2: 'semibold'}},
    code: {family: 'ui-monospace', fallbacks: '"SF Mono", Menlo, Consolas, monospace'},
  },
  radius: {base: 4, multiplier: 1},
  motion: {tempo: 0.85, character: 'crisp'},
  tokens: {
    '--color-background-body': ['#F4F5F6', '#121416'],
    '--color-background-surface': ['#FFFFFF', '#171A1D'],
    '--color-background-card': ['#FFFFFF', '#202326'],
    '--color-border': ['#D5D9DC', '#33393E'],
    '--color-accent': ['#121416', '#E8EAEC'],
    '--color-on-accent': ['#FFFFFF', '#121416'],
    '--color-accent-muted': ['#1214161A', '#E8EAEC1F'],
    '--focus-outline-color': 'var(--color-accent)',
  },
});

// Pryntor Exchange: same base, product accent from the shipped Exchange preview (#d13d32), dark only.
export const exchangeTheme = defineTheme({
  name: 'pryntor-exchange-interim',
  extends: pryntorTheme,
  tokens: {
    '--color-accent': ['#B5322A', '#D13D32'],
    '--color-on-accent': ['#FFFFFF', '#FFFFFF'],
    '--color-accent-muted': ['#1214161A', '#E8EAEC1F'],
    '--focus-outline-color': ['#B5322A', '#E8EAEC'],
  },
});
