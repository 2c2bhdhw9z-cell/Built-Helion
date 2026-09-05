# Requirements Document

## Introduction

Helion Particle Lab is a browser-based WebGPU/WebGL particle simulator (React + Vite + Nitro, TypeScript, PGLite/Postgres via kysely, Better Auth). Its Phase 1–2 feature set is shipped; several Phase 1–4 items remain PARTIAL. This umbrella spec completes the four highest-value PARTIAL areas and a set of browser-runnable polish items, organized so each area is **independently shippable** in the priority order the team selected:

1. **Cloud Save & Hosted-DB Persistence** — make signed-in creations, presets, profiles, and usage totals survive reliably across devices on a real hosted database, with an honest, non-data-losing fallback.
2. **Admin Dashboard** — expand the admin surface beyond feedback to user management and an analytics view, server-side protected and fail-closed.
3. **Leaderboards & Achievements** — add a global ranked board and server-recorded achievements (including a cumulative session-time achievement), beyond today's local-only XP/badges.
4. **AI Parameter Tuning & Style Transfer** — turn "tune mode" into a real closed-loop optimizer and strengthen "style mode" beyond a one-shot param map.

Plus browser-runnable polish (the "and more"): a WebSocket real-time control channel, opt-in performance telemetry, an editorial curation row, and an admin-wide audit-log view.

This spec honors Helion's standing rules: the particle cap stays free (1M on every plan, never paywalled); the engine stays canvas/WebGPU; all device I/O (KV, files, clipboard, share) continues to route through `src/lib/platform`; authentication stays optional and non-blocking; and every admin surface is server-side protected and fail-closed. The spec does **not** introduce any of the explicitly rejected items (FFmpeg render farm, multi-GPU, headless GPU, Kubernetes, air-gapped, SSO/SAML, Sentry, A/B testing, Stripe/billing, neural rendering, depth estimation, real AI upscaling). This spec covers only application-level features that run in a browser against the existing Nitro server functions and REST surface; it does not cover deployment or infrastructure provisioning.

## Glossary

- **Helion**: The Helion Particle Lab application as a whole.
- **Persistence_Service**: The server-side layer (`src/lib/db.ts` plus the `server.ts` modules under `src/lib/creations`, `profiles`, `usage`) that reads and writes owner-scoped data to the active database backend.
- **Hosted_Database**: A configured durable Postgres backend (Neon), active when `DATABASE_URL` is set.
- **Embedded_Database**: The in-memory PGLite (Postgres-in-WASM) fallback active when `DATABASE_URL` is unset.
- **Creation**: A named, owner-scoped snapshot of the simulator's configuration (LabParams + generator kind + particle count + speed + cap) — never live particle positions.
- **Sync_Client**: The client-side hook layer (e.g. `use-creations.ts`) that lists, saves, and reconciles a signed-in user's data across devices.
- **Admin_Service**: The server-side authorization + data layer for privileged admin surfaces (`src/lib/feedback/admin-auth.server.ts` and its expansion).
- **Admin_User**: A caller authorized by the admin authorization mechanism (shared token or verified-email allowlist).
- **Leaderboard_Service**: The server-side layer that ranks creators by a recorded metric and returns a global ordered board.
- **Achievement_Service**: The server-side layer that records and reports durable, account-scoped achievements.
- **Achievement**: A durable, named milestone earned by an account (e.g. "1M particles", "24-hour cumulative session").
- **AI_Service**: The server-side AI layer (`src/lib/ai/functions.ts`) that maps a prompt to a simulator configuration.
- **Tuner**: The closed-loop optimizer within the AI_Service that iteratively adjusts parameters against a scored objective.
- **Style_Mapper**: The AI_Service component that maps a described visual style onto simulator parameters.
- **Telemetry_Service**: The server-side layer that aggregates opt-in, anonymous performance samples.
- **Control_Channel**: The real-time command transport (WebSocket, upgrading the existing polling command queue) between an API client and a listening lab.
- **Audit_Service**: The server-side layer that records and reports privileged-action audit entries (`src/lib/audit/server.ts`).
- **Platform_IO**: The device-I/O abstraction in `src/lib/platform` (KV, files, clipboard, share).

