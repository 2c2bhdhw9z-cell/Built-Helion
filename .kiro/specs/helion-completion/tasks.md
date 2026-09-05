# Implementation Plan: Helion Completion

## Overview

This plan implements the design in `design.md` against the requirements in `requirements.md`, in TypeScript (the design targets the existing TypeScript codebase — no language choice is required). Work is organized so the four core areas ship **independently in priority order**, followed by the polish items. Within every area the sequence is test-driven and layered:

1. The single additive migration `migrations/0009_completion.sql` (or the relevant slice) first.
2. Pure helpers plus their `fast-check` property tests (≥100 iterations, tagged `// Feature: helion-completion, Property N`).
3. Server data layers plus `node --test` integration tests using the PGLite glob loader, matching `creations.test.ts` conventions.
4. Server functions / REST routes.
5. Client hooks.
6. UI.

Server always lands before client. Each task references the specific requirement IDs it satisfies and, where a property test applies, the design property number. All 12 correctness properties are covered by the property-test tasks. Tasks marked with `*` are optional test tasks and may be skipped for a faster MVP.

## Tasks

- [x] 1. Project setup for testing and shared plumbing
  - [x] 1.1 Add `fast-check` as a dev dependency
    - Add `fast-check` to `devDependencies` in `package.json` (the standard TypeScript PBT library; do not hand-roll a generator framework)
    - Install so property tests can `import fc from "fast-check"`
    - _Requirements: 1.1, 2.2, 3.3, 7.1, 8.1, 9.1, 10.1, 12.3_

  - [x] 1.2 Write the additive migration `migrations/0009_completion.sql`
    - Add `featured boolean not null default false` to `creations` plus the partial `creations_featured_idx` (featured AND public)
    - Create `account_status` (user_id pk, suspended, updated_at)
    - Create `achievements` (user_id, achievement_id, granted_at; composite pk) plus `achievements_user_idx`
    - Add `last_activity_seq bigint not null default 0` to `usage_stats`
    - Create `telemetry_samples` with NO user/email column, plus `telemetry_created_idx`
    - Use `if not exists` / `add column if not exists` throughout so it is additive and idempotent on both Neon and PGLite
    - _Requirements: 5.2, 5.3, 5.4, 8.1, 3.3, 12.3, 13.1_

