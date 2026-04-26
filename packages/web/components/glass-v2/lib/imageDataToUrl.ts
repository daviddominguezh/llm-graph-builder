export function imageDataToUrl(imageData: ImageData): string {
  const { width, height } = imageData;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('Failed to get canvas context');
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}
