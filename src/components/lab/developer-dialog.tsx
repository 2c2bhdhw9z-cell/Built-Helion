import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { Copy, LogIn, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  addWebhookFn,
  createTokenFn,
  deleteWebhookFn,
  listDeliveriesFn,
  listTokensFn,
  listWebhooksFn,
  revokeTokenFn,
  type DeliveryRow,
  type TokenRow,
} from "@/lib/dev-api/functions";
import { copyText } from "@/lib/platform/clipboard";

function copyOut(text: string, ok: string) {
  void copyText(text).then((copied) => {
    if (copied) toast.success(ok);
    else toast.error("Could not copy");
  });
}

export function DeveloperDialog() {
  const open = useLab((s) => s.developerOpen);
  const setOpen = useLab((s) => s.setDeveloperOpen);
  const { user, isPending } = useCurrentUserState();
  const signedIn = Boolean(user);

  const [tokenName, setTokenName] = useState("Studio key");
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [hooks, setHooks] = useState<{ id: string; url: string }[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [hookUrl, setHookUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    if (!open || !signedIn || isPending) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([listTokensFn(), listWebhooksFn(), listDeliveriesFn()])
      .then(([t, w, d]) => {
        if (cancelled) return;
        setTokens(t);
        setHooks(w);
        setDeliveries(d);
      })
      .catch(() => {
        if (!cancelled) {
          setTokens([]);
          setHooks([]);
          setDeliveries([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, signedIn, isPending]);

  const mint = async () => {
    try {
      const next = await createTokenFn({ data: { name: tokenName } });
      setTokens((prev) => [next.row, ...prev]);
      setRevealed(next.raw);
      toast.success("Token minted — copy it now. It won’t show again.");
    } catch {
      toast.error("Could not mint a token");
    }
  };

  const revoke = async (id: string) => {
    try {
      await revokeTokenFn({ data: { id } });
      setTokens((prev) => prev.filter((t) => t.id !== id));
    } catch {
      toast.error("Could not revoke");
    }
  };

  const addHook = async () => {
    try {
      const row = await addWebhookFn({ data: { url: hookUrl } });
      setHooks((prev) => [row, ...prev]);
      setHookUrl("");
      toast.success("Webhook saved");
    } catch {
      toast.error("Need a full https URL");
    }
  };

  const dropHook = async (id: string) => {
    try {
      await deleteWebhookFn({ data: { id } });
      setHooks((prev) => prev.filter((h) => h.id !== id));
    } catch {
      toast.error("Could not remove webhook");
    }
  };

  const jsSnippet = `const res = await fetch("${origin}/api/v1/library");
const { items } = await res.json();
// Authenticated:
const mine = await fetch("${origin}/api/v1/creations", {
  headers: { Authorization: "Bearer hl_…" },
});`;

  const pySnippet = `import urllib.request, json
print(json.load(urllib.request.urlopen("${origin}/api/v1/library")))
req = urllib.request.Request(
    "${origin}/api/v1/creations",
    headers={"Authorization": "Bearer hl_…"},
)`;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(94vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">
                Developer
              </Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                REST at /api/v1. Bearer tokens, not cookies. Webhooks fire on publish.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="lab-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
            {!signedIn ? (
              <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border px-3 py-3">
                <p className="text-sm text-fg">Sign in to mint API tokens</p>
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
                <section className="flex flex-col gap-2">
                  <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">Tokens</h3>
                  <div className="flex gap-2">
                    <input
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value.slice(0, 80))}
                      placeholder="Key name"
                      aria-label="Token name"
                      data-testid="dev-token-name"
                      className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg"
                    />
                    <Button
                      variant="default"
                      className="h-10 shrink-0"
                      data-testid="dev-mint"
                      onClick={() => void mint()}
                    >
                      Mint
                    </Button>
                  </div>
                  {revealed ? (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-elevated/50 px-3 py-2">
                      <code className="min-w-0 flex-1 truncate font-mono text-2xs text-fg" data-testid="dev-token-raw">
                        {revealed}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label="Copy token"
                        onClick={() => copyOut(revealed, "Token copied")}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                  {loading ? (
                    <p className="text-2xs text-faint">Loading…</p>
                  ) : tokens.length === 0 ? (
                    <p className="text-2xs text-faint">No tokens yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {tokens.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between gap-2 rounded-sm bg-elevated/30 px-2 py-1.5 text-xs"
                        >
                          <span className="truncate">
                            {t.name}{" "}
                            <span className="font-mono text-faint">{t.prefix}…</span>
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Revoke ${t.name}`}
                            onClick={() => void revoke(t.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="flex flex-col gap-2">
                  <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">Webhooks</h3>
                  <p className="text-2xs leading-relaxed text-faint">
                    POST JSON to your URL when a creation is saved or published. 3s timeout, one retry. Last deliveries below — empty until one actually fires.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={hookUrl}
                      onChange={(e) => setHookUrl(e.target.value)}
                      placeholder="https://example.com/hook"
                      aria-label="Webhook URL"
                      data-testid="dev-hook-url"
                      className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg"
                    />
                    <Button variant="outline" className="h-10 shrink-0" onClick={() => void addHook()}>
                      Add
                    </Button>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {hooks.map((h) => (
                      <li
                        key={h.id}
                        className="flex items-center justify-between gap-2 rounded-sm bg-elevated/30 px-2 py-1.5 text-xs"
                      >
                        <span className="truncate">{h.url}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Remove ${h.url}`}
                          onClick={() => void dropHook(h.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {deliveries.length === 0 ? (
                    <p className="text-2xs text-faint">No deliveries yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {deliveries.map((d) => (
                        <li key={d.id} className="flex justify-between gap-2 rounded-sm bg-elevated/30 px-2 py-1.5 text-2xs">
                          <span className="truncate text-fg">
                            {d.event} · {d.ok ? "ok" : "failed"}
                            {d.status != null ? ` ${d.status}` : ""}
                          </span>
                          <span className="font-mono text-faint">{d.attempts}×</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">REST</h3>
              <p className="text-2xs leading-relaxed text-faint">
                GET /api/v1/meta · library · creations · history · teams · usage · webhooks/deliveries · control. Helpers at /sdk/helion.js and /sdk/helion.py.
              </p>
              <p className="text-2xs leading-relaxed text-faint">
                No FFmpeg farm, no multi-GPU, no headless GPU, no WebSocket on this host. Live control is a command queue: POST /api/v1/control, then Listen here.
              </p>
              {signedIn ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 self-start"
                  onClick={() => {
                    const raw = revealed;
                    if (!raw) {
                      toast.error("Mint a token and copy it first");
                      return;
                    }
                    useLab.getState().setListenToken(raw);
                    toast.success("Lab is listening for API commands");
                  }}
                >
                  Listen with last minted token
                </Button>
              ) : null}
              <pre className="overflow-x-auto rounded-md border border-border bg-elevated/40 p-3 font-mono text-2xs leading-relaxed text-muted">
                {jsSnippet}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="h-8 self-start"
                onClick={() => copyOut(jsSnippet, "JS snippet copied")}
              >
                <Copy className="size-3.5" />
                Copy JS
              </Button>
              <pre className="overflow-x-auto rounded-md border border-border bg-elevated/40 p-3 font-mono text-2xs leading-relaxed text-muted">
                {pySnippet}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="h-8 self-start"
                onClick={() => copyOut(pySnippet, "Python snippet copied")}
              >
                <Copy className="size-3.5" />
                Copy Python
              </Button>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
