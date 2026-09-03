import { Type,
  Atom,
  ChevronDown,
  Droplets,
  Eraser,
  Flame,
  Grid3x3,
  Magnet,
  Orbit,
  Paintbrush,
  PenLine,
  Plus,
  Snowflake,
  Sparkles,
  Spline,
  Waves,
  Wind,
  CircleDashed,
  Users,
  Cloud,
  PartyPopper,
  Tornado,
  Zap,
  CircleDot,
  Sun,
  Flower2,
  Triangle,
  Droplet,
  Gem,
  Lock,
  Hexagon,
  Asterisk,
  Infinity as InfinityIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { PALETTE_IDS } from "@/engine/palettes";
import { SCENES, type SceneId } from "@/engine/scenes";
import { isProGenerator, type GeneratorKind, type ParamTab, type ToolKind } from "@/engine/types";
import { useLab } from "@/store/lab-store";
import { Button } from "@/components/ui/button";
import { Chip, Segmented, SliderRow, ToggleRow } from "./controls";
import { cn } from "@/lib/utils";

const GENERATORS: { id: GeneratorKind; label: string; icon: typeof Orbit }[] = [
  { id: "galaxy", label: "Galaxy", icon: Orbit },
  { id: "ring", label: "Ring", icon: CircleDashed },
  { id: "burst", label: "Burst", icon: Sparkles },
  { id: "pour", label: "Pour", icon: Droplets },
  { id: "fall", label: "Fall", icon: Spline },
  { id: "flock", label: "Flock", icon: Users },
  { id: "cloth", label: "Cloth", icon: Grid3x3 },
  { id: "nbody", label: "N-body", icon: Atom },
  { id: "text", label: "Text", icon: Type },
];

const EFFECTS: { id: GeneratorKind; label: string; icon: typeof Orbit }[] = [
  { id: "fire", label: "Fire", icon: Flame },
  { id: "smoke", label: "Smoke", icon: Cloud },
  { id: "fireworks", label: "Fireworks", icon: PartyPopper },
  { id: "water", label: "Water", icon: Droplets },
  { id: "tornado", label: "Tornado", icon: Tornado },
  { id: "lightning", label: "Lightning", icon: Zap },
  { id: "blackhole", label: "Black Hole", icon: CircleDot },
  { id: "supernova", label: "Supernova", icon: Sun },
  { id: "fibonacci", label: "Fibonacci", icon: Flower2 },
  { id: "sierpinski", label: "Sierpinski", icon: Triangle },
];

const PRO_EFFECTS: { id: GeneratorKind; label: string; icon: typeof Orbit }[] = [
  { id: "crystal", label: "Crystal", icon: Gem },
  { id: "magma", label: "Magma", icon: Flame },
  { id: "aurora", label: "Aurora", icon: Wind },
  { id: "helix", label: "Helix", icon: InfinityIcon },
  { id: "mandala", label: "Mandala", icon: Hexagon },
  { id: "confetti", label: "Confetti", icon: Asterisk },
];

const SCENE_ICONS: Record<SceneId, typeof CircleDot> = {
  "black-hole": CircleDot,
  "galaxy-collision": Sparkles,
  fireworks: PartyPopper,
  murmuration: Users,
  whirlpool: Tornado,
  "flow-field": Wind,
  waterfall: Droplet,
  cloth: Grid3x3,
  nebula: Cloud,
};

const TOOLS: { id: ToolKind; label: string; icon: typeof Magnet }[] = [
  { id: "attract", label: "Attract", icon: Magnet },
  { id: "repel", label: "Repel", icon: Wind },
  { id: "repulsor", label: "Repulsor", icon: Waves },
  { id: "vortex", label: "Vortex", icon: Orbit },
  { id: "paint", label: "Paint", icon: Paintbrush },
  { id: "wall", label: "Wall", icon: PenLine },
  { id: "freeze", label: "Freeze", icon: Snowflake },
];

const TABS: { id: ParamTab; label: string }[] = [
  { id: "physics", label: "Physics" },
  { id: "visuals", label: "Visuals" },
  { id: "view", label: "View" },
  { id: "trails", label: "Trails" },
  { id: "collide", label: "Collide" },
  { id: "tilt", label: "Tilt" },
  { id: "fluid", label: "Fluid" },
  { id: "settle", label: "Settle" },
  { id: "flow", label: "Flow" },
  { id: "bloom", label: "Bloom" },
  { id: "audio", label: "Audio" },
  { id: "walls", label: "Walls" },
];

const EMOJIS = ["✨", "❤️", "⭐", "🔥", "💧", "💜", "🌸", "⚡", "💎", "🌙"];

export function GeneratorBar() {
  const run = useLab((s) => s.runGenerator);
  const pouring = useLab((s) => s.pouring);
  const falling = useLab((s) => s.falling);
  const firing = useLab((s) => s.firing);
  const smoking = useLab((s) => s.smoking);
  const spawnKind = useLab((s) => s.spawnKind);
  const textInput = useLab((s) => s.params.textInput);
  const setParam = useLab((s) => s.setParam);
  const spawnCount = useLab((s) => s.spawnCount);
  const setSpawnCount = useLab((s) => s.setSpawnCount);
  const addParticles = useLab((s) => s.addParticles);
  const clearSim = useLab((s) => s.clearSim);
  const applyScene = useLab((s) => s.applyScene);
  const activeSceneId = useLab((s) => s.activeSceneId);
  const entitled = useLab((s) => s.entitled);
  const plan = useLab((s) => s.plan);
  const setUpgradeOpen = useLab((s) => s.setUpgradeOpen);
  const countMax = plan === "enterprise" ? 200_000 : entitled ? 50_000 : 20_000;

  const isActive = (id: GeneratorKind) => {
    if (id === "pour") return pouring;
    if (id === "fall") return falling;
    if (id === "fire") return firing || spawnKind === "fire";
    if (id === "smoke") return smoking || spawnKind === "smoke";
    return spawnKind === id;
  };

  const runOrUpgrade = (id: GeneratorKind) => {
    if (isProGenerator(id) && !entitled) {
      setUpgradeOpen(true);
      return;
    }
    run(id);
  };

  const renderChip = (g: { id: GeneratorKind; label: string; icon: typeof Orbit }) => {
    const Icon = g.icon;
    const locked = isProGenerator(g.id) && !entitled;
    return (
      <Chip
        key={g.id}
        active={isActive(g.id)}
        onClick={() => runOrUpgrade(g.id)}
        className={cn("gap-1.5", locked && "opacity-70")}
        title={locked ? "Pro generator — start a trial" : undefined}
      >
        <Icon className="size-3" />
        {g.label}
        {locked ? <Lock className="size-3" /> : null}
      </Chip>
    );
  };

  return (
    <div className="relative z-20 flex shrink-0 flex-col gap-1.5 border-b border-border bg-surface/70 px-3 py-1.5 backdrop-blur-md md:px-4 md:py-2">
      <div className="flex items-center gap-2">
        <span className="hidden text-2xs uppercase tracking-[0.16em] text-faint sm:inline">Generate</span>
        <div className="lab-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {GENERATORS.map(renderChip)}
          <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
          {EFFECTS.map(renderChip)}
          <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
          {PRO_EFFECTS.map(renderChip)}
          <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
          {SCENES.map((scene) => {
            const Icon = SCENE_ICONS[scene.id];
            return (
              <Chip
                key={scene.id}
                active={activeSceneId === scene.id}
                onClick={() => applyScene(scene.id)}
                className="gap-1.5"
              >
                <Icon className="size-3" />
                {scene.label}
              </Chip>
            );
          })}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <SliderRow
            label="Count"
            value={spawnCount}
            min={200}
            max={countMax}
            step={100}
            format={(n) => n.toLocaleString()}
            onChange={setSpawnCount}
          />
          {spawnKind === "text" && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xs uppercase tracking-[0.12em] text-faint">Word</span>
              <input
                type="text"
                className="flex-1 rounded-sm border border-border bg-bg px-2 py-1 text-xs text-fg focus:border-accent focus:outline-none"
                value={textInput}
                onChange={(e) => setParam("textInput", e.target.value.substring(0, 12))}
                maxLength={12}
                placeholder="HELION"
              />
            </div>
          )}
        </div>
        <Button variant="default" size="sm" className="h-8 shrink-0 px-3" onClick={addParticles}>
          <Plus className="size-3.5" />
          Add
        </Button>
        <Button variant="outline" size="sm" className="h-8 shrink-0 px-3" onClick={clearSim}>
          <Eraser className="size-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}

export function ToolBar() {
  const tool = useLab((s) => s.tool);
  const setTool = useLab((s) => s.setTool);
  const brushRadius = useLab((s) => s.brushRadius);
  const brushStrength = useLab((s) => s.brushStrength);
  const setBrush = useLab((s) => s.setBrush);
  const pointSize = useLab((s) => s.params.pointSize);
  const setParam = useLab((s) => s.setParam);

  return (
    <div className="relative z-20 flex shrink-0 flex-col gap-1.5 border-t border-border bg-surface/70 px-3 py-1.5 backdrop-blur-md md:px-4 md:py-2">
      <div className="flex items-center gap-2">
        <span className="hidden text-2xs uppercase tracking-[0.16em] text-faint sm:inline">Interact</span>
        <div className="lab-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <Chip key={t.id} active={tool === t.id} onClick={() => setTool(t.id)} className="gap-1.5">
                <Icon className="size-3" />
                {t.label}
              </Chip>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 md:max-w-xl">
        <SliderRow
          label="Brush"
          value={brushRadius}
          min={0.03}
          max={0.4}
          step={0.005}
          format={(n) => n.toFixed(3)}
          onChange={(n) => setBrush(n, brushStrength)}
        />
        <SliderRow
          label="Force"
          value={brushStrength}
          min={0.1}
          max={2}
          step={0.05}
          format={(n) => n.toFixed(2)}
          onChange={(n) => setBrush(brushRadius, n)}
        />
        <SliderRow
          label="Size"
          value={pointSize}
          min={1}
          max={24}
          step={0.5}
          format={(n) => `${n.toFixed(0)}px`}
          onChange={(n) => setParam("pointSize", n)}
        />
      </div>
    </div>
  );
}

export function ParamDock() {
  const tab = useLab((s) => s.tab);
  const setTab = useLab((s) => s.setTab);
  const params = useLab((s) => s.params);
  const setParam = useLab((s) => s.setParam);
  const cap = useLab((s) => s.cap);
  const setCap = useLab((s) => s.setCap);
  const tiltX = useLab((s) => s.tiltX);
  const tiltY = useLab((s) => s.tiltY);
  const viewZoom = useLab((s) => s.viewZoom);
  const viewRotate = useLab((s) => s.viewRotate);
  const setView = useLab((s) => s.setView);
  const resetView = useLab((s) => s.resetView);
  const fillFrame = useLab((s) => s.fillFrame);
  const setFillFrame = useLab((s) => s.setFillFrame);
  const setBgMedia = useLab((s) => s.setBgMedia);
  const bgObjectUrl = useLab((s) => s.bgObjectUrl);
  const [open, setOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleToggleTilt = async (v: boolean) => {
    if (v && typeof (DeviceOrientationEvent as any)?.requestPermission === "function") {
      try {
        const res = await (DeviceOrientationEvent as any).requestPermission();
        if (res === "granted") {
          setParam("tiltEnabled", true);
          return;
        }
      } catch (e) {
        console.warn("DeviceOrientation error:", e);
      }
    }
    if (v && typeof (DeviceMotionEvent as any)?.requestPermission === "function") {
      try {
        const res = await (DeviceMotionEvent as any).requestPermission();
        if (res === "granted") {
          setParam("tiltEnabled", true);
          return;
        }
      } catch (e) {
        console.warn("DeviceMotion error:", e);
      }
    }
    setParam("tiltEnabled", v);
  };

  const pickFile = (kind: "image" | "video", file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setBgMedia(url);
    setParam("background", kind);
  };

  return (
    <section className="relative z-20 shrink-0 border-t border-border bg-surface/80 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:px-4">
      <div className="mb-1 flex items-center gap-1">
        <div className="lab-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setOpen(true);
              }}
              className={cn(
                "h-9 shrink-0 rounded-sm px-3 text-xs font-medium tracking-wide transition-colors duration-150",
                tab === t.id ? "bg-elevated text-fg" : "text-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="flex size-9 shrink-0 items-center justify-center rounded-sm text-muted hover:text-fg md:hidden"
          aria-label={open ? "Hide controls" : "Show controls"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>

      <div className={cn("lab-dock-body", open && "is-open")}>
        <div className="min-h-0 pt-1">
            {tab === "physics" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                <SliderRow
                  label="Gravity X"
                  value={params.gravityX}
                  min={-2}
                  max={2}
                  step={0.02}
                  onChange={(n) => setParam("gravityX", n)}
                />
                <SliderRow
                  label="Gravity Y"
                  value={params.gravityY}
                  min={-2}
                  max={2}
                  step={0.02}
                  onChange={(n) => setParam("gravityY", n)}
                />
                <SliderRow
                  label="Drag"
                  value={params.drag}
                  min={0}
                  max={2}
                  step={0.01}
                  onChange={(n) => setParam("drag", n)}
                />
                <SliderRow
                  label="Mass"
                  value={params.mass}
                  min={0.2}
                  max={4}
                  step={0.05}
                  onChange={(n) => setParam("mass", n)}
                />
                <SliderRow
                  label="Central mass"
                  value={params.centralMass}
                  min={0}
                  max={8}
                  step={0.05}
                  onChange={(n) => setParam("centralMass", n)}
                />
                <SliderRow
                  label="Softening"
                  value={params.softening}
                  min={0.004}
                  max={0.08}
                  step={0.001}
                  format={(n) => n.toFixed(3)}
                  onChange={(n) => setParam("softening", n)}
                />
                <SliderRow
                  label="Lifespan s"
                  value={params.lifespan}
                  min={0}
                  max={12}
                  step={0.1}
                  format={(n) => (n <= 0 ? "immortal" : n.toFixed(1))}
                  onChange={(n) => setParam("lifespan", n)}
                />
                <SliderRow
                  label="Buffer cap"
                  value={Math.log2(cap)}
                  min={10}
                  max={20}
                  step={1}
                  format={() => cap.toLocaleString()}
                  onChange={(n) => setCap(2 ** n)}
                />
              </div>
            )}

            {tab === "visuals" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                <div className="col-span-2">
                  <div className="mb-1 text-xs text-muted">Blend</div>
                  <Segmented
                    value={params.blend}
                    options={[
                      { id: "additive", label: "Additive" },
                      { id: "alpha", label: "Alpha" },
                    ]}
                    onChange={(v) => setParam("blend", v)}
                  />
                </div>
                <div className="col-span-2">
                  <div className="mb-1 text-xs text-muted">Color map</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["speed", "Speed"],
                        ["life", "Life"],
                        ["density", "Density"],
                        ["mass", "Mass"],
                        ["palette", "Phase"],
                        ["position", "Position"],
                      ] as const
                    ).map(([id, label]) => (
                      <Chip key={id} active={params.colorMap === id} onClick={() => setParam("colorMap", id)}>
                        {label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="mb-1 text-xs text-muted">Palette</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PALETTE_IDS.map((id) => (
                      <Chip key={id} active={params.palette === id} onClick={() => setParam("palette", id)}>
                        {id}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="col-span-2 flex items-end gap-3">
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-muted">Tint</span>
                    <input
                      type="color"
                      value={params.tint}
                      onChange={(e) => setParam("tint", e.target.value)}
                      aria-label="Tint color"
                      className="size-8 cursor-pointer rounded-sm border border-border bg-elevated p-0.5"
                    />
                    <span className="font-mono text-2xs tabular-nums text-fg">{params.tint}</span>
                  </label>
                  {params.tint !== "#ffffff" ? (
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setParam("tint", "#ffffff")}>
                      Reset tint
                    </Button>
                  ) : null}
                </div>
                <div className="col-span-2">
                  <div className="mb-1 text-xs text-muted">Shape</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["circle", "Circle"],
                        ["square", "Square"],
                        ["ring", "Ring"],
                        ["diamond", "Diamond"],
                        ["triangle", "Triangle"],
                        ["star", "Star"],
                        ["hex", "Hex"],
                        ["plus", "Plus"],
                        ["heart", "Heart"],
                        ["spark", "Spark"],
                        ["emoji", "Emoji"],
                      ] as const
                    ).map(([id, label]) => (
                      <Chip
                        key={id}
                        active={params.shape === id}
                        onClick={() => {
                          if (id === "emoji") {
                            useLab.getState().patchParams({
                              shape: "emoji",
                              pointSize: Math.max(params.pointSize, 16),
                              emoji: params.emoji || "✨",
                            });
                          } else {
                            setParam("shape", id);
                          }
                        }}
                      >
                        {label}
                      </Chip>
                    ))}
                  </div>
                </div>
                {params.shape === "emoji" ? (
                  <div className="col-span-2">
                    <div className="mb-1 text-xs text-muted">Glyph</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {EMOJIS.map((glyph) => (
                        <Chip
                          key={glyph}
                          active={params.emoji === glyph}
                          onClick={() => setParam("emoji", glyph)}
                          className="h-10 min-w-10 px-1.5 text-lg"
                        >
                          {glyph}
                        </Chip>
                      ))}
                      <input
                        type="text"
                        inputMode="text"
                        aria-label="Custom emoji"
                        maxLength={8}
                        value={params.emoji}
                        onChange={(e) => setParam("emoji", e.target.value.slice(0, 8) || "✨")}
                        className="h-9 w-16 rounded-sm border border-border bg-bg px-2 text-center text-sm text-fg"
                        placeholder="✨"
                      />
                    </div>
                    <p className="mt-1 text-2xs text-faint">Tap a glyph or paste any emoji. Size it up if it’s tiny.</p>
                  </div>
                ) : null}
                <SliderRow
                  label="Point size"
                  value={params.pointSize}
                  min={1}
                  max={24}
                  step={0.5}
                  format={(n) => `${n.toFixed(0)}px`}
                  onChange={(n) => setParam("pointSize", n)}
                />
                <SliderRow
                  label="Fade in"
                  value={params.lifeFadeIn}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(n) => setParam("lifeFadeIn", n)}
                />
                <SliderRow
                  label="Fade out"
                  value={params.lifeFadeOut}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(n) => setParam("lifeFadeOut", n)}
                />
              </div>
            )}

            {tab === "view" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                <div className="col-span-2">
                  <div className="mb-1 text-xs text-muted">Background</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["void", "Void"],
                        ["starfield", "Stars"],
                        ["gradient", "Gradient"],
                        ["nebula", "Nebula"],
                        ["image", "Image"],
                        ["video", "Video"],
                      ] as const
                    ).map(([id, label]) => (
                      <Chip
                        key={id}
                        active={params.background === id}
                        onClick={() => {
                          setParam("background", id);
                          if (id === "image") imageInputRef.current?.click();
                          if (id === "video") videoInputRef.current?.click();
                        }}
                      >
                        {label}
                      </Chip>
                    ))}
                  </div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      pickFile("image", e.target.files?.[0]);
                      e.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      pickFile("video", e.target.files?.[0]);
                      e.currentTarget.value = "";
                    }}
                  />
                  {(params.background === "image" || params.background === "video") && (
                    <p className="mt-1 text-2xs text-faint">
                      {bgObjectUrl
                        ? "Media stays in this session only — not saved with a creation."
                        : "Pick a file. It stays in this session only."}
                    </p>
                  )}
                </div>
                <div className="col-span-2" data-testid="fill-frame">
                  <ToggleRow
                    label="Fill frame"
                    checked={fillFrame}
                    onChange={setFillFrame}
                  />
                </div>
                <SliderRow
                  label="Zoom"
                  value={viewZoom}
                  min={0.4}
                  max={4}
                  step={0.05}
                  format={(n) => `${n.toFixed(2)}×`}
                  onChange={(n) => setView({ zoom: n })}
                />
                <SliderRow
                  label="Orbit"
                  value={viewRotate}
                  min={-180}
                  max={180}
                  step={1}
                  format={(n) => `${n.toFixed(0)}°`}
                  onChange={(n) => setView({ rotate: n })}
                />
                <div className="flex items-end">
                  <Button variant="outline" size="sm" className="h-8 w-full" onClick={resetView}>
                    Reset view
                  </Button>
                </div>
                <p className="col-span-2 text-xs text-muted md:col-span-4">
                  {fillFrame
                    ? "Fill frame on: zoom-out grows the playground — leftover screen is real space you can pour and attract into. Zoom-in is a closer look."
                    : "Fill frame off: zoom-out shrinks the picture (letterbox). Toggle on to use that leftover space."}{" "}
                  Scroll or pinch to zoom. Right-drag or Alt-drag to pan. Press 0 to reset.
                  Pixel density (Low / High) lives under Performance — the gauge in the top bar.
                </p>
              </div>
            )}

            {tab === "trails" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                <ToggleRow label="History buffer" checked={params.trails} onChange={(v) => setParam("trails", v)} />
                <SliderRow
                  label="Decay"
                  value={params.trailDecay}
                  min={0.02}
                  max={0.5}
                  step={0.01}
                  onChange={(n) => setParam("trailDecay", n)}
                />
                <SliderRow
                  label="Length"
                  value={params.trailLength}
                  min={0.1}
                  max={1.4}
                  step={0.02}
                  onChange={(n) => setParam("trailLength", n)}
                />
              </div>
            )}

            {tab === "collide" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                <ToggleRow label="Particle collide" checked={params.collide} onChange={(v) => setParam("collide", v)} />
                <div>
                  <div className="mb-1 text-xs text-muted">Boundary</div>
                  <Segmented
                    value={params.boundary}
                    options={[
                      { id: "bounce", label: "Bounce" },
                      { id: "wrap", label: "Wrap" },
                      { id: "destroy", label: "Destroy" },
                    ]}
                    onChange={(v) => setParam("boundary", v)}
                  />
                </div>
                <SliderRow
                  label="Restitution"
                  value={params.restitution}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(n) => setParam("restitution", n)}
                />
                <SliderRow
                  label="Radius"
                  value={params.particleRadius}
                  min={0.001}
                  max={0.02}
                  step={0.0005}
                  format={(n) => n.toFixed(4)}
                  onChange={(n) => setParam("particleRadius", n)}
                />
              </div>
            )}

            {tab === "tilt" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                <ToggleRow
                  label="Device IMU"
                  checked={params.tiltEnabled}
                  onChange={handleToggleTilt}
                />
                <SliderRow
                  label="Tilt scale"
                  value={params.tiltScale}
                  min={0.2}
                  max={4}
                  step={0.05}
                  onChange={(n) => setParam("tiltScale", n)}
                />
                <div className="col-span-2 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between rounded border border-border bg-surface-hover/50 px-2.5 py-1 text-xs">
                    <span className="text-muted">Sensor Gravity:</span>
                    <span className="font-mono text-accent">
                      gx: {(tiltX * (params.tiltScale || 1)).toFixed(2)}, gy: {(tiltY * (params.tiltScale || 1)).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Tilt your phone to steer gravity. On iOS/Safari, granting motion access enables real-time accelerometer control.
                  </p>
                </div>
              </div>
            )}

            {tab === "fluid" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                <ToggleRow label="SPH fluid" checked={params.sph} onChange={(v) => setParam("sph", v)} />
                <SliderRow
                  label="Rest density"
                  value={params.sphRestDensity}
                  min={4}
                  max={40}
                  step={0.5}
                  onChange={(n) => setParam("sphRestDensity", n)}
                />
                <SliderRow
                  label="Pressure"
                  value={params.sphPressure}
                  min={0.2}
                  max={14}
                  step={0.1}
                  onChange={(n) => setParam("sphPressure", n)}
                />
                <SliderRow
                  label="Viscosity"
                  value={params.sphViscosity}
                  min={0}
                  max={0.4}
                  step={0.005}
                  onChange={(n) => setParam("sphViscosity", n)}
                />
                <SliderRow
                  label="Smoothing h"
                  value={params.sphSmoothing}
                  min={0.012}
                  max={0.06}
                  step={0.001}
                  format={(n) => n.toFixed(3)}
                  onChange={(n) => setParam("sphSmoothing", n)}
                />
              </div>
            )}

            {tab === "settle" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                <ToggleRow label="Sleep when still" checked={params.settle} onChange={(v) => setParam("settle", v)} />
                <SliderRow
                  label="Velocity gate"
                  value={params.settleThreshold}
                  min={0.005}
                  max={0.12}
                  step={0.001}
                  format={(n) => n.toFixed(3)}
                  onChange={(n) => setParam("settleThreshold", n)}
                />
                <SliderRow
                  label="Cloth iterations"
                  value={params.clothIterations}
                  min={1}
                  max={16}
                  step={1}
                  format={(n) => n.toFixed(0)}
                  onChange={(n) => setParam("clothIterations", n)}
                />
                <ToggleRow label="Flock" checked={params.flock} onChange={(v) => setParam("flock", v)} />
                <SliderRow
                  label="Separation"
                  value={params.flockSep}
                  min={0}
                  max={3}
                  step={0.05}
                  onChange={(n) => setParam("flockSep", n)}
                />
                <SliderRow
                  label="Alignment"
                  value={params.flockAli}
                  min={0}
                  max={3}
                  step={0.05}
                  onChange={(n) => setParam("flockAli", n)}
                />
                <SliderRow
                  label="Cohesion"
                  value={params.flockCoh}
                  min={0}
                  max={3}
                  step={0.05}
                  onChange={(n) => setParam("flockCoh", n)}
                />
                <ToggleRow label="N-body gravity" checked={params.nbody} onChange={(v) => setParam("nbody", v)} />
                <SliderRow
                  label="G"
                  value={params.nbodyG}
                  min={0}
                  max={0.08}
                  step={0.001}
                  format={(n) => n.toFixed(3)}
                  onChange={(n) => setParam("nbodyG", n)}
                />
              </div>
            )}
            {tab === "flow" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                <ToggleRow label="Enable flow" checked={params.flow} onChange={(v) => setParam("flow", v)} />
                <SliderRow
                  label="Strength"
                  value={params.flowStrength}
                  min={0}
                  max={5}
                  step={0.1}
                  onChange={(n) => setParam("flowStrength", n)}
                />
                <SliderRow
                  label="Scale"
                  value={params.flowScale}
                  min={0.1}
                  max={10}
                  step={0.1}
                  onChange={(n) => setParam("flowScale", n)}
                />
                <SliderRow
                  label="Speed"
                  value={params.flowSpeed}
                  min={0}
                  max={2}
                  step={0.05}
                  onChange={(n) => setParam("flowSpeed", n)}
                />
              </div>
            )}

            {tab === "bloom" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                <ToggleRow label="Enable bloom" checked={params.bloom} onChange={(v) => setParam("bloom", v)} />
                <SliderRow
                  label="Strength"
                  value={params.bloomStrength}
                  min={0.1}
                  max={5}
                  step={0.1}
                  onChange={(n) => setParam("bloomStrength", n)}
                />
              </div>
            )}
            {tab === "audio" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                <ToggleRow label="Mic active" checked={params.audioReactive} onChange={(v) => setParam("audioReactive", v)} />
                <SliderRow
                  label="Sensitivity"
                  value={params.audioSensitivity}
                  min={0}
                  max={5}
                  step={0.1}
                  onChange={(n) => setParam("audioSensitivity", n)}
                />
              </div>
            )}
            {tab === "walls" && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
                 <div className="col-span-2 text-xs text-faint flex items-center h-full">Use the Wall tool (above) to draw collision lines.</div>
                 <button onClick={() => window.dispatchEvent(new CustomEvent("clear-walls"))} className="col-span-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-500 hover:bg-red-500/20">Clear Walls</button>
              </div>
            )}

          </div>
        </div>
    </section>
  );
}
