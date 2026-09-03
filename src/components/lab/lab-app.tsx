import { useEffect, useState } from "react";
import { useLab } from "@/store/lab-store";
import { CanvasStage } from "./canvas-stage";
import { Hud } from "./hud";
import { ChevronDown, ChevronUp } from "lucide-react";
import { GeneratorBar, ParamDock, ToolBar } from "./menus";
import { FeedbackDialog } from "./feedback-dialog";
import { FeedbackBoard } from "./feedback-board";
import { CreationsDialog } from "./creations-dialog";
import { LibraryDialog } from "./library-dialog";
import { ProfileDialog } from "./profile-dialog";
import { UpgradeDialog } from "./upgrade-dialog";
import { BillingSync } from "./theme-sync";
import { PerfHub } from "./perf-hub/perf-hub";
import { isEmbedSearch, readPresetFromSearch } from "@/lib/share/codec";

export function LabApp() {
  const tiltEnabled = useLab((s) => s.params.tiltEnabled);
  const setTilt = useLab((s) => s.setTilt);
  const uiTopOpen = useLab((s) => s.uiTopOpen);
  const uiBottomOpen = useLab((s) => s.uiBottomOpen);
  const toggleUiTop = useLab((s) => s.toggleUiTop);
  const toggleUiBottom = useLab((s) => s.toggleUiBottom);
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    const search = window.location.search;
    setEmbed(isEmbedSearch(search));
    const preset = readPresetFromSearch(search);
    if (preset) useLab.getState().applyCreationConfig(preset);
  }, []);

  useEffect(() => {
    if (!tiltEnabled) {
      setTilt(0, 0);
      return;
    }
    
    let lastGx = 0;
    let lastGy = 0;

    const onOrient = (e: DeviceOrientationEvent) => {
      // Gamma: left-to-right [-90, 90]
      // Beta: front-to-back [-180, 180]
      const gamma = e.gamma ?? 0;
      const beta = e.beta ?? 0;
      
      const gx = Math.sin((gamma * Math.PI) / 180) * 1.5;
      const gy = Math.sin((beta * Math.PI) / 180) * 1.5;
      
      lastGx = Math.max(-2.5, Math.min(2.5, gx));
      lastGy = Math.max(-2.5, Math.min(2.5, gy));
      setTilt(lastGx, lastGy);
    };

    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (acc && acc.x !== null && acc.y !== null && acc.x !== undefined && acc.y !== undefined) {
        // -acc.x is rightward, acc.y is downward in standard screen coords
        const gx = -(acc.x || 0) / 9.8 * 1.5;
        const gy = (acc.y || 0) / 9.8 * 1.5;
        lastGx = Math.max(-2.5, Math.min(2.5, gx));
        lastGy = Math.max(-2.5, Math.min(2.5, gy));
        setTilt(lastGx, lastGy);
      }
    };

    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("devicemotion", onMotion);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("devicemotion", onMotion);
    };
  }, [tiltEnabled, setTilt]);

  return (
    <div className="relative h-dvh min-h-0 overflow-hidden bg-bg text-fg">
      <BillingSync />
      <CanvasStage />
      {embed ? (
        <a
          href={window.location.pathname + window.location.search.replace(/([?&])embed=1(&|$)/, "$1").replace(/[?&]$/, "")}
          className="absolute bottom-3 right-3 z-20 rounded-md border border-border bg-surface/80 px-2.5 py-1.5 text-2xs uppercase tracking-[0.14em] text-muted backdrop-blur-md hover:text-fg"
        >
          Open in Helion
        </a>
      ) : (
        <>
      <FeedbackDialog />
      <FeedbackBoard />
      <CreationsDialog />
      <LibraryDialog />
      <ProfileDialog />
      <UpgradeDialog />
      <PerfHub />

      {/*
        Chrome docks are ONLY as tall as the visible bars + peek chevron.
        A full-screen overlay used to sit on the sim (and leftover HUD popovers
        translated with the menu instead of dismissing). Chevrons live OUTSIDE
        the clipping panel so they stay tappable when the menus are hidden.
      */}
      <div className="absolute inset-x-0 top-0 z-20 flex flex-col items-stretch">
        <div
          className="overflow-x-hidden overflow-y-auto transition-[max-height] duration-300 ease-in-out"
          style={{ maxHeight: uiTopOpen ? "72dvh" : 0 }}
        >
          <Hud />
          <GeneratorBar />
        </div>
        <button
          type="button"
          onClick={toggleUiTop}
          className="z-30 ml-auto mr-3 flex h-7 items-center justify-center rounded-b-md border-b border-l border-r border-border bg-surface/80 px-4 text-faint backdrop-blur-md hover:text-fg"
          aria-label={uiTopOpen ? "Hide top menu" : "Show top menu"}
        >
          <ChevronUp className={`size-4 transition-transform duration-300 ${uiTopOpen ? "" : "rotate-180"}`} />
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-stretch">
        <button
          type="button"
          onClick={toggleUiBottom}
          className="z-30 ml-auto mr-3 flex h-7 items-center justify-center rounded-t-md border-t border-l border-r border-border bg-surface/80 px-4 text-faint backdrop-blur-md hover:text-fg"
          aria-label={uiBottomOpen ? "Hide bottom menu" : "Show bottom menu"}
        >
          <ChevronDown className={`size-4 transition-transform duration-300 ${uiBottomOpen ? "" : "rotate-180"}`} />
        </button>
        <div
          className="overflow-x-hidden overflow-y-auto transition-[max-height] duration-300 ease-in-out"
          style={{ maxHeight: uiBottomOpen ? "72dvh" : 0 }}
        >
          <ToolBar />
          <ParamDock />
        </div>
      </div>
        </>
      )}
    </div>
  );
}
