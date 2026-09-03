import { useEffect, useRef } from "react";
import type { BackgroundKind } from "@/engine/types";

type Star = { x: number; y: number; r: number; a: number; tw: number };

export function Backdrop({
  kind,
  mediaUrl,
}: {
  kind: BackgroundKind;
  mediaUrl: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);

  useEffect(() => {
    if (kind !== "starfield") return;
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const stars: Star[] = [];
    for (let i = 0; i < 160; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() < 0.12 ? 1.7 : 0.6 + Math.random() * 0.8,
        a: 0.35 + Math.random() * 0.65,
        tw: 0.5 + Math.random() * 1.6,
      });
    }
    starsRef.current = stars;
    let raf = 0;
    let dead = false;
    const loop = (now: number) => {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const bw = Math.max(1, Math.floor(w * dpr));
      const bh = Math.max(1, Math.floor(h * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = now / 1000;
      for (const s of starsRef.current) {
        const twinkle = 0.4 + 0.6 * Math.sin(t * s.tw + s.x * 12);
        ctx.fillStyle = `rgba(230,236,255,${s.a * twinkle})`;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
    };
  }, [kind]);

  if (kind === "void") return null;

  if (kind === "image") {
    if (!mediaUrl) return null;
    return (
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-70 mix-blend-soft-light"
        style={{ backgroundImage: `url(${mediaUrl})` }}
        aria-hidden
      />
    );
  }

  if (kind === "video") {
    if (!mediaUrl) return null;
    return (
      <video
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-55 mix-blend-soft-light"
        src={mediaUrl}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
      />
    );
  }

  if (kind === "gradient") {
    return (
      <div
        className="pointer-events-none absolute inset-0 mix-blend-soft-light"
        style={{
          background: "linear-gradient(180deg, #1a2744 0%, transparent 42%, #1a1010 100%)",
          opacity: 0.7,
        }}
        aria-hidden
      />
    );
  }

  if (kind === "nebula") {
    return (
      <div className="pointer-events-none absolute inset-0 mix-blend-screen" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 38% 32%, rgba(70,110,190,0.35), transparent 55%), radial-gradient(ellipse at 72% 68%, rgba(140,60,120,0.28), transparent 50%)",
          }}
        />
      </div>
    );
  }

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 size-full mix-blend-screen"
      aria-hidden
    />
  );
}
