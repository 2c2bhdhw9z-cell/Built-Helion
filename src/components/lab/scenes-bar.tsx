import {
  CircleDot,
  Cloud,
  Droplet,
  Grid3x3,
  PartyPopper,
  Sparkles,
  Tornado,
  Users,
  Wind,
} from "lucide-react";
import { SCENES, type SceneId } from "@/engine/scenes";
import { useLab } from "@/store/lab-store";
import { Chip } from "./controls";

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

export function ScenesBar() {
  const applyScene = useLab((s) => s.applyScene);
  const activeSceneId = useLab((s) => s.activeSceneId);

  return (
    <div className="relative z-20 flex shrink-0 flex-col gap-2 border-b border-border bg-surface/70 px-3 py-2 backdrop-blur-md md:px-4">
      <div className="flex items-center gap-2">
        <span className="hidden text-2xs uppercase tracking-[0.16em] text-faint sm:inline">Scenes</span>
        <div className="lab-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
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
    </div>
  );
}