- [x] 2. Area 1 — Cloud Save & Hosted-DB persistence (Reqs 1–3)
  - [x] 2.1 Extend creation types with the reconciliation key
    - Add `updated_at: string | Date` and optional `featured?: boolean` to `CreationRow` in `src/lib/creations/types.ts`
    - Reuse `saveCreationSchema` / `normalizeCreationConfig` for validation (invalid config `safeParse`s to null)
    - _Requirements: 2.3, 1.5_

  - [x] 2.2 Implement the pure `resolveByTimestamp` helper
    - Add `resolveByTimestamp(local, remote)` to `src/lib/creations/server.ts` (pure, no I/O): returns the record with the later `updated_at`; ties resolve deterministically to the remote record
    - _Requirements: 2.2_

  - [x]* 2.3 Write property test for timestamp reconciliation
    - **Property 1: Last-write-wins picks the later timestamp** — for any two same-id records with distinct `updated_at`, returns the later; equal timestamps return remote
    - **Property 2: A save records a modification timestamp** — asserted via the pure invariant that a stored row's `updated_at >= created_at`
    - fast-check, ≥100 runs, tag `// Feature: helion-completion, Property 1` and `Property 2`; place in `src/lib/creations/creations.test.ts`
    - Include the concrete tie example case
    - **Validates: Requirements 2.2, 2.3**

  - [x] 2.4 Implement the pure usage-merge math helper
    - Extract the merge arithmetic in `src/lib/usage/server.ts` into a pure `mergeUsageMath(current, delta, storedSeq, activitySeq)` returning the next totals and whether the delta applied (apply only when `activitySeq > storedSeq`)
    - _Requirements: 3.2, 3.3_

  - [x]* 2.5 Write property tests for usage merge
    - **Property 3: Usage merge adds a delta at most once per activity increment** — replays/stale seqs never increase totals
    - **Property 4: Usage merge is monotonic and non-negative** — merged totals `>=` current in every counter; `peak` is the max
    - fast-check, ≥100 runs, tags `// Feature: helion-completion, Property 3` / `Property 4`; new suite `src/lib/usage/usage.test.ts`
    - **Validates: Requirements 3.2, 3.3**

  - [x] 2.6 Wire idempotent flush + updated_at into the usage/creation data layers
    - `mergeAccountUsage` accepts `activitySeq`, reads/advances `usage_stats.last_activity_seq`, applies delta at most once (Req 3.3)
    - `insertCreation` / new `updateCreation` stamp `updated_at = now()`; `listCreations` SELECT includes `updated_at`
    - _Requirements: 1.1, 1.2, 1.3, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [x]* 2.7 Write integration tests for save/list/usage round-trips
    - Real PGLite via the glob loader (`register("../feedback/pglite-glob-loader.mjs", …)`), matching `creations.test.ts`: save→list→update carries `updated_at`; owner-scoped list; config equality on re-read; usage flush idempotency against a real `usage_stats` row with `last_activity_seq`
    - _Requirements: 1.1, 1.2, 1.3, 3.2, 3.3, 3.4_

  - [x] 2.8 Implement the `assertNotSuspended` write gate
    - Add server-only `assertNotSuspended(userId)` (dynamically imported) querying `account_status`; throws before any authenticated write
    - _Requirements: 5.3_

  - [x] 2.9 Add the ephemeral-backend server function and wire the gate into writes
    - Add no-auth `getBackendInfoFn` returning `{ ephemeral: dbSource === "pglite" }`
    - Invoke `assertNotSuspended` inside the save-creation, set-public, toggle-like, profile-upsert, and usage-merge server functions (`src/lib/creations/functions.ts`, `src/lib/profiles/functions.ts`, `src/lib/usage/functions.ts`); validate saves with `saveCreationSchema.parse` before any DB write
    - _Requirements: 1.4, 1.5, 5.3_

  - [x] 2.10 Update the Sync_Client hook for non-destructive refresh
    - In `src/lib/creations/use-creations.ts`: fetch server-authoritative set on load; on failed refresh retain the last loaded set and preserve local unsaved edits; signed-out returns empty and never blocks
    - _Requirements: 2.1, 2.4, 2.5_

  - [x] 2.11 Surface the ephemeral-storage indicator in the UI
    - Add a client hook reading `getBackendInfoFn` once at boot and a UI indicator shown when `ephemeral` is true; never blocks the simulator
    - _Requirements: 1.4_

