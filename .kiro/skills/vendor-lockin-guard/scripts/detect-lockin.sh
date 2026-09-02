#!/usr/bin/env bash
#
# detect-lockin.sh — audit a repository for vendor lock-in signals.
#
# Read-only. Changes nothing. Prints findings grouped by severity and exits non-zero if any
# HIGH-severity signal is present, so it can be used as a CI gate or run ad hoc.
#
#   usage:  ./detect-lockin.sh [path] [vendor-name-regex]
#   e.g.    ./detect-lockin.sh . 'acme|acmehq'
#
# With no vendor regex it still finds the generic signals: telemetry endpoints, enforcement rules,
# hash-protection manifests, "do not remove" comments, and unused env declarations.
#
# Why these particular checks: each one is a mechanism that made a real project feel impossible to
# leave. The enforcement checks matter most — a lint rule that requires a vendor import converts
# "please keep this" into "your build fails without this", which is what stops people trying.

set -uo pipefail

ROOT="${1:-.}"
VENDOR="${2:-}"

# Paths that are never interesting.
EXCLUDES='node_modules|/\.git/|\.lock$|/dist/|/build/|/\.next/|/\.expo/|/coverage/'

high=0
med=0

hr() { printf '%s\n' "------------------------------------------------------------"; }

scan() {
  # scan <label> <severity> <regex> [file-globs...]
  local label="$1" sev="$2" re="$3"; shift 3
  local args=()
  if [ "$#" -gt 0 ]; then for g in "$@"; do args+=(--include="$g"); done; fi

  local hits
  hits=$(grep -rniE "$re" "${args[@]}" "$ROOT" 2>/dev/null | grep -vE "$EXCLUDES" || true)
  [ -z "$hits" ] && return 0

  local n
  n=$(printf '%s\n' "$hits" | wc -l | tr -d ' ')
  printf '\n[%s] %s — %s hit(s)\n' "$sev" "$label" "$n"
  printf '%s\n' "$hits" | head -12 | sed 's/^/    /'
  [ "$n" -gt 12 ] && printf '    … %s more\n' "$((n - 12))"

  if [ "$sev" = "HIGH" ]; then high=$((high + 1)); else med=$((med + 1)); fi
}

printf 'Lock-in audit: %s\n' "$ROOT"
[ -n "$VENDOR" ] && printf 'Vendor pattern: %s\n' "$VENDOR"
hr

# ---- HIGH: the enforcement layer -----------------------------------------------------------------
# Rules that require a vendor import, or require vendor files to exist, are the reason removal feels
# impossible: the build punishes it.
if [ -n "$VENDOR" ]; then
  scan "Convention/lint rules referencing the vendor (may enforce its presence)" HIGH \
    "$VENDOR" '*.json' '.*rc' '.eslintrc*' '*.config.js' '*.config.ts'
fi

# Rules that mandate an import are the sharpest lock-in signal there is — but only a human can judge
# them, and here is why this check is shaped the way it is.
#
# Two earlier versions were wrong. The first matched every `importFrom:` and flagged six perfectly
# ordinary structural rules. The second tried to match only scoped packages on the same line as the
# key — but grep is line-based and these configs are pretty-printed, so the package sits on the *next*
# line and nothing matched at all. A detector that cries wolf gets ignored; one that silently matches
# nothing is worse.
#
# The deeper problem is that no pattern can tell `@tanstack/react-query` (a real dependency a rule may
# legitimately require) from `@someplatform/runtime` (a vendor holding your build hostage). That
# distinction needs a name. So:
#
#   - with a vendor name, this is a HIGH finding and precise
#   - without one, every mandated third-party package is listed for a human to read
if [ -n "$VENDOR" ]; then
  for f in $(grep -rlE '"(importFrom|mustImport|requiredImports)"' --include='*.json' "$ROOT" 2>/dev/null | grep -vE "$EXCLUDES"); do
    hit=$(grep -niE "\"[^\"]*($VENDOR)[^\"]*\"" "$f" 2>/dev/null || true)
    if [ -n "$hit" ]; then
      printf '\n[HIGH] %s mandates a vendor import — removing the vendor will fail the build\n' "$f"
      printf '%s\n' "$hit" | head -8 | sed 's/^/    /'
      high=$((high + 1))
    fi
  done
