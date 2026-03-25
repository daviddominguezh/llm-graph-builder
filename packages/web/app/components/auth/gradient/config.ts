import type { GradientConfig } from './types';

// Stripe chroma palette — exact values from the login page
const CHROMA: readonly [string, string, string, string] = ['#a960ee', '#ff333d', '#90e0ff', '#ffcb57'];

export const DARK_CONFIG: GradientConfig = {
  colors: CHROMA,
  darkenTop: false,
};

export const LIGHT_CONFIG: GradientConfig = {
  colors: CHROMA,
  darkenTop: false,
};