- [x] 3. Checkpoint — Area 1
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Area 2 — Admin Dashboard (Reqs 4–6)
  - [x] 4.1 Create the admin data layer
    - New `src/lib/admin/server.ts`: `listAccounts()` (join Better Auth `user` with per-user creation/like counts and suspended flag), `suspendAccount` / `reinstateAccount` (upsert `account_status`, write audit entry), `getAnalytics()` (count/sum over stored rows, `0` when empty)
    - Add `src/lib/admin/types.ts` (`AdminAccount`, `AdminAnalytics`)
    - _Requirements: 5.1, 5.2, 5.4, 6.1, 6.2, 6.3_

  - [x] 4.2 Create admin server functions behind the shared gate
    - New `src/lib/admin/functions.ts`: each function calls `assertAdmin(token)` first (reusing `src/lib/feedback/admin-auth.server.ts`); non-admin callers map `ForbiddenError` to empty/forbidden result
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.5, 6.4_

  - [x]* 4.3 Write integration tests for admin data + authorization
    - Real PGLite: `listAccounts` aggregates real rows; `getAnalytics` returns `0` on empty store and true counts otherwise; suspend→authenticated write rejected→reinstate→write allowed; non-admin caller gets empty/forbidden
    - Admin authorization (Req 4, incl. constant-time compare 4.6) remains covered by the existing `admin-auth.test.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

  - [x] 4.4 Build the admin dashboard UI (accounts + analytics)
    - Client hook + UI listing accounts with suspend/reinstate actions and an analytics panel; all data comes from the gated server functions (no UI-only protection)
    - _Requirements: 5.1, 5.2, 5.4, 6.1_

- [x] 5. Checkpoint — Area 2
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Area 3 — Leaderboards & Achievements (Reqs 7–8)
  - [x] 6.1 Implement the pure `rankRows` helper and leaderboard types
    - New `src/lib/leaderboard/types.ts` (`LeaderboardEntry`) and `rankRows(rows)` in `src/lib/leaderboard/server.ts`: sort by score non-increasing, then userId ascending for stable ties
    - _Requirements: 7.1, 7.2_

  - [x]* 6.2 Write property tests for leaderboard ranking
    - **Property 5: Leaderboard ordering is non-increasing and stable**
    - **Property 6: Leaderboard respects the maximum size**
    - fast-check, ≥100 runs, tags `// Feature: helion-completion, Property 5` / `Property 6`; suite `src/lib/leaderboard/leaderboard.test.ts`
    - **Validates: Requirements 7.1, 7.2, 7.4**

  - [x] 6.3 Implement the leaderboard data layer
    - `listLeaderboard(limit)` in `src/lib/leaderboard/server.ts`: single grouped query over public creations + likes producing `{ userId, displayName, score }` from stored rows; apply `rankRows`; clamp `limit` to the configured maximum
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 6.4 Implement the pure `evaluateAchievements` helper and definitions
    - New `src/lib/achievements/types.ts` (`AchievementDef`, `GrantedAchievement`), static `ACHIEVEMENTS` table (incl. `million` at 1,000,000 peak and `day-session` at 86,400 cumulative seconds), and pure `evaluateAchievements(current, metrics)` returning newly-qualifying ids only in `src/lib/achievements/server.ts`
    - _Requirements: 8.1, 8.2, 8.3_

  - [x]* 6.5 Write property test for achievement evaluation
    - **Property 7: Achievement evaluation grants on first crossing and is idempotent** — grants exactly the not-yet-granted ids whose thresholds are met; re-running with the union and equal/higher metrics returns empty
    - fast-check, ≥100 runs, tag `// Feature: helion-completion, Property 7`; suite `src/lib/achievements/achievements.test.ts`
    - Include the exact 1M and 24-hour boundary example cases
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [x] 6.6 Implement the achievements data layer
    - `grantIfEarned(userId, metrics)` (read granted, call `evaluateAchievements`, insert new grants with `on conflict do nothing`, return full set) and `listAchievements(userId)` in `src/lib/achievements/server.ts`
    - Call `grantIfEarned` from the usage-flush path so peak/cumulative-seconds crossings grant server-side
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x]* 6.7 Write integration tests for leaderboard + achievements
    - Real PGLite: leaderboard from real public-creation/like rows is non-increasing and stable; a metric crossing grants once and persists across a re-read
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.4_

  - [x] 6.8 Add leaderboard + achievements server functions and REST route
    - `src/lib/leaderboard/functions.ts` (`listLeaderboardFn`, no auth) plus a `GET /api/v1/leaderboard` route in `src/lib/dev-api/handle.ts`; `src/lib/achievements/functions.ts`
    - _Requirements: 7.5, 8.4_

  - [x] 6.9 Add client hooks and UI for leaderboard + achievements
    - Leaderboard view fed by the public function/route; `src/lib/achievements/use-achievements.ts` returning `[]` when signed out and never blocking, plus an achievements UI
    - _Requirements: 7.5, 8.4, 8.5_

