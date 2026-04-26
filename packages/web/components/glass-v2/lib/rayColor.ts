export function getRayColor(intensity: number): string {
  const hue = 180 + Math.abs(intensity) * 85;
  return `hsl(${hue},88%,54%)`;
}

export function getRayColorDimmed(intensity: number): string {
  const hue = 180 + Math.abs(intensity) * 85;
  return `hsl(${hue},76%,45%)`;
}