else
  # The file list must be captured separately and checked for emptiness BEFORE it is used.
  #
  # An earlier version inlined it as `grep ... $(grep -rl ...)`. When the inner grep matched nothing,
  # the substitution expanded to nothing, grep fell back to scanning the whole tree, and the result was
  # every scoped package in `package-lock.json` — 15+ lines of @azure and @babel noise on a project with
  # no convention config at all. Same lesson as the other three: a detector that cries wolf gets
  # switched off, and an empty argument list is one of the easiest ways to cry wolf by accident.
  configs=$(grep -rlE '"(importFrom|mustImport|requiredImports)"' --include='*.json' "$ROOT" 2>/dev/null \
              | grep -vE "$EXCLUDES" || true)
  mandated=""
  if [ -n "$configs" ]; then
    mandated=$(printf '%s\n' "$configs" | xargs grep -hoE '"@[a-z0-9-]+/[a-z0-9._-]+"' 2>/dev/null | sort -u || true)
  fi
  if [ -n "$mandated" ]; then
    printf '\n[MED] Third-party packages named in convention/lint config — review each\n'
    printf '      A rule that REQUIRES one of these means removing it breaks your build.\n'
    printf '%s\n' "$mandated" | head -15 | sed 's/^/    /'
    med=$((med + 1))
  fi
fi

scan "Hash-protection manifest (files you are blocked from editing)" HIGH \
  '"[^"]+\.(ts|tsx|js|mjs)"\s*:\s*"[a-f0-9]{64}"' '*.json'

# ---- HIGH: phones home ---------------------------------------------------------------------------
# Package-qualified on purpose. An earlier version matched a bare `amplitude`, which fired on a
# physics variable in a wave-motion test — a false positive that teaches people to ignore the tool.
# Prefer a missed hit over a noisy one; the import form is what actually indicates an SDK.
scan "Telemetry / analytics SDKs" HIGH \
  'onedollarstats|posthog-js|posthog-node|@posthog/|mixpanel-browser|@amplitude/|amplitude-js|@segment/|analytics-node|@sentry/|react-ga|gtag\(|googletagmanager' \
  '*.ts' '*.tsx' '*.js' '*.json'

scan "Hardcoded collector or event endpoints" HIGH \
  'https?://[a-z0-9.-]+/(events?|collect|track|beacon|ingest)\b' '*.ts' '*.tsx' '*.js'

# ---- MEDIUM: coupling that is real but cheaper to unwind -----------------------------------------
scan "Comments asserting something must not be removed" MED \
  'do not remove|dont remove|don.t remove|required for|must stay|do not edit' '*.ts' '*.tsx' '*.js'

scan "Vendor preview/sandbox hosts (these die silently)" MED \
  'https?://[a-z0-9.-]*(preview|sandbox|staging)[a-z0-9.-]*\.[a-z]{2,}' '*.ts' '*.tsx' '*.json'

# Rendered components only, not the words. An earlier version matched a bare `Badge` and produced 45
# hits in a game that calls its achievements "badges" — all prose, all in comments. Requiring JSX
# angle-bracket usage of a capitalised component name finds `<VendorBadge />` and ignores paragraphs
# about badges. Third strike for the same lesson: match the construct, never the vocabulary.
scan "Injected badge / watermark / feedback components" MED \
  '<[A-Z][A-Za-z0-9]*(Badge|Watermark|PoweredBy|MadeWith|Feedback|Branding)\b' '*.tsx' '*.jsx' '*.vue' '*.svelte'

if [ -n "$VENDOR" ]; then
  scan "Vendor name in identity fields (bundle id, package, scheme)" MED \
    "(bundleIdentifier|\"package\"|\"scheme\"|applicationId).*($VENDOR)" '*.json'
fi

# ---- MEDIUM: surfaces a source grep never reaches ------------------------------------------------
# Each of these was missed by a careful manual pass on a real project, because none of them is source
# code: state in a dot-directory, a plugin in build config, a deploy step in CI, a generated config
# file nothing imports, or an SDK arriving as somebody else's dependency.

