import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { audioManager } from "@/engine/audio";
import {
  AUDIO_SOURCES,
  AUDIO_TARGETS,
  type AudioMapping,
  type AudioSource,
  type AudioTarget,
} from "@/engine/audio-modulation";

const SOURCE_LABEL: Record<AudioSource, string> = {
  bass: "Bass",
  mid: "Mid",
  level: "Level",
};

const TARGET_LABEL: Record<AudioTarget, string> = {
  size: "Point size",
  spawn: "Spawn burst",
  force: "Force",
  gravity: "Gravity",
  palette: "Palette cycle",
};

/**
 * Live audio level meter. Polls the AudioManager's computed bands each rAF while
 * mounted; purely visual, so it isn't unit-tested (no AnalyserNode in node). The
 * meter reads 0 when audio is off/inactive.
 */
function LevelMeter() {
  const [bands, setBands] = useState({ bass: 0, mid: 0, level: 0 });
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setBands(
        audioManager.active
          ? { bass: audioManager.bass, mid: audioManager.mid, level: audioManager.energy }
          : { bass: 0, mid: 0, level: 0 },
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rows: [string, number][] = [
    ["Bass", bands.bass],
    ["Mid", bands.mid],
    ["Level", bands.level],
  ];
  return (
    <div className="col-span-2 flex flex-col gap-1">
      {rows.map(([label, v]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-10 text-2xs uppercase tracking-[0.1em] text-faint">{label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full bg-fg transition-[width] duration-75"
              style={{ width: `${Math.min(100, Math.max(0, v * 100)).toFixed(0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AudioPanel() {
  const audioReactive = useLab((s) => s.params.audioReactive);
  const sensitivity = useLab((s) => s.params.audioSensitivity);
  const setParam = useLab((s) => s.setParam);
  const mappings = useLab((s) => s.audioMappings);
  const setAudioMappings = useLab((s) => s.setAudioMappings);
  const fileRef = useRef<HTMLInputElement>(null);

  const updateMapping = (i: number, patch: Partial<AudioMapping>) => {
    setAudioMappings(mappings.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };
  const removeMapping = (i: number) => setAudioMappings(mappings.filter((_, idx) => idx !== i));
  const addMapping = () =>
    setAudioMappings([...mappings, { source: "bass", target: "size", amount: 1 }]);

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
      <div className="col-span-2 flex items-center gap-2">
        <Button
          variant={audioReactive ? "default" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => {
            const next = !audioReactive;
            setParam("audioReactive", next);
            if (!next) audioManager.stop();
          }}
        >
          {audioReactive ? "Audio on" : "Audio off"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={!audioReactive}
          onClick={() => {
            setParam("audioReactive", true);
            void audioManager.startMic();
          }}
        >
          Microphone
        </Button>
        <label
          className={`inline-flex h-8 items-center rounded-md border border-border px-2.5 text-2xs uppercase tracking-[0.1em] text-muted hover:text-fg ${audioReactive ? "cursor-pointer" : "pointer-events-none opacity-50"}`}
        >
          Music file
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so re-selecting the SAME file fires onChange again.
              e.target.value = "";
              if (!file) return;
              setParam("audioReactive", true);
              void audioManager.startFile(file);
            }}
          />
        </label>
        {audioManager.trackName ? (
          <span className="text-2xs text-faint">{audioManager.trackName}</span>
        ) : null}
      </div>

      <LevelMeter />

      <div className="col-span-2 md:col-span-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-muted">Mappings</span>
          <Button variant="outline" size="sm" className="h-7 gap-1" onClick={addMapping}>
            <Plus className="size-3" />
            Add
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          {mappings.length === 0 ? (
            <p className="text-2xs text-faint">No mappings — add one to drive size, spawn, force, gravity, or palette.</p>
          ) : (
            mappings.map((m, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <select
                  value={m.source}
                  onChange={(e) => updateMapping(i, { source: e.target.value as AudioSource })}
                  aria-label={`Mapping ${i + 1} source`}
                  className="h-7 rounded-md border border-border bg-bg px-1.5 text-2xs text-fg"
                >
                  {AUDIO_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </option>
                  ))}
                </select>
                <span className="text-2xs text-faint">→</span>
                <select
                  value={m.target}
                  onChange={(e) => updateMapping(i, { target: e.target.value as AudioTarget })}
                  aria-label={`Mapping ${i + 1} target`}
                  className="h-7 rounded-md border border-border bg-bg px-1.5 text-2xs text-fg"
                >
                  {AUDIO_TARGETS.map((t) => (
                    <option key={t} value={t}>
                      {TARGET_LABEL[t]}
                    </option>
                  ))}
                </select>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={m.amount}
                  onChange={(e) => updateMapping(i, { amount: Number(e.target.value) })}
                  aria-label={`Mapping ${i + 1} amount`}
                  className="w-20"
                />
                <span className="w-8 text-right font-mono text-2xs tabular-nums text-faint">
                  {m.amount.toFixed(2)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => removeMapping(i)}
                  aria-label={`Remove mapping ${i + 1}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="col-span-2 flex items-center gap-2">
        <span className="w-16 text-xs text-muted">Sensitivity</span>
        <input
          type="range"
          min={0}
          max={5}
          step={0.1}
          value={sensitivity}
          onChange={(e) => setParam("audioSensitivity", Number(e.target.value))}
          aria-label="Audio sensitivity"
          className="flex-1"
        />
        <span className="w-8 text-right font-mono text-2xs tabular-nums text-faint">
          {sensitivity.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
