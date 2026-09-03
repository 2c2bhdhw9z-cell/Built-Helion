import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { LogIn, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { generateLabFn } from "@/lib/ai/functions";
import { parseParticleCsv } from "@/lib/import/csv";
import { parseObjVertices } from "@/lib/import/obj";
import { sampleImageFile, sampleVideoElement } from "@/lib/import/image-particles";
import { awardBadge } from "@/lib/play/progress";

export function CreateDialog() {
  const open = useLab((s) => s.createOpen);
  const setOpen = useLab((s) => s.setCreateOpen);
  const { user, isPending } = useCurrentUserState();
  const signedIn = Boolean(user);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"create" | "style" | "tune">("create");
  const [busy, setBusy] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const objRef = useRef<HTMLInputElement>(null);

  const runAi = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const result = await generateLabFn({ data: { prompt: prompt.trim(), mode } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      useLab.getState().applyAiScene(result);
      awardBadge("alchemist");
      setOpen(false);
      toast.success(result.name);
    } catch {
      toast.error("Could not reach AI");
    } finally {
      setBusy(false);
    }
  };

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const cap = useLab.getState().cap;
      const samples = await sampleImageFile(file, Math.min(cap, 80_000));
      if (!samples.length) {
        toast.error("No pixels to spawn");
        return;
      }
      useLab.getState().spawnImageSamples(samples);
      awardBadge("alchemist");
      setOpen(false);
      toast.success(`${samples.length.toLocaleString()} particles from the image`);
    } catch {
      toast.error("Could not read that image");
    } finally {
      setBusy(false);
    }
  };

  const onCsv = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseParticleCsv(text);
      if (!rows.length) {
        toast.error("No particle rows in that file");
        return;
      }
      useLab.getState().spawnCsvRows(rows);
      awardBadge("alchemist");
      setOpen(false);
      toast.success(`${rows.length.toLocaleString()} rows loaded`);
    } catch {
      toast.error("Could not read that CSV");
    } finally {
      setBusy(false);
    }
  };

  const onObj = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseObjVertices(text);
      if (!rows.length) {
        toast.error("No vertices in that file");
        return;
      }
      useLab.getState().spawnCsvRows(rows);
      awardBadge("alchemist");
      setOpen(false);
      toast.success(`${rows.length.toLocaleString()} vertices`);
    } catch {
      toast.error("Could not read that model");
    } finally {
      setBusy(false);
    }
  };

  const fromVideo = async () => {
    const video = document.querySelector("video");
    if (!video) {
      toast.error("Set a video background first (View → video)");
      return;
    }
    setBusy(true);
    try {
      const cap = useLab.getState().cap;
      const samples = await sampleVideoElement(video, Math.min(cap, 80_000));
      if (!samples.length) {
        toast.error("Need a playing video background");
        return;
      }
      useLab.getState().spawnImageSamples(samples);
      awardBadge("alchemist");
      setOpen(false);
      toast.success("Grabbed this video frame");
    } catch {
      toast.error("Could not sample the video");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(94vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">Create</Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                Text to a scene, a picture to particles, CSV, or a 3D point cloud.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="lab-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <section className="flex flex-col gap-2">
              <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">Text to particles</h3>
              {!signedIn && !isPending ? (
                <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border px-3 py-3">
                  <p className="text-sm text-fg">Sign in to spend the AI quota on a prompt.</p>
                  <Link
                    to="/login"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-fg px-3 text-sm font-medium text-accent-fg hover:opacity-90"
                  >
                    <LogIn className="size-3.5" />
                    Sign in
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {(["create", "style", "tune"] as const).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setMode(id)}
                        className={`h-8 rounded-md px-2.5 text-2xs uppercase tracking-[0.1em] ${mode === id ? "bg-fg text-accent-fg" : "border border-border text-muted"}`}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value.slice(0, 400))}
                    placeholder={
                      mode === "style"
                        ? "Van Gogh starry night"
                        : mode === "tune"
                          ? "Heavier water, slower swirl"
                          : "Fireworks over water"
                    }
                    rows={3}
                    className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg"
                  />
                  <Button disabled={busy || !prompt.trim()} onClick={() => void runAi()}>
                    {busy ? "Working…" : "Make it"}
                  </Button>
                </>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">Image / video</h3>
              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onImage(e.target.files?.[0])}
              />
              <Button variant="outline" disabled={busy} onClick={() => imageRef.current?.click()}>
                Image to particles
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void fromVideo()}>
                Video frame to particles
              </Button>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">CSV</h3>
              <p className="text-2xs text-faint">Columns: x, y, vx, vy, mass, life, phase. Unit square or world units.</p>
              <input
                ref={csvRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => void onCsv(e.target.files?.[0])}
              />
              <Button variant="outline" disabled={busy} onClick={() => csvRef.current?.click()}>
                Import CSV
              </Button>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">3D model</h3>
              <p className="text-2xs text-faint">OBJ vertices or XYZ lines. Faces are ignored — this is a point cloud.</p>
              <input
                ref={objRef}
                type="file"
                accept=".obj,.xyz,.txt,text/plain"
                className="hidden"
                onChange={(e) => void onObj(e.target.files?.[0])}
              />
              <Button variant="outline" disabled={busy} onClick={() => objRef.current?.click()}>
                Import OBJ
              </Button>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
