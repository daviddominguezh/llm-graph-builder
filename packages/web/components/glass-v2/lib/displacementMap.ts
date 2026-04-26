type RefractFn = (normalX: number, normalY: number) => [number, number] | null;

function makeRefract(eta: number): RefractFn {
  return (normalX, normalY) => {
    const dot = normalY;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) {
      return null;
    }
    const kSqrt = Math.sqrt(k);
    return [-(eta * dot + kSqrt) * normalX, eta - (eta * dot + kSqrt) * normalY];
  };
}

function sampleBezelDisplacement(
  x: number,
  refract: RefractFn,
  bezelHeightFn: (x: number) => number,
  bezelWidth: number,
  glassThickness: number
): number {
  const y = bezelHeightFn(x);
  const dx = x < 1 ? 0.0001 : -0.0001;
  const y2 = bezelHeightFn(x + dx);
  const derivative = (y2 - y) / dx;
  const magnitude = Math.sqrt(derivative * derivative + 1);
  const refracted = refract(-derivative / magnitude, -1 / magnitude);
  if (!refracted) {
    return 0;
  }
  const remainingHeight = y * bezelWidth + glassThickness;
  return refracted[0] * (remainingHeight / refracted[1]);
}

export function calculateDisplacementMap(
  glassThickness = 200,
  bezelWidth = 50,
  bezelHeightFn: (x: number) => number = (x) => x,
  refractiveIndex = 1.5,
  samples = 128
): number[] {
  const refract = makeRefract(1 / refractiveIndex);
  return Array.from({ length: samples }, (_, i) =>
    sampleBezelDisplacement(i / samples, refract, bezelHeightFn, bezelWidth, glassThickness)
  );
}

interface Geom {
  bufferWidth: number;
  bufferHeight: number;
  objectWidth_: number;
  objectHeight_: number;
  objectX: number;
  objectY: number;
  radius_: number;
  bezel_: number;
  widthBetweenRadiuses: number;
  heightBetweenRadiuses: number;
  radiusSquared: number;
  radiusPlusOneSquared: number;
  radiusMinusBezelSquared: number;
}

function buildGeometry(
  canvasWidth: number,
  canvasHeight: number,
  objectWidth: number,
  objectHeight: number,
  radius: number,
  bezelWidth: number,
  dpr: number
): Geom {
  const bufferWidth = Math.max(1, Math.floor(canvasWidth * dpr));
  const bufferHeight = Math.max(1, Math.floor(canvasHeight * dpr));
  const objectWidth_ = objectWidth * dpr;
  const objectHeight_ = objectHeight * dpr;
  const radius_ = radius * dpr;
  const bezel_ = bezelWidth * dpr;
  return {
    bufferWidth,
    bufferHeight,
    objectWidth_,
    objectHeight_,
    objectX: (bufferWidth - objectWidth_) / 2,
    objectY: (bufferHeight - objectHeight_) / 2,
    radius_,
    bezel_,
    widthBetweenRadiuses: objectWidth_ - radius_ * 2,
    heightBetweenRadiuses: objectHeight_ - radius_ * 2,
    radiusSquared: radius_ ** 2,
    radiusPlusOneSquared: (radius_ + 1) ** 2,
    radiusMinusBezelSquared: (radius_ - bezel_) ** 2,
  };
}

function localBezelXY(x1: number, y1: number, g: Geom): [number, number] {
  const onLeft = x1 < g.radius_;
  const onRight = x1 >= g.objectWidth_ - g.radius_;
  const onTop = y1 < g.radius_;
  const onBottom = y1 >= g.objectHeight_ - g.radius_;
  const x = onLeft ? x1 - g.radius_ : onRight ? x1 - g.radius_ - g.widthBetweenRadiuses : 0;
  const y = onTop ? y1 - g.radius_ : onBottom ? y1 - g.radius_ - g.heightBetweenRadiuses : 0;
  return [x, y];
}

function processBezelPixel(
  imageData: ImageData,
  x1: number,
  y1: number,
  g: Geom,
  samples: number[],
  maximumDisplacement: number
): void {
  const [x, y] = localBezelXY(x1, y1, g);
  const distSq = x * x + y * y;
  if (distSq > g.radiusPlusOneSquared || distSq < g.radiusMinusBezelSquared) {
    return;
  }
  const distFromCenter = Math.sqrt(distSq);
  const innerRadius = Math.sqrt(g.radiusSquared);
  const outerRadius = Math.sqrt(g.radiusPlusOneSquared);
  const opacity =
    distSq < g.radiusSquared ? 1 : 1 - (distFromCenter - innerRadius) / (outerRadius - innerRadius);
  const cos = x / distFromCenter;
  const sin = y / distFromCenter;
  const bezelIndex = (((g.radius_ - distFromCenter) / g.bezel_) * samples.length) | 0;
  const distance = samples[bezelIndex] ?? 0;
  const dX = (-cos * distance) / maximumDisplacement;
  const dY = (-sin * distance) / maximumDisplacement;
  const idx = ((g.objectY + y1) * g.bufferWidth + g.objectX + x1) * 4;
  imageData.data[idx] = 128 + dX * 127 * opacity;
  imageData.data[idx + 1] = 128 + dY * 127 * opacity;
  imageData.data[idx + 2] = 0;
  imageData.data[idx + 3] = 255;
}

export function calculateDisplacementMap2(
  canvasWidth: number,
  canvasHeight: number,
  objectWidth: number,
  objectHeight: number,
  radius: number,
  bezelWidth: number,
  maximumDisplacement: number,
  precomputedDisplacementMap: number[] = [],
  dpr?: number
) {
  const devicePixelRatio = dpr ?? (typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1);
  const geom = buildGeometry(
    canvasWidth,
    canvasHeight,
    objectWidth,
    objectHeight,
    radius,
    bezelWidth,
    devicePixelRatio
  );
  const imageData = new ImageData(geom.bufferWidth, geom.bufferHeight);
  new Uint32Array(imageData.data.buffer).fill(0xff008080);
  for (let y1 = 0; y1 < geom.objectHeight_; y1++) {
    for (let x1 = 0; x1 < geom.objectWidth_; x1++) {
      processBezelPixel(imageData, x1, y1, geom, precomputedDisplacementMap, maximumDisplacement);
    }
  }
  return imageData;
}
