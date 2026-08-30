import { useEffect } from "react";
import { useLab } from "@/store/lab-store";
import { CanvasStage } from "./canvas-stage";
import { Hud } from "./hud";
import { ChevronDown, ChevronUp } from "lucide-react";
import { GeneratorBar, ParamDock, ToolBar } from "./menus";
import { ScenesBar } from "./scenes-bar";
import { FeedbackDialog } from "./feedback-dialog";
import { FeedbackBoard } from "./feedback-board";
import { CreationsDialog } from "./creations-dialog";
import { PerfHub } from "./perf-hub/perf-hub";

export function LabApp() {
  const tiltEnabled = useLab((s) => s.params.tiltEnabled);
  const setTilt = useLab((s) => s.setTilt);
  const uiTopOpen = useLab((s) => s.uiTopOpen);
  const uiBottomOpen = useLab((s) => s.uiBottomOpen);
  const toggleUiTop = useLab((s) => s.toggleUiTop);
  const toggleUiBottom = useLab((s) => s.toggleUiBottom);

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
      <CanvasStage />
      <FeedbackDialog />
      <FeedbackBoard />
      <CreationsDialog />
      <PerfHub />

      <div className="pointer-events-none absolute inset-0 z-20 flex min-h-0 flex-col justify-between overflow-hidden">
        <div 
          className="pointer-events-auto relative flex flex-col transition-transform duration-300 ease-in-out" 
          style={{ transform: uiTopOpen ? 'translateY(0)' : 'translateY(-100%)' }}
        >
          <Hud />
          <GeneratorBar />
          <ScenesBar />
          <button 
            onClick={toggleUiTop} 
            className="absolute -bottom-7 right-4 flex h-7 items-center justify-center rounded-b-md border-b border-l border-r border-border bg-surface/80 px-4 backdrop-blur-md text-faint hover:text-fg transition-colors"
            aria-label="Toggle Top Menu"
          >
            <ChevronUp className={`size-4 transition-transform duration-300 ${!uiTopOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
        
        <div 
          className="pointer-events-auto relative flex flex-col transition-transform duration-300 ease-in-out" 
          style={{ transform: uiBottomOpen ? 'translateY(0)' : 'translateY(100%)' }}
        >
          <button 
            onClick={toggleUiBottom} 
            className="absolute -top-7 right-4 flex h-7 items-center justify-center rounded-t-md border-t border-l border-r border-border bg-surface/80 px-4 backdrop-blur-md text-faint hover:text-fg transition-colors"
            aria-label="Toggle Bottom Menu"
          >
            <ChevronDown className={`size-4 transition-transform duration-300 ${!uiBottomOpen ? "rotate-180" : ""}`} />
          </button>
          <ToolBar />
          <ParamDock />
        </div>
      </div>
    </div>
  );
}
