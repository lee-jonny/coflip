// Draw at Retina resolution, then average the alpha for standard displays.
const BITMAP_SIZE = 36;
const WORDMARK = [
  "011 101 011",
  "100 101 100",
  "100 010 010",
  "100 101 001",
  "011 101 110",
];

function createUsageIcon(nativeImage, usage) {
  const pixels = Buffer.alloc(BITMAP_SIZE * BITMAP_SIZE * 4);
  const draw = (x, y, width, height, alpha) => {
    for (let row = y; row < y + height; row++) {
      for (let column = x; column < x + width; column++) {
        pixels[(row * BITMAP_SIZE + column) * 4 + 3] = alpha;
      }
    }
  };

  const wordmarkTop = usage.length === 0 ? 13 : 5;
  for (const [row, letters] of WORDMARK.entries()) {
    for (const [column, pixel] of [...letters].entries()) {
      if (pixel === "1") draw(7 + column * 2, wordmarkTop + row * 2, 2, 2, 255);
    }
  }

  const trackWidth = 28;
  const barHeight = usage.length === 1 ? 6 : 4;
  const barTop = usage.length === 1 ? 24 : 21;
  for (const [index, { percent }] of usage.entries()) {
    const y = barTop + index * 8;
    draw(4, y, trackWidth, barHeight, 76);
    draw(4, y, Math.round(trackWidth * percent / 100), barHeight, 255);
  }

  const standardSize = BITMAP_SIZE / 2;
  const standardPixels = Buffer.alloc(standardSize * standardSize * 4);
  for (let y = 0; y < standardSize; y++) {
    for (let x = 0; x < standardSize; x++) {
      const top = ((y * 2) * BITMAP_SIZE + x * 2) * 4 + 3;
      const bottom = top + BITMAP_SIZE * 4;
      standardPixels[(y * standardSize + x) * 4 + 3] = Math.round(
        (pixels[top] + pixels[top + 4] + pixels[bottom] + pixels[bottom + 4]) / 4,
      );
    }
  }

  const image = nativeImage.createFromBitmap(standardPixels, { width: standardSize, height: standardSize });
  image.addRepresentation({
    buffer: pixels,
    width: BITMAP_SIZE,
    height: BITMAP_SIZE,
    scaleFactor: 2,
  });
  image.setTemplateImage(true);
  return image;
}

module.exports = { createUsageIcon };
