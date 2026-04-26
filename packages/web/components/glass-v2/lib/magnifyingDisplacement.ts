export function calculateMagnifyingDisplacementMap(canvasWidth: number, canvasHeight: number) {
  const devicePixelRatio = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
  const bufferWidth = Math.max(1, Math.floor(canvasWidth * devicePixelRatio));
  const bufferHeight = Math.max(1, Math.floor(canvasHeight * devicePixelRatio));
  const imageData = new ImageData(bufferWidth, bufferHeight);
  const ratio = Math.max(bufferWidth / 2, bufferHeight / 2);

  for (let y1 = 0; y1 < bufferHeight; y1++) {
    for (let x1 = 0; x1 < bufferWidth; x1++) {
      const idx = (y1 * bufferWidth + x1) * 4;
      const rX = (x1 - bufferWidth / 2) / ratio;
      const rY = (y1 - bufferHeight / 2) / ratio;
      imageData.data[idx] = 128 - rX * 127;
      imageData.data[idx + 1] = 128 - rY * 127;
      imageData.data[idx + 2] = 0;
      imageData.data[idx + 3] = 255;
    }
  }
  return imageData;
}
