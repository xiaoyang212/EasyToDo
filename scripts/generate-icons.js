const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'build');
const outputPath = path.join(outputDir, 'icon.ico');
const sizes = [16, 24, 32, 48, 64, 128, 256];

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function roundedRectAlpha(x, y, size, radius) {
  const centerX = clamp(x, radius, size - radius);
  const centerY = clamp(y, radius, size - radius);
  const distance = Math.hypot(x - centerX, y - centerY);
  return clamp(radius + 0.8 - distance, 0, 1);
}

function strokeAlpha(x, y, points, width) {
  let alpha = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(x, y, points[index][0], points[index][1], points[index + 1][0], points[index + 1][1]);
    alpha = Math.max(alpha, clamp((width / 2 + 0.9 - distance), 0, 1));
  }
  return alpha;
}

function blend(base, overlay, alpha) {
  return [
    mix(base[0], overlay[0], alpha),
    mix(base[1], overlay[1], alpha),
    mix(base[2], overlay[2], alpha),
    255
  ];
}

function drawIcon(size) {
  const radius = size * 0.22;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = x / (size - 1);
      const ny = y / (size - 1);
      const alpha = roundedRectAlpha(x + 0.5, y + 0.5, size, radius);
      const shine = Math.max(0, 1 - Math.hypot(nx - 0.18, ny - 0.08) * 1.5);
      let color = [
        mix(18, 20, ny),
        mix(36, 45, ny),
        mix(53, 70, ny)
      ];
      color = blend(color, [61, 214, 154, 255], shine * 0.32);

      const cardAlpha = roundedRectAlpha(x - size * 0.23, y - size * 0.18, size * 0.74, size * 0.09);
      if (x > size * 0.18 && x < size * 0.82 && y > size * 0.22 && y < size * 0.77) {
        color = blend(color, [255, 255, 255, 255], cardAlpha * 0.12);
      }

      const check = strokeAlpha(x, y, [
        [size * 0.23, size * 0.53],
        [size * 0.37, size * 0.67],
        [size * 0.72, size * 0.31]
      ], size * 0.12);
      color = blend(color, [141, 224, 186, 255], check);

      const lineWidth = size * 0.06;
      for (const lineY of [0.45, 0.58, 0.71]) {
        const line = strokeAlpha(x, y, [
          [size * 0.48, size * lineY],
          [size * 0.76, size * lineY]
        ], lineWidth);
        color = blend(color, [246, 250, 252, 255], line * 0.9);
      }

      const edge = alpha < 1 ? alpha : 1;
      const offset = (y * size + x) * 4;
      pixels[offset] = color[2];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[0];
      pixels[offset + 3] = Math.round(255 * edge);
    }
  }

  return pixels;
}

function createDib(size) {
  const pixels = drawIcon(size);
  const xorSize = size * size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const maskSize = maskStride * size;
  const header = Buffer.alloc(40);
  const xor = Buffer.alloc(xorSize);
  const mask = Buffer.alloc(maskSize);

  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(xorSize, 20);

  for (let y = 0; y < size; y += 1) {
    const sourceY = size - 1 - y;
    const sourceStart = sourceY * size * 4;
    const targetStart = y * size * 4;
    pixels.copy(xor, targetStart, sourceStart, sourceStart + size * 4);
  }

  return Buffer.concat([header, xor, mask]);
}

function createIco() {
  const images = sizes.map((size) => ({ size, data: createDib(size) }));
  const header = Buffer.alloc(6);
  const directory = Buffer.alloc(images.length * 16);
  let offset = 6 + directory.length;

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  images.forEach((image, index) => {
    const entry = index * 16;
    directory[entry] = image.size === 256 ? 0 : image.size;
    directory[entry + 1] = image.size === 256 ? 0 : image.size;
    directory[entry + 2] = 0;
    directory[entry + 3] = 0;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, createIco());
console.log(`Generated ${outputPath}`);
