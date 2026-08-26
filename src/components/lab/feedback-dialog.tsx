import { useState, useEffect } from "react";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  increment,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Bug,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Github,
  Lightbulb,
  MessageSquare,
  Search,
  Star,
  ThumbsUp,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { cn } from "@/lib/utils";

export type FeedbackType = "bug" | "feature" | "idea";
export type FeedbackStatus = "under_review" | "planned" | "in_progress" | "completed";

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  title: string;
  category: string;
  description: string;
  stepsOrUseCases?: string;
  severityOrPriority?: string;
  rating?: number;
  votes: number;
  hasVoted?: boolean;
  status: FeedbackStatus;
  createdAt: string;
  diagnostics?: string;
  userEmail?: string;
}

const VOTES_KEY = "helion_user_voted_ids_v2";

const FEEDBACK_ITEMS_KEY = "helion_feedback_cached_items_v2";

export function FeedbackDialog() {
  const isOpen = useLab((s) => s.feedbackOpen);
  const setIsOpen = useLab((s) => s.setFeedbackOpen);
  const telemetry = useLab((s) => s.telemetry);
  const params = useLab((s) => s.params);

  const [tab, setTab] = useState<"bug" | "feature" | "idea" | "roadmap">("bug");
  const [items, setItems] = useState<FeedbackItem[]>(() => {
    try {
      const cached = localStorage.getItem(FEEDBACK_ITEMS_KEY);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return [];
  });
  const [loading, setLoading] = useState(false);

  const [votedIds, setVotedIds] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(VOTES_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // fallback
    }
    return {};
  });

  // Sync to local cache
  useEffect(() => {
    if (items.length > 0) {
      try {
        localStorage.setItem(FEEDBACK_ITEMS_KEY, JSON.stringify(items));
      } catch {
        // ignore
      }
    }
  }, [items]);

  // Real-time Firestore sync ONLY when dialog is active/open
  useEffect(() => {
    if (!isOpen) return;

    setLoading(items.length === 0);
    try {
      const q = query(collection(db, "feedback_items"), orderBy("createdAt", "desc"));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const loaded: FeedbackItem[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            loaded.push({
              id: docSnap.id,
              type: data.type || "idea",
              title: data.title || "Untitled",
              category: data.category || "General",
              description: data.description || "",
              stepsOrUseCases: data.stepsOrUseCases || "",
              severityOrPriority: data.severityOrPriority || "",
              rating: data.rating,
              votes: typeof data.votes === "number" ? data.votes : 1,
              status: (data.status as FeedbackStatus) || "under_review",
              createdAt: data.createdAt || new Date().toISOString(),
              diagnostics: data.diagnostics,
              userEmail: data.userEmail,
            });
          });
          setItems(loaded);
          setLoading(false);
        },
        (error) => {
          // Graceful fallback for offline / unreached backend
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (e) {
      setLoading(false);
    }
  }, [isOpen]);

  // Bug form state
  const [bugTitle, setBugTitle] = useState("");
  const [bugCategory, setBugCategory] = useState("WebGL2 / WebGPU Crash");
  const [bugSeverity, setBugSeverity] = useState("Medium");
  const [bugDesc, setBugDesc] = useState("");
  const [bugSteps, setBugSteps] = useState("");
  const [includeDiag, setIncludeDiag] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Feature form state
  const [featTitle, setFeatTitle] = useState("");
  const [featCategory, setFeatCategory] = useState("Forces & Physics Simulation");
  const [featPriority, setFeatPriority] = useState("Exciting");
  const [featDesc, setFeatDesc] = useState("");
  const [featUseCases, setFeatUseCases] = useState("");

  // Feedback form state
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");

  // Filter state for Roadmap
  const [filterType, setFilterType] = useState<"all" | "bug" | "feature">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedToast, setSubmittedToast] = useState<string | null>(null);
  const [copiedDiag, setCopiedDiag] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(VOTES_KEY, JSON.stringify(votedIds));
    } catch {
      // ignore
    }
  }, [votedIds]);

  const getSystemDiagnostics = () => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "Unknown";
    const screenRes =
      typeof window !== "undefined"
        ? `${window.innerWidth}x${window.innerHeight} (DPR: ${window.devicePixelRatio || 1})`
        : "N/A";
    return [
      `### Helion System Diagnostics`,
      `- **Engine Backend**: ${telemetry.backend} (${telemetry.compute})`,
      `- **Live Particles**: ${telemetry.live.toLocaleString()} / ${telemetry.cap.toLocaleString()}`,
      `- **FPS / Frame Time**: ${telemetry.fps.toFixed(1)} FPS (${telemetry.frameMs.toFixed(2)} ms)`,
      `- **NaN Particles**: ${telemetry.nanCount}`,
      `- **Screen & Viewport**: ${screenRes}`,
      `- **User Agent**: ${ua}`,
      `- **Active Palette**: ${params.palette} | Blend: ${params.blend}`,
      `- **Bloom Enabled**: ${params.bloom} (Strength: ${params.bloomStrength})`,
      `- **Trails Enabled**: ${params.trails} (Decay: ${params.trailDecay})`,
      `- **Gravity**: X: ${params.gravityX}, Y: ${params.gravityY} | Central Mass: ${params.centralMass}`,
      `- **Timestamp**: ${new Date().toISOString()}`,
    ].join("\n");
  };

  const handleCopyDiagnostics = () => {
    const diag = getSystemDiagnostics();
    navigator.clipboard.writeText(diag);
    setCopiedDiag(true);
    setTimeout(() => setCopiedDiag(false), 2000);
  };

  const handleVote = async (id: string) => {
    const hasVoted = !!votedIds[id];
    setVotedIds((prev) => ({ ...prev, [id]: !hasVoted }));

    // Optimistic local update
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            votes: hasVoted ? Math.max(0, item.votes - 1) : item.votes + 1,
            hasVoted: !hasVoted,
          };
        }
        return item;
      })
    );

    // Save vote to Firestore
    try {
      const docRef = doc(db, "feedback_items", id);
      await updateDoc(docRef, {
        votes: increment(hasVoted ? -1 : 1),
      });
    } catch (e) {
      console.warn("Error updating vote in Firestore:", e);
    }
  };

  const handleCreateBug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugTitle.trim() || !bugDesc.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const diagInfo = includeDiag ? getSystemDiagnostics() : "";
    const docId = `bug-${Date.now()}`;
    const newItemData = {
      type: "bug",
      title: bugTitle.trim(),
      category: bugCategory,
      severityOrPriority: bugSeverity,
      description: bugDesc.trim(),
      stepsOrUseCases: bugSteps.trim(),
      votes: 1,
      status: "under_review",
      createdAt: new Date().toISOString(),
      diagnostics: diagInfo,
    };

    try {
      await setDoc(doc(db, "feedback_items", docId), newItemData);
      setVotedIds((prev) => ({ ...prev, [docId]: true }));
      setBugTitle("");
      setBugDesc("");
      setBugSteps("");
      setSubmittedToast("Bug report submitted and stored in the cloud!");
      setTimeout(() => setSubmittedToast(null), 4000);
      setTab("roadmap");
    } catch (err) {
      console.error("Failed to submit bug report to Firestore:", err);
      // Local fallback
      setItems((prev) => [{ ...newItemData, id: docId, type: "bug", status: "under_review" }, ...prev]);
      setSubmittedToast("Bug report saved locally (Cloud sync unavailable).");
      setTimeout(() => setSubmittedToast(null), 4000);
      setTab("roadmap");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!featTitle.trim() || !featDesc.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const docId = `feat-${Date.now()}`;
    const newItemData = {
      type: "feature",
      title: featTitle.trim(),
      category: featCategory,
      severityOrPriority: featPriority,
      description: featDesc.trim(),
      stepsOrUseCases: featUseCases.trim(),
      votes: 1,
      status: "under_review",
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "feedback_items", docId), newItemData);
      setVotedIds((prev) => ({ ...prev, [docId]: true }));
      setFeatTitle("");
      setFeatDesc("");
      setFeatUseCases("");
      setSubmittedToast("Feature request posted! Now live for everyone to upvote.");
      setTimeout(() => setSubmittedToast(null), 4000);
      setTab("roadmap");
    } catch (err) {
      console.error("Failed to submit feature request to Firestore:", err);
      setItems((prev) => [{ ...newItemData, id: docId, type: "feature", status: "under_review" }, ...prev]);
      setSubmittedToast("Feature request saved locally.");
      setTimeout(() => setSubmittedToast(null), 4000);
      setTab("roadmap");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const docId = `idea-${Date.now()}`;
    const newItemData = {
      type: "idea",
      title: `Feedback (${rating}★): ${feedbackText.slice(0, 45)}${feedbackText.length > 45 ? "..." : ""}`,
      category: "User Experience",
      description: feedbackText.trim(),
      rating,
      userEmail: feedbackEmail.trim() || "",
      votes: 1,
      status: "under_review",
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "feedback_items", docId), newItemData);
      setVotedIds((prev) => ({ ...prev, [docId]: true }));
      setFeedbackText("");
      setFeedbackEmail("");
      setSubmittedToast("Thank you! Your feedback & star rating were saved to the cloud.");
      setTimeout(() => setSubmittedToast(null), 4000);
      setTab("roadmap");
    } catch (err) {
      console.error("Failed to submit review to Firestore:", err);
      setItems((prev) => [{ ...newItemData, id: docId, type: "idea", status: "under_review" }, ...prev]);
      setSubmittedToast("Feedback saved.");
      setTimeout(() => setSubmittedToast(null), 4000);
      setTab("roadmap");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openGitHubIssue = (item?: FeedbackItem) => {
    const repoUrl = "https://github.com/2c2bhdhw9z-cell/Built-Helion/issues/new";
    if (!item) {
      window.open(repoUrl, "_blank");
      return;
    }
    const isBug = item.type === "bug";
    const title = encodeURIComponent(`[${isBug ? "BUG" : "FEATURE"}] ${item.title}`);
    const bodyContent = [
      `### ${isBug ? "Bug Description" : "Feature Summary"}`,
      item.description,
      "",
      item.stepsOrUseCases
        ? `### ${isBug ? "Steps to Reproduce" : "Use Cases & Practical Value"}\n${item.stepsOrUseCases}\n`
        : "",
      item.severityOrPriority
        ? `**Category**: ${item.category} | **Severity/Priority**: ${item.severityOrPriority}\n`
        : "",
      item.diagnostics ? `\n${item.diagnostics}` : `\n${getSystemDiagnostics()}`,
    ].join("\n");

    const fullUrl = `${repoUrl}?title=${title}&body=${encodeURIComponent(bodyContent)}`;
    window.open(fullUrl, "_blank");
  };

  const filteredItems = items.filter((item) => {
    if (filterType !== "all" && item.type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bg/85 backdrop-blur-md transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal Card */}
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border bg-elevated/80 px-4 py-3 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-wider text-fg">HELION DISPATCH</span>
              <span className="rounded bg-accent/20 px-1.5 py-0.5 font-mono text-2xs text-accent">
                Cloud Sync • Firestore
              </span>
            </div>
            <p className="text-xs text-muted">
              Submit bug reports, request physics features, and vote on live community ideas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hidden gap-1.5 text-xs sm:inline-flex"
              onClick={() => openGitHubIssue()}
            >
              <Github className="size-3.5" />
              GitHub Issues
              <ExternalLink className="size-3 opacity-60" />
            </Button>
            <button
              onClick={() => setIsOpen(false)}
              className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-fg"
              aria-label="Close modal"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-border bg-surface px-4 pt-2 sm:px-6">
          <button
            onClick={() => setTab("bug")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              tab === "bug"
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-fg"
            )}
          >
            <Bug className="size-3.5" />
            Report Bug
          </button>
          <button
            onClick={() => setTab("feature")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              tab === "feature"
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-fg"
            )}
          >
            <Lightbulb className="size-3.5" />
            Feature Request
          </button>
          <button
            onClick={() => setTab("idea")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              tab === "idea"
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-fg"
            )}
          >
            <MessageSquare className="size-3.5" />
            General Feedback
          </button>
          <button
            onClick={() => setTab("roadmap")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              tab === "roadmap"
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-fg"
            )}
          >
            <Zap className="size-3.5" />
            Roadmap & Community ({items.length})
          </button>
        </div>

        {/* Toast Alert */}
        {submittedToast && (
          <div className="flex items-center justify-between border-b border-ok/30 bg-ok/10 px-4 py-2 text-xs text-ok">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4" />
              <span>{submittedToast}</span>
            </div>
            <button onClick={() => setSubmittedToast(null)} className="text-ok/70 hover:text-ok">
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* Modal Body Container */}
        <div className="lab-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {/* 1. REPORT A BUG TAB */}
          {tab === "bug" && (
            <form onSubmit={handleCreateBug} className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-fg">Bug Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Canvas flickers when bloom is enabled with trails"
                    value={bugTitle}
                    onChange={(e) => setBugTitle(e.target.value)}
                    className="h-9 rounded-md border border-border bg-elevated px-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-fg">Component / Category</label>
                  <select
                    value={bugCategory}
                    onChange={(e) => setBugCategory(e.target.value)}
                    className="h-9 rounded-md border border-border bg-elevated px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                  >
                    <option value="WebGL2 / WebGPU Crash">WebGL2 / WebGPU Crash</option>
                    <option value="Physics Engine / NaN Glitch">Physics Engine / NaN Glitch</option>
                    <option value="UI & Controls / Slider Glitch">UI & Controls / Slider Glitch</option>
                    <option value="Rendering / Bloom / Shaders">Rendering / Bloom / Shaders</option>
                    <option value="Audio / MIDI Integration">Audio / MIDI Integration</option>
                    <option value="Performance / FPS Drop">Performance / FPS Drop</option>
                    <option value="Preset Import & Export">Preset Import & Export</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-fg">Severity Level</label>
                  <select
                    value={bugSeverity}
                    onChange={(e) => setBugSeverity(e.target.value)}
                    className="h-9 rounded-md border border-border bg-elevated px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                  >
                    <option value="Critical (App crashes or freezes)">Critical (App crashes or freezes)</option>
                    <option value="High (Broken physics or visual glitch)">High (Broken physics or visual glitch)</option>
                    <option value="Medium (Functional but annoying)">Medium (Functional but annoying)</option>
                    <option value="Low (Cosmetic/Typo)">Low (Cosmetic/Typo)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-fg">Steps to Reproduce</label>
                  <input
                    type="text"
                    placeholder="1. Set generator to Burst. 2. Tap Force slider."
                    value={bugSteps}
                    onChange={(e) => setBugSteps(e.target.value)}
                    className="h-9 rounded-md border border-border bg-elevated px-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-fg">Detailed Description *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe what happened, what you expected to see, and any specific browser quirks..."
                  value={bugDesc}
                  onChange={(e) => setBugDesc(e.target.value)}
                  className="rounded-md border border-border bg-elevated p-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-border bg-elevated/50 p-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-medium text-fg">
                    <input
                      type="checkbox"
                      checked={includeDiag}
                      onChange={(e) => setIncludeDiag(e.target.checked)}
                      className="rounded border-border bg-surface text-accent focus:ring-accent"
                    />
                    Attach Live Diagnostics (FPS: {telemetry.fps.toFixed(0)}, {telemetry.backend}, {telemetry.live} particles)
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyDiagnostics}
                    className="flex items-center gap-1 font-mono text-2xs text-muted hover:text-fg"
                  >
                    <Clipboard className="size-3" />
                    {copiedDiag ? "Copied!" : "Copy Raw Diag"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  variant="default"
                  size="sm"
                  className="gap-1.5 bg-danger text-white hover:bg-danger/90"
                >
                  <Bug className="size-3.5" />
                  {isSubmitting ? "Saving..." : "Submit Bug Report"}
                </Button>
              </div>
            </form>
          )}

          {/* 2. FEATURE REQUEST TAB */}
          {tab === "feature" && (
            <form onSubmit={handleCreateFeature} className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-fg">Feature / Idea Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Add Gravitational Lensing & Black Hole Distortion"
                    value={featTitle}
                    onChange={(e) => setFeatTitle(e.target.value)}
                    className="h-9 rounded-md border border-border bg-elevated px-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-fg">Domain Category</label>
                  <select
                    value={featCategory}
                    onChange={(e) => setFeatCategory(e.target.value)}
                    className="h-9 rounded-md border border-border bg-elevated px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                  >
                    <option value="Forces & Physics Simulation">Forces & Physics Simulation</option>
                    <option value="Visual Shaders & Post-FX">Visual Shaders & Post-FX</option>
                    <option value="Interactive Brushes & Tools">Interactive Brushes & Tools</option>
                    <option value="Audio Reactive / Synth Mapping">Audio Reactive / Synth Mapping</option>
                    <option value="Performance & WebGPU Optimization">Performance & WebGPU Optimization</option>
                    <option value="Presets, Export & Sharing">Presets, Export & Sharing</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-fg">Priority & Excitement</label>
                <select
                  value={featPriority}
                  onChange={(e) => setFeatPriority(e.target.value)}
                  className="h-9 rounded-md border border-border bg-elevated px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                >
                  <option value="Game Changer (Must have for serious work)">Game Changer (Must have for serious work)</option>
                  <option value="Exciting (Would make simulation 10x cooler)">Exciting (Would make simulation 10x cooler)</option>
                  <option value="Nice to have (Polishing touch)">Nice to have (Polishing touch)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-fg">Feature Description *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain how this feature should behave and what interactive parameters it should introduce..."
                  value={featDesc}
                  onChange={(e) => setFeatDesc(e.target.value)}
                  className="rounded-md border border-border bg-elevated p-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-fg">Practical Use Cases / Inspiration</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Useful for generating procedural nebula backgrounds or VJ concert backgrounds..."
                  value={featUseCases}
                  onChange={(e) => setFeatUseCases(e.target.value)}
                  className="rounded-md border border-border bg-elevated p-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  variant="default"
                  size="sm"
                  className="gap-1.5 bg-accent text-accent-fg hover:bg-accent/90"
                >
                  <Lightbulb className="size-3.5" />
                  {isSubmitting ? "Submitting..." : "Submit Feature Request"}
                </Button>
              </div>
            </form>
          )}

          {/* 3. GENERAL FEEDBACK TAB */}
          {tab === "idea" && (
            <form onSubmit={handleCreateFeedback} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-fg">How is your experience with Helion Particle Lab?</label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="rounded p-1 transition-transform hover:scale-110 active:scale-95"
                    >
                      <Star
                        className={cn(
                          "size-5",
                          star <= rating
                            ? "fill-warn text-warn"
                            : "text-border hover:text-muted"
                        )}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-xs font-medium text-muted">
                    {rating === 5
                      ? "Flawless & Fast ⚡"
                      : rating === 4
                        ? "Great Experience 👍"
                        : rating === 3
                          ? "Good / Average"
                          : rating === 2
                            ? "Needs Improvement"
                            : "Bad, Really Really Bad."}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-fg">Your Thoughts, Praises, or Feedback *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Share what you love, what feels clunky, or ideas for improving the particle engine..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="rounded-md border border-border bg-elevated p-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-fg">Email (Optional, if you want developer updates)</label>
                <input
                  type="email"
                  placeholder="your.name@domain.com"
                  value={feedbackEmail}
                  onChange={(e) => setFeedbackEmail(e.target.value)}
                  className="h-9 max-w-sm rounded-md border border-border bg-elevated px-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>

              <div className="mt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  variant="default"
                  size="sm"
                  className="gap-1.5 bg-accent text-accent-fg"
                >
                  <MessageSquare className="size-3.5" />
                  {isSubmitting ? "Sending..." : "Send Feedback"}
                </Button>
              </div>
            </form>
          )}

          {/* 4. ROADMAP & COMMUNITY BOARD */}
          {tab === "roadmap" && (
            <div className="flex flex-col gap-3">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setFilterType("all")}
                    className={cn(
                      "rounded px-2.5 py-1 text-2xs font-medium transition-colors",
                      filterType === "all"
                        ? "bg-fg text-accent-fg"
                        : "bg-elevated text-muted hover:text-fg"
                    )}
                  >
                    All ({items.length})
                  </button>
                  <button
                    onClick={() => setFilterType("feature")}
                    className={cn(
                      "flex items-center gap-1 rounded px-2.5 py-1 text-2xs font-medium transition-colors",
                      filterType === "feature"
                        ? "bg-accent/20 text-accent"
                        : "bg-elevated text-muted hover:text-fg"
                    )}
                  >
                    <Lightbulb className="size-3" />
                    Features ({items.filter((i) => i.type === "feature").length})
                  </button>
                  <button
                    onClick={() => setFilterType("bug")}
                    className={cn(
                      "flex items-center gap-1 rounded px-2.5 py-1 text-2xs font-medium transition-colors",
                      filterType === "bug"
                        ? "bg-danger/20 text-danger"
                        : "bg-elevated text-muted hover:text-fg"
                    )}
                  >
                    <Bug className="size-3" />
                    Bugs ({items.filter((i) => i.type === "bug").length})
                  </button>
                </div>

                <div className="relative flex min-w-[180px] items-center">
                  <Search className="absolute left-2.5 size-3.5 text-faint" />
                  <input
                    type="text"
                    placeholder="Search proposals..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-7 w-full rounded-md border border-border bg-elevated pl-8 pr-2 text-2xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              {/* Items List */}
              <div className="flex flex-col gap-2.5">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-xs text-muted">
                    Loading community items...
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
                    <MessageSquare className="mb-2 size-6 text-faint" />
                    <p className="text-xs font-medium text-fg">No feedback or reports submitted yet</p>
                    <p className="mt-1 max-w-sm text-2xs text-muted">
                      Use the "Report Bug", "Feature Request", or "General Feedback" tabs to submit issues or ideas.
                    </p>
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const isVoted = !!votedIds[item.id];
                    const isBug = item.type === "bug";
                    return (
                      <div
                        key={item.id}
                        className="group flex flex-col gap-2 rounded-lg border border-border bg-elevated/70 p-3.5 transition-all hover:border-border-strong hover:bg-elevated"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            {/* Upvote Button */}
                            <button
                              onClick={() => handleVote(item.id)}
                              className={cn(
                                "flex flex-col items-center justify-center rounded-md border px-2 py-1.5 text-2xs transition-all active:scale-95",
                                isVoted
                                  ? "border-accent/40 bg-accent/20 text-accent font-medium"
                                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg"
                              )}
                              title={isVoted ? "Remove vote" : "Upvote this feature/issue"}
                            >
                              <ThumbsUp className={cn("size-3.5", isVoted && "fill-accent")} />
                              <span className="font-mono mt-0.5">{item.votes}</span>
                            </button>

                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wide",
                                    isBug
                                      ? "bg-danger/20 text-danger"
                                      : item.type === "feature"
                                        ? "bg-accent/20 text-accent"
                                        : "bg-warn/20 text-warn"
                                  )}
                                >
                                  {isBug ? <Bug className="size-2.5" /> : <Lightbulb className="size-2.5" />}
                                  {item.type}
                                </span>
                                <span className="text-2xs text-faint">• {item.category}</span>
                                {item.status && (
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.2 text-2xs font-mono capitalize",
                                      item.status === "completed"
                                        ? "bg-ok/20 text-ok"
                                        : item.status === "in_progress"
                                          ? "bg-warn/20 text-warn"
                                          : item.status === "planned"
                                            ? "bg-accent/20 text-accent"
                                            : "bg-surface text-muted"
                                    )}
                                  >
                                    {item.status.replace("_", " ")}
                                  </span>
                                )}
                              </div>
                              <h4 className="text-xs font-semibold text-fg">{item.title}</h4>
                            </div>
                          </div>

                          {/* Action button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-2xs opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => openGitHubIssue(item)}
                            title="Export to GitHub Issue"
                          >
                            <Github className="size-3" />
                            <span className="hidden sm:inline">Export</span>
                          </Button>
                        </div>

                        <p className="text-xs text-muted leading-relaxed pl-[42px]">{item.description}</p>

                        {item.stepsOrUseCases && (
                          <div className="ml-[42px] rounded bg-surface/80 p-2 text-2xs text-faint">
                            <span className="font-medium text-muted">
                              {isBug ? "Steps: " : "Use Case: "}
                            </span>
                            {item.stepsOrUseCases}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between border-t border-border bg-elevated/80 px-4 py-2.5 text-2xs text-muted sm:px-6">
          <div className="flex items-center gap-3">
            <span>Helion v2.4 (Active Backend: {telemetry.backend})</span>
            <button
              onClick={() => {
                const dataStr =
                  "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(items, null, 2));
                const dl = document.createElement("a");
                dl.setAttribute("href", dataStr);
                dl.setAttribute("download", `helion_feedback_${Date.now()}.json`);
                dl.click();
              }}
              className="text-faint underline hover:text-fg"
            >
              Export JSON
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-faint">Repository:</span>
            <a
              href="https://github.com/2c2bhdhw9z-cell/Built-Helion"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 font-mono text-accent hover:underline"
            >
              2c2bhdhw9z-cell/Built-Helion
              <ExternalLink className="size-2.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