- [x] 7. Checkpoint — Area 3
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Area 4 — AI Tuning & Style (Reqs 9–10)
  - [x] 8.1 Implement the pure scoring objective
    - New `src/lib/ai/objective.ts`: pure, deterministic `scoreCandidate(objective, params)` mapping a params set to a scalar against a prompt-derived objective
    - _Requirements: 9.1_

  - [x] 8.2 Implement the pure closed-loop tuner
    - New `src/lib/ai/tuner.ts`: `runTuner({ prompt, seed, evaluate, iterations })` — bounded hill-climb/coordinate-descent over an injected `evaluate`; ≥2 iterations; keeps best-so-far; clamps each returned param via `labParamsSchema`; returns error (never fabricated params) when the provider start is unavailable
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 8.3 Implement the pure style mapper
    - New `src/lib/ai/style.ts`: `mapStyle(request, modelParams)` — merges into a coherent set always including `palette`, color (colorA/colorB/tint), and `blend`; bounds every field via `labParamsSchema`; preserves request `generator` and `spawnCount`; returns error on an unparseable response (`parseModelJson` → null)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x]* 8.4 Write property tests for tuner and style
    - **Property 8: Tuner returns a candidate no worse than its start** (≥2 iterations, score `>=` initial)
    - **Property 9: Tuner and Style outputs are within valid parameter ranges** (every param equals what `labParamsSchema` would coerce)
    - **Property 10: Style mapping preserves generator and count and includes style fields**
    - fast-check, ≥100 runs, tags `// Feature: helion-completion, Property 8/9/10`; suite `src/lib/ai/ai.test.ts` using an injected deterministic `evaluate`
    - Include example cases: tuner returns the seed when no candidate improves; style mapper on an unparseable model response returns an error
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3**

  - [x] 8.5 Branch the AI entry point by mode
    - In `src/lib/ai/functions.ts` keep the single `generateLabFn` entry, branching `create` (unchanged one-shot), `tune` → `runTuner`, `style` → `mapStyle`; surface `{ ok: false, error }` on provider/parse failure
    - _Requirements: 9.1, 9.5, 10.1, 10.4_

  - [x] 8.6 Wire tuner/style modes into the AI client UI
    - Add tune and style mode controls that call `generateLabFn`, apply the returned params, and show the error state without fabricating params
    - _Requirements: 9.1, 10.1_

- [x] 9. Checkpoint — Area 4
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Polish — WebSocket control channel (Req 11)
  - [x] 10.1 Implement the WebSocket control handler
    - New `src/lib/dev-api/socket.ts` mounted at `/api/v1/control/socket` via Nitro crossws: read bearer token from `sec-websocket-protocol`, resolve via `resolveToken`, reject invalid (4401-style close) / accept valid; maintain in-process `Map<userId, Set<peer>>`
    - _Requirements: 11.1, 11.2_

  - [x] 10.2 Deliver live + fall back to the polling queue without double-delivery
    - `POST /api/v1/control` pushes to connected peers and marks the row `consumed_at` in the same transaction; GET polling remains the at-most-once fallback; register the upgrade route in `src/lib/dev-api/handle.ts` and update the `/meta` notes string
    - _Requirements: 11.3, 11.4_

  - [x]* 10.3 Write example/integration tests for the control channel
    - Valid token accepted, invalid rejected (stub peer); a queued command delivered at most once (PGLite `api_commands`: second poll returns nothing); live push marks the row consumed so a later poll does not re-emit
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 11. Polish — Opt-in anonymous telemetry (Req 12)
  - [x] 11.1 Implement the telemetry data layer and types
    - New `src/lib/telemetry/types.ts` (`PerfSampleInput` — the only fields ever stored, no id/email) and `src/lib/telemetry/server.ts`: `recordSample(sample)` inserting only non-identifying fields; `getTelemetryAggregates()` reusing `src/lib/perf/stats.ts` (`percentile`, `summarize`)
    - _Requirements: 12.1, 12.3, 12.4_

  - [x]* 11.2 Write property test for telemetry sample shape
    - **Property 12: Telemetry samples never carry identity** — for any recorded sample the stored row contains only the performance fields and no account id or email
    - fast-check, ≥100 runs, tag `// Feature: helion-completion, Property 12`; suite `src/lib/telemetry/telemetry.test.ts`
    - **Validates: Requirements 12.3**

  - [x] 11.3 Add telemetry submit/aggregate functions and opt-in client
    - No-auth submit server function/REST route (samples are anonymous); admin-gated `getTelemetryAggregates` function via `assertAdmin`; `src/lib/telemetry/opt-in.ts` reads/writes the opt-in flag through `kv()` and only submits when opted in
    - _Requirements: 12.1, 12.2, 12.4_

