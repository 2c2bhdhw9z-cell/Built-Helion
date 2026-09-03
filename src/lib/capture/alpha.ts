/**
 * Knock near-black void pixels to transparent so a PNG can composite over
 * footage. The engine canvas is opaque; this is a post-process on the still.
 */
export function knockoutVoid(canvas: HTMLCanvasElement, threshold = 12): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i]! <= threshold && d[i + 1]! <= threshold && d[i + 2]! <= threshold) {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
}