if [ -n "$VENDOR" ]; then
  scan "Vendor in the lockfile — may be transitive, i.e. not yours to remove" MED \
    "$VENDOR" 'package-lock.json' 'yarn.lock' 'pnpm-lock.yaml' 'bun.lock' 'Cargo.lock' 'poetry.lock' 'go.sum'

  scan "Vendor in build tool configuration (plugins and presets hide here)" MED \
    "$VENDOR" 'vite.config.*' 'webpack.config.*' 'next.config.*' 'rollup.config.*' \
    'babel.config.*' 'metro.config.*' 'nuxt.config.*' 'astro.config.*' 'svelte.config.*'

  scan "Vendor in CI/CD configuration" MED \
    "$VENDOR" '*.yml' '*.yaml' 'Jenkinsfile'
fi

# Hidden vendor state directories. Nothing imports these, so no source grep finds them.
hidden=$(find "$ROOT" -maxdepth 3 \
  \( -name '.firebase*' -o -name '.amplify*' -o -name '.vercel*' -o -name '.netlify*' \
     -o -name '.wrangler*' -o -name '.sst*' -o -name '.serverless*' -o -name '.supabase*' \) \
  -not -path '*/node_modules/*' 2>/dev/null | head -8 || true)
if [ -n "$hidden" ]; then
  printf '\n[MED] Vendor-generated state directories\n'
  printf '%s\n' "$hidden" | sed 's/^/    /'
  med=$((med + 1))
fi

# Generated config. The test that matters: could you recreate this from the repo alone?
generated=$(find "$ROOT" -maxdepth 3 \
  \( -name 'firebase.json' -o -name 'amplifyconfiguration.json' -o -name 'vercel.json' \
     -o -name 'wrangler.toml' -o -name 'netlify.toml' -o -name 'now.json' \
     -o -name '*.config.json' \) \
  -not -path '*/node_modules/*' 2>/dev/null | head -8 || true)
if [ -n "$generated" ]; then
  printf '\n[MED] Generated config — apply the recreatability test to each\n'
  printf '      If deleting it means you cannot rebuild it from this repo, it holds vendor-only state.\n'
  printf '%s\n' "$generated" | sed 's/^/    /'
  med=$((med + 1))
fi

# ---- MEDIUM: declared-but-unread env ------------------------------------------------------------
for tmpl in "$ROOT/.env.template" "$ROOT/.env.example" "$ROOT/.env.sample"; do
  [ -f "$tmpl" ] || continue
  unused=""
  while read -r v; do
    [ -z "$v" ] && continue
    n=$(grep -rl "$v" --include='*.ts' --include='*.tsx' --include='*.js' "$ROOT" 2>/dev/null \
          | grep -vcE "$EXCLUDES" || true)
    [ "${n:-0}" -eq 0 ] && unused="${unused}    ${v}\n"
  done < <(grep -oE '^[A-Z][A-Z0-9_]*' "$tmpl" 2>/dev/null || true)

  if [ -n "$unused" ]; then
    printf '\n[MED] Env vars declared in %s but read nowhere\n' "$(basename "$tmpl")"
    printf '%b' "$unused"
    med=$((med + 1))
  fi
done

# ---- the decisive question ----------------------------------------------------------------------
hr
printf '\nSummary: %s high, %s medium\n\n' "$high" "$med"

cat <<'EOF'
This script only reads files. It cannot see the three things that usually decide the real exit cost:

  1. MONEY.     Egress fees, minimum commitments, auto-renewal. A flawless export API is worthless
                if moving your data costs more than your runway.
  2. IDENTITY.  If the vendor is down right now, can anyone log in? Including your admins?
  3. DATA.      Has the export ever actually been RUN, and loaded somewhere that is not the vendor?
                A documented export is a promise; a tested one is a capability.

And the question no tool can answer:

  If this vendor shut down tomorrow with no notice, what would it take to keep shipping?

Write the answer down. If nobody can answer it, that is the finding.

Drills that turn these from opinions into evidence: references/exit-drills.md
EOF

[ "$high" -gt 0 ] && exit 1
exit 0
