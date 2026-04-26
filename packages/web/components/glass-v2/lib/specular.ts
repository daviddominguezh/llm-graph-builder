interface SpecGeom {
  bufferWidth: number;
  bufferHeight: number;
  radius_: number;
  bezel_: number;
  widthBetweenRadiuses: number;
  heightBetweenRadiuses: number;
  radiusSquared: number;
  radiusPlusOneSquared: number;
  radiusMinusBezelSquared: number;
  dpr: number;
}

function buildSpecularGeometry(
  objectWidth: number,
  objectHeight: number,
  radius: number,
  bezelWidth: number,
  dpr: number
): SpecGeom {
  const bufferWidth = Math.max(1, Math.floor(objectWidth * dpr));
  const bufferHeight = Math.max(1, Math.floor(objectHeight * dpr));
  const radius_ = radius * dpr;
  const bezel_ = bezelWidth * dpr;
  return {
    bufferWidth,
    bufferHeight,
    radius_,
    bezel_,
    widthBetweenRadiuses: bufferWidth - radius_ * 2,
    heightBetweenRadiuses: bufferHeight - radius_ * 2,
    radiusSquared: radius_ ** 2,
    radiusPlusOneSquared: (radius_ + dpr) ** 2,
    radiusMinusBezelSquared: (radius_ - bezel_) ** 2,
    dpr,
  };
}

function specularLocalXY(x1: number, y1: number, g: SpecGeom): [number, number] {
  const onLeft = x1 < g.radius_;
  const onRight = x1 >= g.bufferWidth - g.radius_;
  const onTop = y1 < g.radius_;
  const onBottom = y1 >= g.bufferHeight - g.radius_;
  const x = onLeft ? x1 - g.radius_ : onRight ? x1 - g.radius_ - g.widthBetweenRadiuses : 0;
  const y = onTop ? y1 - g.radius_ : onBottom ? y1 - g.radius_ - g.heightBetweenRadiuses : 0;
  return [x, y];
}

function processSpecularPixel(
  imageData: ImageData,
  x1: number,
  y1: number,
  g: SpecGeom,
  specularVector: [number, number]
): void {
  const [x, y] = specularLocalXY(x1, y1, g);
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
  const sin = -y / distFromCenter;
  const dotProduct = Math.abs(cos * specularVector[0] + sin * specularVector[1]);
  const distFromSide = g.radius_ - distFromCenter;
  const coefficient = dotProduct * Math.sqrt(1 - (1 - distFromSide / g.dpr) ** 2);
  const color = 255 * coefficient;
  const finalOpacity = color * coefficient * opacity;
  const idx = (y1 * g.bufferWidth + x1) * 4;
  imageData.data[idx] = color;
  imageData.data[idx + 1] = color;
  imageData.data[idx + 2] = color;
  imageData.data[idx + 3] = finalOpacity;
}

export function calculateRefractionSpecular(
  objectWidth: number,
  objectHeight: number,
  radius: number,
  bezelWidth: number,
  specularAngle: number = Math.PI / 3,
  dpr?: number
) {
  const devicePixelRatio = dpr ?? (typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1);
  const geom = buildSpecularGeometry(objectWidth, objectHeight, radius, bezelWidth, devicePixelRatio);
  const imageData = new ImageData(geom.bufferWidth, geom.bufferHeight);
  const specularVector: [number, number] = [Math.cos(specularAngle), Math.sin(specularAngle)];
  for (let y1 = 0; y1 < geom.bufferHeight; y1++) {
    for (let x1 = 0; x1 < geom.bufferWidth; x1++) {
      processSpecularPixel(imageData, x1, y1, geom, specularVector);
    }
  }
  return imageData;
}
