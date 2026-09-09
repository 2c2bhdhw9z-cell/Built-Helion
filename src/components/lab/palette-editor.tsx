import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import {
  colorsToStops,
  normalizeStops,
  quantizeColors,
  sampleStopsN,
  type PaletteStop,
} from "@/engine/palette-stops";

/**
 * Multi-stop palette editor (Item 5). Builds a custom ramp of N color stops on
 * top of the pure palette-stops module (normalize / sample / bake) and an
 * "extract from image" that samples dominant colors from an uploaded image.
 *
 * The pixel READ needs a canvas so it lives here; the pure BUCKETING/SELECTION
 * is `quantizeColors`, which is unit-tested. When 2+ stops exist they drive the
 * renderers via params.paletteStops (see lab-store.setPaletteStops); clearing
 * them restores the built-in palette / two-stop gradient path.
 */
function gradientCss(stops: PaletteStop[]): string {
  const norm = normalizeStops(stops);
  if (norm.length === 0) return "linear-gradient(90deg,#000,#000)";
  if (norm.length === 1) return `linear-gradient(90deg,${norm[0]!.color},${norm[0]!.color})`;
  const parts = norm.map((s) => `${s.color} ${(s.pos * 100).toFixed(1)}%`);
  return `linear-gradient(90deg,${parts.join(",")})`;
}

/**
 * Downscale an image File to a small offscreen canvas, read its pixels, and
 * return the top `count` dominant colors via the pure `quantizeColors`. Isolated
 * from the pure selection so the canvas read is the only untested part.
 */
async function extractColors(file: File, count: number): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("load failed"));
      el.src = url;
    });
    const maxSide = 64;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return quantizeColors(data, count);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PaletteEditor() {
  const stops = useLab((s) => s.paletteStops);
  const setPaletteStops = useLab((s) => s.setPaletteStops);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);

  const active = normalizeStops(stops).length >= 2;

  const commit = (next: PaletteStop[]) => setPaletteStops(normalizeStops(next));

  const addStop = () => {
    const norm = normalizeStops(stops);
    // Insert a stop midway using the sampled color there, or seed a default ramp.
    if (norm.length === 0) {
      commit([
        { pos: 0, color: "#3aa0ff" },
        { pos: 1, color: "#ff5ab0" },
      ]);
      setOpen(true);
      return;
    }
    const [r, g, b] = sampleStopsN(norm, 0.5);
    const hex = `#${[r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
    commit([...norm, { pos: 0.5, color: hex }]);
  };

  const updateStop = (i: number, patch: Partial<PaletteStop>) => {
    const norm = normalizeStops(stops);
    const next = norm.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    commit(next);
  };

  const removeStop = (i: number) => {
    const norm = normalizeStops(stops);
    commit(norm.filter((_, idx) => idx !== i));
  };

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const colors = await extractColors(file, 5);
      if (colors.length < 2) {
        toast.error("Couldn't read enough colors from that image");
        return;
      }
      commit(colorsToStops(colors));
      setOpen(true);
      toast.success(`Extracted ${colors.length} colors`);
    } catch {
      toast.error("Could not read that image");
    } finally {
      setBusy(false);
    }
  };

  const norm = normalizeStops(stops);

  return (
    <div className="col-span-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Custom palette</span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={addStop}>
            <Plus className="size-3" />
            {active ? "Add stop" : "Build"}
          </Button>
          <input
            ref={imageRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Reset so re-selecting the SAME file fires onChange again.
              e.target.value = "";
              void onImage(f);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={busy}
            onClick={() => imageRef.current?.click()}
          >
            {busy ? "Reading…" : "From image"}
          </Button>
          {active ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => commit([])}
              aria-label="Clear custom palette"
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
      {active ? (
        <>
          <div
            className="h-4 w-full rounded-sm border border-border"
            style={{ background: gradientCss(norm) }}
            aria-hidden
          />
          {open ? (
            <div className="flex flex-col gap-1.5">
              {norm.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={s.color}
                    onChange={(e) => updateStop(i, { color: e.target.value })}
                    aria-label={`Stop ${i + 1} color`}
                    className="size-7 cursor-pointer rounded-sm border border-border bg-elevated p-0.5"
                  />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={s.pos}
                    onChange={(e) => updateStop(i, { pos: Number(e.target.value) })}
                    aria-label={`Stop ${i + 1} position`}
                    className="flex-1"
                  />
                  <span className="w-10 text-right font-mono text-2xs tabular-nums text-faint">
                    {(s.pos * 100).toFixed(0)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => removeStop(i)}
                    disabled={norm.length <= 2}
                    aria-label={`Remove stop ${i + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="self-start text-2xs text-faint underline"
              onClick={() => setOpen(true)}
            >
              Edit {norm.length} stops
            </button>
          )}
        </>
      ) : (
        <p className="text-2xs text-faint">
          Build a multi-stop gradient, or extract one from an image. Overrides the named palette while set.
        </p>
      )}
    </div>
  );
}
