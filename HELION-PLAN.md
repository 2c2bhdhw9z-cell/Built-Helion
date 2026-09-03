HELION PARTICLE LAB — ORIGINAL PLAN + STATUS
Source: your Phase 1–4 paste. Billing is parked. Particle cap is not a paywall.
You merge. I don’t.

STATUS KEY
  DONE      in the preview (and live if Phase 1, except Fill frame)
  PARTIAL   exists, not the full bullet
  SKIPPED   will not do unless you ask (honest no)
  NOT BUILT not started
  EARLY     built before its phase

STANDING RULES (yours, override the bullets)
- Particle cap is free. Count goes to 1M on every plan.
- Fill frame stays as accepted: zoom-out grows the world.
- Not released. Do not treat billing as next.
- Production does not move until you merge.

Live now: Phase 1 (Fill frame is in PR #23 / also inside #24, not live).
Preview now: rest of the plan in PR #24. Not live.


════════════════════════════════
PHASE 1: PROSUMER MVP
Goal: A polished, monetizable particle simulator that beats everything else on the market.

1. Visual & Generator Polish
- 10+ new generators (Fire, Smoke, Fireworks, Water, Tornado, Lightning, Black Hole, Supernova, Fibonacci Spiral, Sierpinski Triangle) — DONE
- Custom particle shapes (Circles → Squares, Triangles, Sprites, Emojis) — DONE (canvas sprites; GPU backends fall back to a circle)
- Advanced color controls (gradient by lifetime/velocity/position + color picker) — DONE (From/To stops + color maps)
- Particle trails (motion blur, fading trails, glow) — PARTIAL (trails + bloom)
- Background options (Gradient, Image, Video, Starfield, Procedural) — DONE (void, starfield, gradient, nebula, image, video)
- Camera controls (Zoom, Pan, Orbit, Reset view) — PARTIAL (zoom, pan, rotate, reset, fill-frame, auto orbit; not a 3D orbit camera)

2. Export & Sharing
- Screenshot export (PNG, JPG) — DONE
- GIF recording — DONE
- MP4/WebM recording — PARTIAL (browser canvas recording, not a real encoder farm)
- Preset save/load — DONE
- URL sharing (?preset= encoded state) — DONE
- Embed code — DONE

3. Input & UX Polish
- Touch optimization — PARTIAL (works; not a dedicated tablet layout)
- Keyboard shortcuts — DONE
- Undo/Redo — DONE
- Performance modes (Low/Medium/High) — DONE (real pixel density)
- Fullscreen mode — DONE
- Dark/Light theme — DONE

4. Cloud & Persistence
- Cloud save (sync presets across devices) — PARTIAL (signed-in creations; needs a real hosted DB on deploy)
- User profiles (avatars, stats, favorites) — PARTIAL (profile + hue avatar + local stats; not a photo suite)
- Preset library (browse/save community presets) — DONE
- Like/Heart system — DONE
- Recent/Featured — PARTIAL (library recent/featured sort; not a curated editorial row)

5. Monetization
- Subscription tiers Free / Pro ($5/mo) / Enterprise ($20/mo) — PARTIAL (tiers exist, preview only, no card)
- Premium generators (5–10 Pro-only) — DONE (Crystal, Magma, Aurora, Helix, Mandala, Confetti)
- Premium export (4K, no watermark, MP4) — PARTIAL (4K stills + watermark gate; MP4 is canvas recording)
- Stripe integration — NOT BUILT (parked)
- Trial system (7-day free trial) — DONE (account-side)


════════════════════════════════
PHASE 2: ENTERPRISE GRADE
Goal: Features that justify $20–50/month for professionals.
Status: built in preview (PR #24) except the SKIPPED rows.

6. Collaboration
- Real-time multiplayer (shared canvas, live cursors) — DONE (peer-to-peer; each browser runs its own physics, can drift)
- Permission system (View/Edit/Admin) — DONE (host can kick)
- Session chat (voice + text) — DONE (needs a mic and a clean peer link; NAT can fail)
- Version history (time-travel through edits) — DONE (this-device cache + signed-in account timeline + team timeline; empty until you save)
- Team workspaces (shared preset libraries) — DONE (create/join, members, roles, leave/kick/dissolve, share/load/delete; empty until you put something on the shelf)

7. Advanced Export
- 4K/8K export — DONE (8K can run out of memory)
- Alpha transparency — DONE (void knocked to alpha on PNG)
- Custom FPS 24/30/60/120 — DONE (requested; the encoder may run lower, especially at 120)
- FFmpeg integration (server-side video) — SKIPPED (no render farm)
- Lottie/JSON export — PARTIAL (scene JSON is the recipe, not Lottie, not live particles)

8. Performance & Scale
- 1M+ particle support — DONE (free; not an Enterprise lock)
- Multi-GPU — SKIPPED
- Headless mode (server-side rendering) — SKIPPED
- Batch processing (queue multiple exports) — DONE (batch PNG+JPG in Export)
- Render farm (distributed rendering) — SKIPPED

9. Developer API
- REST API — DONE (meta, library, creations CRUD, history, teams, usage, webhook deliveries, control queue)
- WebSocket API — PARTIAL (command queue the lab polls; this host has no socket)
- JavaScript SDK — DONE (public/sdk/helion.js talks to the real REST)
- Python SDK — DONE (public/sdk/helion.py talks to the real REST)
- Webhook support — DONE (save/publish, one retry, last deliveries stored)

10. Analytics & Insights
- Usage analytics — DONE (this-device always; account totals when signed in; never seeded)
- Performance telemetry — PARTIAL (in-app Performance hub; not anonymous cloud stats)
- Crash reporting (Sentry) — SKIPPED
- A/B testing — SKIPPED
- User feedback (in-app surveys) — PARTIAL (Feedback dialog + admin board, not surveys)


════════════════════════════════
PHASE 3: AI & AUTOMATION
Goal: 10x user engagement with AI assistance.

11. AI-Assisted Creation
- AI preset generator ("Make a galaxy" → auto-config) — DONE (Create, signed-in, grok-4.5)
- AI style transfer (Van Gogh on particles) — PARTIAL (style mode maps a look onto params, not a painted filter)
- AI parameter tuning (auto-optimize physics) — PARTIAL (tune mode; not a closed-loop optimizer)
- Text-to-particles ("Fireworks over water" → simulation) — DONE
- AI upscaling (enhance low-res exports) — SKIPPED (not a real upscaler)

12. AI Visualization
- Audio-reactive (particles react to music) — DONE (mic or a music file; bass/mids)
- Image-to-particles (photos → particle art) — DONE
- Video-to-particles (real-time video tracking) — PARTIAL (one frame from the video background, not tracking)
- 3D depth estimation from 2D images — SKIPPED
- Neural rendering (ML anti-aliasing) — SKIPPED

13. Gamification
- Achievements ("1M particles", "24hr session") — PARTIAL (badges including 1M; not a 24-hour timer)
- Leaderboards (top creators, most liked) — PARTIAL (most-liked in Play; not a global ranked board)
- Daily challenges ("Create a tornado") — DONE (auto-completes when you do the thing)
- Badges & rewards — DONE
- XP system — DONE (this device)


════════════════════════════════
PHASE 4: ENTERPRISE FEATURES
Goal: Sell to studios, agencies, and researchers for $100–500/month.

14. Team & Organization
- SSO/SAML — SKIPPED
- Audit logs — PARTIAL (signed-in save/publish rows; not a compliance suite)
- Admin dashboard (user management, analytics) — PARTIAL (feedback admin only)
- Custom branding / white-label — PARTIAL (studio mark on free exports)
- API rate limiting — PARTIAL (60/min on the control API)

15. Scientific Features
- Fluid dynamics (SPH) — EARLY (Water + SPH already in the lab)
- Molecular modeling — PARTIAL (Molecule generator; not a chemistry suite)
- Astrophysics (n-body, black holes) — EARLY (N-body + Black Hole generator)
- Custom physics (define your own forces) — DONE (radial / swirl / sine / expr on the CPU sim)
- Data import (CSV, JSON, 3D models) — DONE (CSV + OBJ vertices / XYZ; scene JSON; not meshes)

16. Deployment Options
- Self-hosted / on-prem — PARTIAL (the app is already a normal repo you can host)
- Docker — PARTIAL (a Dockerfile; you still run it)
- Kubernetes — SKIPPED
- Air-gapped — SKIPPED
- On-prem API — PARTIAL (same REST as the hosted app)


════════════════════════════════
WHERE WE ARE
- Phase 1: shipped. Fill frame still in PR until you merge.
- Phase 2: playable in preview. No seeded library, teams, history, usage, or authors.
- Native later: engine stays canvas/WebGPU; all I/O (KV, files, clipboard, share) goes through src/lib/platform. Browser now. Capacitor (iOS/Android) and Tauri (Windows/macOS/Linux) plug in via setKvStore / setSaveBlob / setCopyText — not a fake store build.
- Phase 3–4 remainder that can run in a browser: in this preview / PR #24.

Still will not fake
- FFmpeg farm, multi-GPU, headless GPU, render farm, Kubernetes, air-gapped certified, SSO/SAML, Sentry, A/B, Stripe (parked), neural rendering, depth estimation, real AI upscaling.