## Requirements

### Requirement 1: Reliable cloud save on the hosted database

**User Story:** As a signed-in creator, I want my saved creations to persist on a real hosted database, so that they survive across sessions and serverless invocations.

#### Acceptance Criteria

1. WHERE the Hosted_Database is active, WHEN a signed-in user saves a Creation, THE Persistence_Service SHALL store the Creation owner-scoped to the user's verified id and return the stored Creation.
2. WHERE the Hosted_Database is active, WHEN a signed-in user requests a list of their creations, THE Persistence_Service SHALL return every Creation owned by that user and no Creation owned by another user.
3. WHEN a signed-in user saves a Creation and later reads that Creation, THE Persistence_Service SHALL return a Creation whose configuration equals the saved configuration.
4. IF the active backend is the Embedded_Database, THEN THE Helion SHALL report the active backend as ephemeral to the client so the client can surface a non-persistent-storage indication.
5. IF a save request references a configuration that fails validation, THEN THE Persistence_Service SHALL reject the save and return a validation error without storing a row.

### Requirement 2: Cross-device synchronization and conflict resolution

**User Story:** As a creator using more than one device, I want my creations and profile to reconcile across devices, so that I see a consistent, current set everywhere I sign in.

#### Acceptance Criteria

1. WHEN a Sync_Client loads for a signed-in user, THE Sync_Client SHALL fetch the server-authoritative set of that user's creations and present it as the current set.
2. WHEN the same Creation id exists on two devices with different modification timestamps, THE Persistence_Service SHALL treat the entry with the later modification timestamp as authoritative.
3. WHEN a Sync_Client saves a Creation, THE Persistence_Service SHALL record a modification timestamp on the stored Creation.
4. IF a synchronization fetch fails, THEN THE Sync_Client SHALL retain the last successfully loaded set and SHALL NOT discard local unsaved edits.
5. WHILE a user is signed out, THE Sync_Client SHALL present an empty server set and SHALL NOT block the simulator.

### Requirement 3: Profile and usage-total persistence across devices

**User Story:** As a signed-in creator, I want my profile and usage totals to persist on the hosted database, so that my stats are consistent across devices.

#### Acceptance Criteria

1. WHERE the Hosted_Database is active, WHEN a signed-in user updates a profile field, THE Persistence_Service SHALL store the updated profile owner-scoped to the user's id.
2. WHEN a signed-in user's device flushes a usage delta, THE Persistence_Service SHALL add the delta to the account totals and return the updated totals.
3. WHEN a device flushes the same usage delta more than once without new local activity, THE Persistence_Service SHALL add the delta to the account totals at most once per distinct local activity increment.
4. WHEN a signed-in user reads profile stats, THE Persistence_Service SHALL return the count of that user's saved creations and the count of likes received on that user's public creations.

### Requirement 4: Server-side admin authorization (fail-closed)

**User Story:** As an operator, I want every admin surface to be authorized on the server and fail closed, so that privileged data is never exposed by hiding UI.

#### Acceptance Criteria

1. WHEN an admin request supplies a token that matches the configured admin token, THE Admin_Service SHALL authorize the request.
2. WHEN an admin request carries a session whose verified email is on the configured allowlist, THE Admin_Service SHALL authorize the request.
3. IF the Hosted_Database is active AND no admin mechanism is configured, THEN THE Admin_Service SHALL deny the request and return no privileged rows.
4. IF an admin request supplies a token that does not match the configured admin token, THEN THE Admin_Service SHALL deny the request.
5. WHERE a session email is on the allowlist but is not verified, THE Admin_Service SHALL deny the request.
6. WHEN the Admin_Service compares a supplied token to the configured token, THE Admin_Service SHALL use a constant-time comparison.

