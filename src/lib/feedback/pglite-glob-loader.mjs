// Node module-customization hook used ONLY by feedback.test.ts.
//
// src/lib/db.ts loads its migrations with Vite's `import.meta.glob("/migrations/*.sql")`,
// a build-time transform Vite normally rewrites into an object of file-path -> raw
// SQL. Under plain `node --experimental-strip-types` (how `npm test` runs the src
// suite) that transform does not run, so `import.meta.glob` is undefined and the
// real PGLite bootstrap throws before any query.
//
// This hook reproduces exactly what Vite does: when db.ts is loaded it rewrites the
// single `import.meta.glob(...)` call into an inline object literal containing the
// SAME real migration SQL read from disk (the top-level migrations/*.sql files). No
// DB behavior is faked — PGLite still applies the real migrations and runs real
// queries. It only bridges the Vite-only glob syntax so the genuine DB path works
// off the bundler.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "..", "migrations");
const srcDir = join(here, "..", "..");

/**
 * Resolve the `@/*` -> `src/*` alias (tsconfig `paths`) that Vite understands
 * but plain node does not, so server.ts's `import { getSql } from "@/lib/db"`
 * loads under `--experimental-strip-types`.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    let target = join(srcDir, specifier.slice(2));
    // tsconfig moduleResolution "bundler" lets imports omit the .ts extension;
    // add it back for node when the bare path has no extension on disk.
    if (!existsSync(target) && existsSync(`${target}.ts`)) target += ".ts";
    return nextResolve(pathToFileURL(target).href, context);
  }
  return nextResolve(specifier, context);
}

/** Build the { "/migrations/<file>.sql": "<raw sql>" } object Vite would inline. */
function globbedMigrations() {
  const out = {};
  for (const entry of readdirSync(migrationsDir)) {
    if (!entry.endsWith(".sql")) continue; // non-recursive, matches db.ts glob
    out[`/migrations/${entry}`] = readFileSync(join(migrationsDir, entry), "utf8");
  }
  return out;
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.endsWith("/src/lib/db.ts")) return result;

  const source = result.source.toString();
  const literal = JSON.stringify(globbedMigrations());
  // Replace the whole `import.meta.glob("/migrations/*.sql", { ... })` expression
  // (arguments span multiple lines) with the resolved object literal.
  const transformed = source.replace(
    /import\.meta\.glob\(\s*"\/migrations\/\*\.sql"[\s\S]*?\)/,
    literal,
  );
  return { ...result, source: transformed };
}
