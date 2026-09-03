import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Heart, Play, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  listLibraryAuthFn,
  listLibraryFn,
  toggleLikeFn,
} from "@/lib/creations/functions";
import {
  normalizeCreationConfig,
  type LibraryItem,
} from "@/lib/creations/types";
import { Chip } from "./controls";

type Sort = "recent" | "featured";

export function LibraryDialog() {
  const open = useLab((s) => s.libraryOpen);
  const setOpen = useLab((s) => s.setLibraryOpen);
  const applyCreationConfig = useLab((s) => s.applyCreationConfig);
  const { user, isPending } = useCurrentUserState();
  const signedIn = Boolean(user);

  const [sort, setSort] = useState<Sort>("recent");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || isPending) return;
    let cancelled = false;
    setLoading(true);
    const load = signedIn
      ? listLibraryAuthFn({ data: { sort } })
      : listLibraryFn({ data: { sort } });
    void load
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sort, signedIn, isPending]);

  const onLoad = (item: LibraryItem) => {
    const config = normalizeCreationConfig(item.config);
    if (!config) {
      toast.error("That creation could not be loaded");
      return;
    }
    applyCreationConfig(config);
    setOpen(false);
    toast.success(`Loaded “${item.name}”`);
  };

  const onLike = async (item: LibraryItem) => {
    if (!signedIn) {
      toast.message("Sign in to like a creation");
      return;
    }
    try {
      const next = await toggleLikeFn({ data: { id: item.id } });
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, liked: next.liked, likeCount: next.likeCount } : row,
        ),
      );
    } catch {
      toast.error("Could not update like");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">
                Community library
              </Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                Public creations from other labs. Load one into yours.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-2">
            <Chip active={sort === "recent"} onClick={() => setSort("recent")}>
              Recent
            </Chip>
            <Chip active={sort === "featured"} onClick={() => setSort("featured")}>
              Featured
            </Chip>
          </div>
          <div className="lab-scroll flex flex-col gap-2 overflow-y-auto px-4 py-4">
            {loading ? (
              <p className="py-8 text-center text-2xs text-faint">Loading…</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border py-12 text-center">
                <p className="text-sm text-fg">Nothing published yet</p>
                <p className="text-2xs text-faint">
                  Save a creation and toggle Publish to appear here.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg" title={item.name}>
                        {item.name}
                      </p>
                      <p className="truncate text-2xs text-faint">{item.author}</p>
                    </div>
                    <Button
                      variant={item.liked ? "default" : "outline"}
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      aria-label={item.liked ? "Unlike" : "Like"}
                      onClick={() => void onLike(item)}
                    >
                      <Heart className={`size-3.5 ${item.liked ? "fill-current" : ""}`} />
                      <span className="tabular-nums">{item.likeCount}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      aria-label={`Load ${item.name}`}
                      onClick={() => onLoad(item)}
                    >
                      <Play className="size-3.5" />
                      <span className="hidden sm:inline">Load</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
