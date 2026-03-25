export interface GradientConfig {
  readonly colors: readonly [string, string, string, string];
  readonly darkenTop: boolean;
}

export interface GradientHandle {
  destroy: () => void;
}
