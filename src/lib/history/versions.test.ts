import { expect, test } from "vitest";
import { DEFAULT_PARAMS } from "@/engine/types";
import { getVersion, listVersions, pushVersion, removeVersion } from "./versions";

const config = {
  params: { ...DEFAULT_PARAMS },
  spawnKind: "galaxy" as const,
  spawnCount: 1000,
  speed: 1 as const,
  cap: 65536,
};

test("pushVersion prepends and listVersions returns it", () => {
  const a = pushVersion("Galaxy A", config);
  expect(a.name).toBe("Galaxy A");
  const listed = listVersions();
  expect(listed[0]?.id).toBe(a.id);
  expect(getVersion(a.id)?.name).toBe("Galaxy A");
});

test("removeVersion drops the row", () => {
  const a = pushVersion("Gone", config);
  removeVersion(a.id);
  expect(getVersion(a.id)).toBe(null);
});
