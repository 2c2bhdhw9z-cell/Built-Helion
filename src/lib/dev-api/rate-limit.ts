import { allow } from "@/lib/feedback/throttle.server";

export function allowV1(key: string, now = Date.now()): boolean {
  return allow(`v1:${key}`, 60, 60_000, now);
}