- [x] 12. Polish — Editorial curation row (Req 13)
  - [x] 12.1 Implement the featured filter and admin mark
    - Add pure/predicate-backed `listFeatured()` to `src/lib/creations/server.ts` returning only featured AND `is_public = true` rows; add `setFeatured(adminId, creationId, featured)` to `src/lib/admin/server.ts` setting `creations.featured` and writing an audit entry on set
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x]* 12.2 Write property + integration tests for curation
    - **Property 11: Curated row contains only featured public creations** — fast-check ≥100 runs on the pure filter predicate, tag `// Feature: helion-completion, Property 11`
    - PGLite integration: a featured public creation appears; a non-public one is excluded
    - **Validates: Requirements 13.1, 13.4**

  - [x] 12.3 Add curation server function and curated-row UI
    - Public curated-row function fed by `listFeatured`; admin `setFeatured` function behind `assertAdmin`; a curated row in the library UI
    - _Requirements: 13.1, 13.2, 13.3_

- [x] 13. Polish — Admin-wide audit view (Req 14)
  - [x] 13.1 Implement the cross-account audit query
    - Add `listAllAudit(limit)` to `src/lib/audit/server.ts`: entries across all accounts ordered by `created_at` descending, clamped to the configured maximum; ensure account-management and curation actions call the existing `writeAudit`
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 13.2 Add the gated audit server function and admin audit UI
    - Admin-only audit-view function via `assertAdmin` (non-admin → no entries); an admin audit UI listing entries newest-first
    - _Requirements: 14.1, 14.4_

  - [x]* 13.3 Write integration test for the audit view
    - PGLite: an admin action writes an entry; `listAllAudit` returns it newest-first, capped to the configured maximum; a non-admin caller gets no entries
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 14. Final checkpoint — full suite
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Each task references specific requirements for traceability; property-test tasks additionally reference their design property number.
- All 12 correctness properties are covered: P1–P2 (2.3), P3–P4 (2.5), P5–P6 (6.2), P7 (6.5), P8–P10 (8.4), P11 (12.2), P12 (11.2).
- Checkpoints after each of the four core areas keep them independently shippable.
- Property tests use `fast-check` at ≥100 iterations and are tagged `// Feature: helion-completion, Property N`; integration tests use `node --test` with the PGLite glob loader, matching `creations.test.ts` (no DB mocking, no seeded rows).
- Server data layers and their tests always land before client hooks and UI.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.4", "6.1", "6.4", "8.1", "8.3", "10.1", "11.1"] },
    { "id": 2, "tasks": ["2.3", "2.5", "2.6", "2.8", "4.1", "6.2", "6.3", "6.5", "8.2", "11.2"] },
    { "id": 3, "tasks": ["2.7", "2.9", "4.2", "6.6", "8.4", "8.5", "10.2", "11.3", "12.1", "13.1"] },
    { "id": 4, "tasks": ["2.10", "4.3", "6.7", "6.8", "8.6", "10.3", "12.2", "13.2"] },
    { "id": 5, "tasks": ["2.11", "4.4", "6.9", "12.3", "13.3"] }
  ]
}
```