### Requirement 5: Admin user management

**User Story:** As an authorized admin, I want to view and manage accounts, so that I can maintain service quality and handle policy issues.

#### Acceptance Criteria

1. WHEN an Admin_User requests the account list, THE Admin_Service SHALL return account records including id, display name, and aggregate creation and like counts.
2. WHEN an Admin_User suspends an account, THE Admin_Service SHALL mark the account as suspended and record an audit entry.
3. WHILE an account is suspended, THE Persistence_Service SHALL reject that account's authenticated write requests.
4. WHEN an Admin_User reinstates a suspended account, THE Admin_Service SHALL clear the suspended mark and record an audit entry.
5. IF a non-admin caller requests the account list, THEN THE Admin_Service SHALL deny the request and return no account records.

### Requirement 6: Admin analytics view

**User Story:** As an authorized admin, I want an aggregate analytics view, so that I can understand overall usage without inspecting individual accounts.

#### Acceptance Criteria

1. WHEN an Admin_User requests analytics, THE Admin_Service SHALL return aggregate totals for account count, saved-creation count, published-creation count, and total likes.
2. WHEN the Admin_Service computes an aggregate total, THE Admin_Service SHALL compute the total from stored rows and SHALL NOT return seeded or fabricated values.
3. WHEN an Admin_User requests analytics and the store contains no rows for a metric, THE Admin_Service SHALL return zero for that metric.
4. IF a non-admin caller requests analytics, THEN THE Admin_Service SHALL deny the request and return no analytics.

### Requirement 7: Global ranked leaderboard

**User Story:** As a creator, I want a global ranked board of top creators, so that I can see how my public work compares.

#### Acceptance Criteria

1. WHEN a viewer requests the leaderboard, THE Leaderboard_Service SHALL return creators ordered by their ranking metric in non-increasing order.
2. WHEN two creators have an equal ranking metric, THE Leaderboard_Service SHALL apply a deterministic secondary ordering so the returned order is stable.
3. WHEN the Leaderboard_Service computes a creator's ranking metric, THE Leaderboard_Service SHALL compute the metric from stored public-creation and like rows.
4. WHEN a viewer requests the leaderboard, THE Leaderboard_Service SHALL return at most the configured maximum number of entries.
5. WHERE a viewer is signed out, THE Leaderboard_Service SHALL return the leaderboard without requiring authentication.

### Requirement 8: Server-recorded achievements

**User Story:** As a signed-in creator, I want achievements recorded on my account, so that milestones like reaching 1M particles or a 24-hour cumulative session persist across devices.

#### Acceptance Criteria

1. WHEN a signed-in user's recorded metric first meets an Achievement's threshold, THE Achievement_Service SHALL grant that Achievement to the account.
2. WHEN a signed-in user's cumulative recorded session time first reaches 24 hours, THE Achievement_Service SHALL grant the 24-hour-session Achievement.
3. WHEN an Achievement is already granted to an account, THE Achievement_Service SHALL leave the account's Achievement set unchanged on a subsequent qualifying event.
4. WHEN a signed-in user requests their achievements, THE Achievement_Service SHALL return every Achievement granted to that account.
5. WHERE a user is signed out, THE Achievement_Service SHALL return an empty achievement set and SHALL NOT block the simulator.

### Requirement 9: Closed-loop AI parameter tuning

**User Story:** As a creator, I want AI tuning to iteratively optimize physics parameters toward a described effect, so that the result measurably improves rather than being a single guess.

#### Acceptance Criteria

