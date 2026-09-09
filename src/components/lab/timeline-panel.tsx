import { Pause, Play, Plus, Repeat, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { trackDuration } from "@/engine/timeline";

/**
 * Keyframe timeline panel (Item 1). A floating panel to add a keyframe at the
 * current playhead, delete keyframes, scrub, play/pause, and toggle loop. The
 * engine advances the playhead during playback and applies the sampled params;
 * this panel is the control surface (pure store interactions — the sampling and
 * playback state machine are unit-tested in timeline.test.ts).
 */
function fmt(t: number): string {
  return `${t.toFixed(2)}s`;
}

export function TimelinePanel() {
  const open = useLab((s) => s.timelineOpen);
  const setOpen = useLab((s) => s.setTimelineOpen);
  const track = useLab((s) => s.timelineTrack);
  const playing = useLab((s) => s.timelinePlaying);
  const playhead = useLab((s) => s.timelinePlayhead);
  const addKeyframe = useLab((s) => s.addTimelineKeyframe);
  const removeKeyframe = useLab((s) => s.removeTimelineKeyframe);
  const setTrack = useLab((s) => s.setTimelineTrack);
  const setPlaying = useLab((s) => s.setTimelinePlaying);
  const setPlayhead = useLab((s) => s.setTimelinePlayhead);

  if (!open) return null;

  const duration = trackDuration(track);
  // Next keyframe time defaults to duration + 1s so repeated "Add" spreads out.
  const nextTime = track.keys.length === 0 ? 0 : Math.max(playhead, duration + 1);
  const scrubMax = Math.max(duration, 0.001);

  return (
    <div
      className="pointer-events-auto absolute bottom-24 left-1/2 z-30 w-[min(94vw,40rem)] -translate-x-1/2 rounded-lg border border-border bg-surface/95 p-3 shadow-xl backdrop-blur-md"
      data-testid="timeline-panel"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-2xs uppercase tracking-[0.14em] text-faint">Timeline</span>
        <div className="flex items-center gap-1.5">
          <Button
            variant={track.loop ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1 px-2"
            aria-label="Toggle loop"
            title="Loop playback"
            onClick={() => setTrack({ ...track, loop: !track.loop })}
          >
            <Repeat className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Close timeline"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={playing ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1 px-2.5"
          aria-label={playing ? "Pause" : "Play"}
          disabled={track.keys.length < 2}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {playing ? "Pause" : "Play"}
        </Button>
        <input
          type="range"
          min={0}
          max={scrubMax}
          step={0.01}
          value={Math.min(playhead, scrubMax)}
          aria-label="Scrub timeline"
          className="flex-1"
          onChange={(e) => {
            if (playing) setPlaying(false);
            setPlayhead(Number(e.target.value));
          }}
        />
        <span className="w-24 text-right font-mono text-2xs tabular-nums text-faint">
          {fmt(playhead)} / {fmt(duration)}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2.5"
          aria-label="Add keyframe"
          title="Capture current params as a keyframe"
          onClick={() => addKeyframe(nextTime)}
        >
          <Plus className="size-3.5" />
          Key
        </Button>
      </div>

      {track.keys.length === 0 ? (
        <p className="mt-2 text-2xs text-faint">
          Add keyframes to animate gravity, size, force, palette, shape and more over time. Playback
          interpolates between them and scrubs.
        </p>
      ) : (
        <ul className="lab-scroll mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
          {track.keys.map((k, i) => {
            const count = Object.keys(k.params).length;
            return (
              <li
                key={`${k.t}-${i}`}
                className="flex items-center gap-2 rounded-sm bg-elevated/40 px-2 py-1.5 text-xs"
              >
                <button
                  type="button"
                  className="font-mono text-2xs tabular-nums text-fg underline"
                  onClick={() => {
                    if (playing) setPlaying(false);
                    setPlayhead(k.t);
                  }}
                  aria-label={`Jump to keyframe ${i + 1}`}
                >
                  {fmt(k.t)}
                </button>
                <span className="min-w-0 flex-1 truncate text-2xs text-faint">
                  {count} param{count === 1 ? "" : "s"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label={`Delete keyframe ${i + 1}`}
                  onClick={() => removeKeyframe(i)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
