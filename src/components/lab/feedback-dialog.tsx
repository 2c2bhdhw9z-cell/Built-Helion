import { useState, useEffect } from "react";
import {
  Bug,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Github,
  Lightbulb,
  MessageSquare,
  Plus,
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

const STORAGE_KEY = "helion_feedback_items_v2";
const VOTES_KEY = "helion_user_voted_ids_v2";

export function FeedbackDialog() {
  const isOpen = useLab((s) => s.feedbackOpen);
  const setIsOpen = useLab((s) => s.setFeedbackOpen);
  const telemetry = useLab((s) => s.telemetry);
  const params = useLab((s) => s.params);

  const [tab, setTab] = useState<"bug" | "feature" | "idea" | "roadmap">("bug");
  const [items, setItems] = useState<FeedbackItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // fallback
    }
    return [];
  });

  const [votedIds, setVotedIds] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(VOTES_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // fallback
    }
    return {};
  });

  // Bug form state
  const [bugTitle, setBugTitle] = useState("");
  const [bugCategory, setBugCategory] = useState("WebGL2 / WebGPU Crash");
  const [bugSeverity, setBugSeverity] = useState("Medium");
  const [bugDesc, setBugDesc] = useState("");
  const [bugSteps, setBugSteps] = useState("");
  const [includeDiag, setIncludeDiag] = useState(true);

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem(VOTES_KEY, JSON.stringify(votedIds));
    } catch {
      // ignore
    }
  }, [votedIds]);

  const getSystemDiagnostics = () => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "Unknown";
    const screenRes = typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight} (DPR: ${window.devicePixelRatio || 1})` : "N/A";
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

  const handleVote = (id: string) => {
    const hasVoted = !!votedIds[id];
    setVotedIds((prev) => ({ ...prev, [id]: !hasVoted }));
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
  };

  const handleCreateBug = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugTitle.trim() || !bugDesc.trim()) return;

    const diagInfo = includeDiag ? getSystemDiagnostics() : undefined;
    const newItem: FeedbackItem = {
      id: `bug-${Date.now()}`,
      type: "bug",
      title: bugTitle.trim(),
      category: bugCategory,
      severityOrPriority: bugSeverity,
      description: bugDesc.trim(),
      stepsOrUseCases: bugSteps.trim(),
      votes: 1,
      hasVoted: true,
      status: "under_review",
      createdAt: new Date().toISOString(),
      diagnostics: diagInfo,
    };

    setItems((prev) => [newItem, ...prev]);
    setVotedIds((prev) => ({ ...prev, [newItem.id]: true }));
    setBugTitle("");
    setBugDesc("");
    setBugSteps("");
    setSubmittedToast("Bug report submitted! Saved to community board.");
    setTimeout(() => setSubmittedToast(null), 4000);
    setTab("roadmap");
  };

  const handleCreateFeature = (e: React.FormEvent) => {
    e.preventDefault();
    if (!featTitle.trim() || !featDesc.trim()) return;

    const newItem: FeedbackItem = {
      id: `feat-${Date.now()}`,
      type: "feature",
      title: featTitle.trim(),
      category: featCategory,
      severityOrPriority: featPriority,
      description: featDesc.trim(),
      stepsOrUseCases: featUseCases.trim(),
      votes: 1,
      hasVoted: true,
      status: "under_review",
      createdAt: new Date().toISOString(),
    };

    setItems((prev) => [newItem, ...prev]);
    setVotedIds((prev) => ({ ...prev, [newItem.id]: true }));
    setFeatTitle("");
    setFeatDesc("");
    setFeatUseCases("");
    setSubmittedToast("Feature request posted! Ready for upvoting.");
    setTimeout(() => setSubmittedToast(null), 4000);
    setTab("roadmap");
  };

  const handleCreateFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;

    const newItem: FeedbackItem = {
      id: `idea-${Date.now()}`,
      type: "idea",
      title: `Feedback (${rating}★): ${feedbackText.slice(0, 45)}${feedbackText.length > 45 ? "..." : ""}`,
      category: "User Experience",
      description: feedbackText.trim(),
      rating,
      userEmail: feedbackEmail.trim() || undefined,
      votes: 1,
      hasVoted: true,
      status: "under_review",
      createdAt: new Date().toISOString(),
    };

    setItems((prev) => [newItem, ...prev]);
    setFeedbackText("");
    setFeedbackEmail("");
    setSubmittedToast("Thank you! Your feedback and rating have been recorded.");
    setTimeout(() => setSubmittedToast(null), 4000);
    setTab("roadmap");
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
      item.stepsOrUseCases ? `### ${isBug ? "Steps to Reproduce" : "Use Cases & Practical Value"}\n${item.stepsOrUseCases}\n` : "",
      item.severityOrPriority ? `**Category**: ${item.category} | **Severity/Priority**: ${item.severityOrPriority}\n` : "",
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
                Feedback & Issues
              </span>
            </div>
            <p className="text-xs text-muted">
              Report bugs, suggest physics features, and vote on community ideas.
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
            <button
              onClick={() => setSubmittedToast(null)}
              className="text-ok/70 hover:text-ok"
            >
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-fg">Category</label>
                    <select
                      value={bugCategory}
                      onChange={(e) => setBugCategory(e.target.value)}
                      className="h-9 rounded-md border border-border bg-elevated px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                    >
                      <option value="WebGL2 / WebGPU Crash">WebGL2 / WebGPU</option>
                      <option value="Physics / Collision Glitch">Physics Simulation</option>
                      <option value="Visual FX & Shaders">Visual FX / Bloom</option>
                      <option value="Performance & Lag">Performance / FPS</option>
                      <option value="UI & Controls">UI & Sliders</option>
                      <option value="Mobile & Touch">Mobile / Touch</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-fg">Severity</label>
                    <select
                      value={bugSeverity}
                      onChange={(e) => setBugSeverity(e.target.value)}
                      className="h-9 rounded-md border border-border bg-elevated px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                    >
                      <option value="Low">Low (Visual glitch)</option>
                      <option value="Medium">Medium (Affects use)</option>
                      <option value="High">High (Major flaw)</option>
                      <option value="Critical">Critical (Crash/Freeze)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-fg">Description of Bug *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe what happened and what you expected to happen..."
                  value={bugDesc}
                  onChange={(e) => setBugDesc(e.target.value)}
                  className="rounded-md border border-border bg-elevated p-2.5 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-fg">Steps to Reproduce (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="1. Open Visuals tab&#10;2. Enable Bloom with Additive blend&#10;3. Click Pour..."
                  value={bugSteps}
                  onChange={(e) => setBugSteps(e.target.value)}
                  className="rounded-md border border-border bg-elevated p-2.5 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>

              {/* System Diagnostics Box */}
              <div className="rounded-lg border border-border bg-elevated/60 p-3">
                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-fg">
                    <input
                      type="checkbox"
                      checked={includeDiag}
                      onChange={(e) => setIncludeDiag(e.target.checked)}
                      className="size-3.5 rounded accent-accent"
                    />
                    <span>Auto-attach Real-time Diagnostics</span>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-2xs"
                    onClick={handleCopyDiagnostics}
                  >
                    <Clipboard className="size-3" />
                    {copiedDiag ? "Copied!" : "Copy Diagnostics"}
                  </Button>
                </div>
                {includeDiag && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-2xs font-mono text-muted sm:grid-cols-4">
                    <div className="rounded bg-surface px-2 py-1">
                      <span className="text-faint">Backend:</span> {telemetry.backend}
                    </div>
                    <div className="rounded bg-surface px-2 py-1">
                      <span className="text-faint">FPS:</span> {telemetry.fps.toFixed(0)} ({telemetry.frameMs.toFixed(1)}ms)
                    </div>
                    <div className="rounded bg-surface px-2 py-1">
                      <span className="text-faint">Particles:</span> {telemetry.live.toLocaleString()}
                    </div>
                    <div className="rounded bg-surface px-2 py-1">
                      <span className="text-faint">NaN Count:</span> {telemetry.nanCount}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-2xs text-faint">
                  Submissions are posted to the Helion Community Board and can be opened directly on GitHub.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!bugTitle) return;
                      openGitHubIssue({
                        id: "preview",
                        type: "bug",
                        title: bugTitle,
                        category: bugCategory,
                        severityOrPriority: bugSeverity,
                        description: bugDesc,
                        stepsOrUseCases: bugSteps,
                        votes: 1,
                        status: "under_review",
                        createdAt: new Date().toISOString(),
                        diagnostics: getSystemDiagnostics(),
                      });
                    }}
                  >
                    <Github className="size-3.5" />
                    Post to GitHub
                  </Button>
                  <Button type="submit" variant="default" size="sm" className="gap-1.5 bg-accent text-accent-fg">
                    <Plus className="size-3.5" />
                    Submit Bug Report
                  </Button>
                </div>
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
                    placeholder="e.g. 3D Gyroscope Gravity in Mobile VR"
                    value={featTitle}
                    onChange={(e) => setFeatTitle(e.target.value)}
                    className="h-9 rounded-md border border-border bg-elevated px-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-fg">Category</label>
                    <select
                      value={featCategory}
                      onChange={(e) => setFeatCategory(e.target.value)}
                      className="h-9 rounded-md border border-border bg-elevated px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                    >
                      <option value="Forces & Physics Simulation">Physics & Forces</option>
                      <option value="New Generator / Preset">Generator Preset</option>
                      <option value="Visual FX & Shaders">Visual FX & Shaders</option>
                      <option value="Interactive Brushes & Tools">Tools & Brushes</option>
                      <option value="Audio & Music Reactivity">Audio & Music</option>
                      <option value="Export & Capture">Export & Video</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-fg">Impact Level</label>
                    <select
                      value={featPriority}
                      onChange={(e) => setFeatPriority(e.target.value)}
                      className="h-9 rounded-md border border-border bg-elevated px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                    >
                      <option value="Nice to have">Nice to have</option>
                      <option value="Exciting">Exciting</option>
                      <option value="Game Changer">Game Changer</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-fg">Feature Description *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain what capability you would like to see in Helion..."
                  value={featDesc}
                  onChange={(e) => setFeatDesc(e.target.value)}
                  className="rounded-md border border-border bg-elevated p-2.5 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-fg">Why is this useful / Practical Use Case</label>
                <textarea
                  rows={2}
                  placeholder="How will creators, artists, or developers benefit from this?"
                  value={featUseCases}
                  onChange={(e) => setFeatUseCases(e.target.value)}
                  className="rounded-md border border-border bg-elevated p-2.5 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-2xs text-faint">
                  Features with high community upvotes get prioritized for active GPU compute implementation.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!featTitle) return;
                      openGitHubIssue({
                        id: "preview-feat",
                        type: "feature",
                        title: featTitle,
                        category: featCategory,
                        severityOrPriority: featPriority,
                        description: featDesc,
                        stepsOrUseCases: featUseCases,
                        votes: 1,
                        status: "under_review",
                        createdAt: new Date().toISOString(),
                      });
                    }}
                  >
                    <Github className="size-3.5" />
                    Open as GitHub Request
                  </Button>
                  <Button type="submit" variant="default" size="sm" className="gap-1.5 bg-accent text-accent-fg">
                    <Lightbulb className="size-3.5" />
                    Submit Feature Request
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* 3. GENERAL FEEDBACK & RATING TAB */}
          {tab === "idea" && (
            <form onSubmit={handleCreateFeedback} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-fg">How is your experience with Helion Particle Lab?</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg border transition-all",
                        rating >= star
                          ? "border-warn/40 bg-warn/15 text-warn"
                          : "border-border bg-elevated text-muted hover:border-border-strong"
                      )}
                    >
                      <Star className={cn("size-4", rating >= star && "fill-warn")} />
                    </button>
                  ))}
                  <span className="ml-2 font-mono text-xs text-muted">
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
                  required
                  rows={4}
                  placeholder="Share what you love, what feels clunky, or ideas for improving the particle engine..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="rounded-md border border-border bg-elevated p-2.5 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
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
                <Button type="submit" variant="default" size="sm" className="gap-1.5 bg-accent text-accent-fg">
                  <MessageSquare className="size-3.5" />
                  Send Feedback
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
                {filteredItems.length === 0 ? (
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

                        <p className="text-xs text-muted leading-relaxed pl-[42px]">
                          {item.description}
                        </p>

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
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(items, null, 2));
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
