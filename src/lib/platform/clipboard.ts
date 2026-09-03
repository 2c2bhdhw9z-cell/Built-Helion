/** Copy text. Browser clipboard now; native clipboard plugin later via setCopyText. */

export type CopyTextFn = (text: string) => Promise<boolean>;

async function browserCopyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

let impl: CopyTextFn = browserCopyText;

export function setCopyText(fn: CopyTextFn | null): void {
  impl = fn ?? browserCopyText;
}

export async function copyText(text: string): Promise<boolean> {
  return impl(text);
}