1. WHEN a user submits a tuning request, THE Tuner SHALL evaluate candidate parameter sets against a scored objective derived from the request and return the highest-scoring candidate.
2. WHEN the Tuner runs, THE Tuner SHALL perform at least two evaluation iterations before returning a result.
3. WHEN the Tuner returns a result, THE Tuner SHALL return a candidate whose objective score is greater than or equal to the score of the initial candidate.
4. THE Tuner SHALL bound each returned parameter to the simulator's valid range for that parameter.
5. IF the AI provider is unavailable, THEN THE AI_Service SHALL return an error result and SHALL NOT return fabricated parameters.

### Requirement 10: Stronger AI style mapping

**User Story:** As a creator, I want style transfer to map a described visual style onto a coherent set of parameters, so that the look is stronger than a single opportunistic guess.

#### Acceptance Criteria

1. WHEN a user submits a style request, THE Style_Mapper SHALL return a parameter set that includes palette, color, and blend fields consistent with the described style.
2. THE Style_Mapper SHALL bound each returned parameter to the simulator's valid range for that parameter.
3. WHEN the Style_Mapper returns a parameter set, THE Style_Mapper SHALL preserve the generator kind and particle count supplied in the request.
4. IF the AI provider returns an unparseable response, THEN THE AI_Service SHALL return an error result and SHALL NOT return fabricated parameters.

### Requirement 11: WebSocket real-time control channel

**User Story:** As an API client, I want a real-time control channel, so that a listening lab receives commands without polling.

#### Acceptance Criteria

1. WHEN an authenticated client opens a Control_Channel with a valid bearer token, THE Helion SHALL accept the connection.
2. IF a client opens a Control_Channel without a valid bearer token, THEN THE Helion SHALL reject the connection.
3. WHEN an authenticated client sends a command over the Control_Channel, THE Helion SHALL deliver the command to that account's listening labs.
4. WHERE the runtime host does not support a socket upgrade, THE Helion SHALL fall back to the existing polling command queue and SHALL deliver each queued command at most once.

### Requirement 12: Opt-in anonymous performance telemetry

**User Story:** As an operator, I want opt-in anonymous performance samples, so that I can understand real-world performance without collecting personal data.

#### Acceptance Criteria

1. WHERE a user has opted in to telemetry, WHEN the client submits a performance sample, THE Telemetry_Service SHALL record the sample.
2. IF a user has not opted in to telemetry, THEN THE Helion SHALL NOT submit a performance sample.
3. WHEN the Telemetry_Service records a sample, THE Telemetry_Service SHALL store only non-identifying performance fields and SHALL NOT store an account id or email.
4. WHEN an Admin_User requests telemetry aggregates, THE Telemetry_Service SHALL return aggregate performance statistics computed from stored samples.

### Requirement 13: Editorial curation row

**User Story:** As a visitor browsing the library, I want an editorially curated row, so that I can discover hand-picked creations beyond recent and most-liked.

#### Acceptance Criteria

1. WHEN a viewer requests the curated row, THE Persistence_Service SHALL return only creations an Admin_User has marked as featured.
2. WHEN an Admin_User marks a public creation as featured, THE Admin_Service SHALL record the featured mark and an audit entry.
3. WHEN an Admin_User removes a featured mark, THE Admin_Service SHALL clear the featured mark for that creation.
4. IF a creation is not public, THEN THE Persistence_Service SHALL exclude that creation from the curated row.

### Requirement 14: Admin-wide audit-log view

**User Story:** As an authorized admin, I want to view audit entries across all accounts, so that I can review privileged and sensitive actions.

#### Acceptance Criteria

1. WHEN an Admin_User requests the audit view, THE Audit_Service SHALL return audit entries across all accounts ordered by recorded time in non-increasing order.
2. WHEN the Admin_Service performs an account-management or curation action, THE Audit_Service SHALL record an audit entry describing the action.
3. WHEN an Admin_User requests the audit view, THE Audit_Service SHALL return at most the configured maximum number of entries.
4. IF a non-admin caller requests the audit view, THEN THE Audit_Service SHALL deny the request and return no audit entries.
