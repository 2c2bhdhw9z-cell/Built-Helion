/** Sample an image into unit-square particles. Phase encodes brightness. */

export type ImageSample = { x: number; y: number; phase: number };

export function sampleImageData(data: ImageData, maxCount: number): ImageSample[] {
  const { width, height, data: px } = data;
  if (width < 1 || height < 1) return [];
  const want = Math.max(50, Math.min(maxCount, width * height));
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / want)));
  const out: ImageSample[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = px[i] ?? 0;
      const g = px[i + 1] ?? 0;
      const b = px[i + 2] ?? 0;
      const a = px[i + 3] ?? 0;
      if (a < 16) continue;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (lum < 0.04) continue;
      out.push({
        x: (x + 0.5) / width,
        y: (y + 0.5) / height,
        phase: (r / 255) * 0.3 + (g / 255) * 0.4 + (b / 255) * 0.3,
      });
      if (out.length >= maxCount) return out;
    }
  }
  return out;
}

export async function sampleImageFile(file: Blob, maxCount: number): Promise<ImageSample[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image"));
      el.src = url;
    });
    const w = Math.min(512, img.naturalWidth || img.width);
    const h = Math.min(512, img.naturalHeight || img.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return sampleImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), maxCount);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function sampleVideoElement(video: HTMLVideoElement, maxCount: number): Promise<ImageSample[]> {
  if (video.readyState < 2) return [];
  const w = Math.min(512, video.videoWidth || 320);
  const h = Math.min(512, video.videoHeight || 180);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return sampleImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), maxCount);
}
