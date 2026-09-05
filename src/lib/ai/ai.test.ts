import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import fc from "fast-check";
import type { AiObjective, Candidate } from "./objective.ts";
import type { TunerRequest, TunerResult } from "./tuner.ts";
import type { StyleRequest, StyleResult } from "./style.ts";
import type { GeneratorKind, LabParams } from "../../engine/types.ts";

// The AI modules under test (objective.ts, tuner.ts, style.ts) all import
// `@/lib/creations/types`, which in turn imports `@/engine/types`. Those `@/`
// aliases only resolve once the shared loader hook is registered (same hook the
// sibling suites — creations.test.ts / feedback.test.ts — use). A static
// top-level import of the modules would be hoisted and resolved BEFORE
// register() runs, so we register the hook here and import the modules
// dynamically inside a before() hook. These modules are PURE (no DB, no
// network), so no database is actually touched — we only need the alias
// resolution the loader provides.
register("../feedback/pglite-glob-loader.mjs", import.meta.url);

// A minimum of 100 runs per property, as required by the design's Testing
// Strategy (fast-check, >=100 runs each property).
const RUNS = { numRuns: 200 };

let scoreCandidate: (objective: AiObjective, params: Candidate) => number;
let runTuner: (request: TunerRequest) => TunerResult;
let mapStyle: (
  request: StyleRequest,
  modelParams: string | Record<string, unknown> | null | undefined,
) => StyleResult;
let labParamsSchema: import("../creations/types.ts")["labParamsSchema"];
let DEFAULT_PARAMS: LabParams;
let GENERATOR_KINDS: readonly GeneratorKind[];

before(async () => {
  const objective = await import("./objective.ts");
  const tuner = await import("./tuner.ts");
  const style = await import("./style.ts");
  const creationTypes = await import("../creations/types.ts");
  const engineTypes = await import("../../engine/types.ts");
  scoreCandidate = objective.scoreCandidate;
  runTuner = tuner.runTuner;
  mapStyle = style.mapStyle;
  labParamsSchema = creationTypes.labParamsSchema;
  DEFAULT_PARAMS = engineTypes.DEFAULT_PARAMS;
  GENERATOR_KINDS = engineTypes.GENERATOR_KINDS;
});

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A normalized [0, 1] descriptor value for a prompt-derived objective. */
const unitArb = fc.double({ min: 0, max: 1, noNaN: true });

/**
 * A prompt-derived objective targeting any subset of the four descriptors.
 * Each descriptor is present-or-absent (undefined), matching how a prompt can
 * target any subset of visual qualities.
 */
const objectiveArb: fc.Arbitrary<AiObjective> = fc.record(
  {
    energy: fc.option(unitArb, { nil: undefined }),
    turbulence: fc.option(unitArb, { nil: undefined }),
    brightness: fc.option(unitArb, { nil: undefined }),
    density: fc.option(unitArb, { nil: undefined }),
  },
  { requiredKeys: [] },
);

/**
 * An initial candidate (seed): a partial LabParams override touching the
 * numeric drivers the tuner actually nudges plus a couple of the discrete
 * mode/enum fields, all within sane finite ranges. Every field is optional so
 * candidates range from empty (pure DEFAULT_PARAMS) to richly populated.
 */
const candidateArb: fc.Arbitrary<Candidate> = fc.record(
  {
    gravityX: fc.double({ min: -6, max: 6, noNaN: true }),
    gravityY: fc.double({ min: -6, max: 6, noNaN: true }),
    drag: fc.double({ min: 0, max: 0.5, noNaN: true }),
    forceStrength: fc.double({ min: 0, max: 8, noNaN: true }),
    forceKind: fc.constantFrom("off", "radial", "swirl", "sine", "expr"),
    nbody: fc.boolean(),
    nbodyG: fc.double({ min: 0, max: 0.1, noNaN: true }),
    flow: fc.boolean(),
    flowStrength: fc.double({ min: 0, max: 8, noNaN: true }),
    flock: fc.boolean(),
    flockSep: fc.double({ min: 0, max: 5, noNaN: true }),
    flockCoh: fc.double({ min: 0, max: 3, noNaN: true }),
    sph: fc.boolean(),
    sphCohesion: fc.double({ min: 0, max: 1.5, noNaN: true }),
    bloom: fc.boolean(),
    bloomStrength: fc.double({ min: 0, max: 6, noNaN: true }),
    blend: fc.constantFrom("additive", "alpha"),
    pointSize: fc.double({ min: 0.5, max: 12, noNaN: true }),
    trails: fc.boolean(),
    trailLength: fc.double({ min: 0, max: 1, noNaN: true }),
  },
  { requiredKeys: [] },
) as fc.Arbitrary<Candidate>;

/** A generator kind the request may preserve. */
const generatorArb: fc.Arbitrary<GeneratorKind> = fc.constantFrom(
  "galaxy",
  "ring",
  "burst",
  "pour",
  "fall",
  "flock",
  "cloth",
  "nbody",
  "text",
  "fire",
  "supernova",
  "molecule",
) as fc.Arbitrary<GeneratorKind>;

/** A style request: the generator + spawn count the caller wants preserved. */
const styleRequestArb: fc.Arbitrary<StyleRequest> = fc.record({
  generator: generatorArb,
  spawnCount: fc.integer({ min: 1, max: 500_000 }),
});

/**
 * A plausible model-suggested params object (already parsed). Keys/values are a
 * mix of valid and slightly-out-of-range so the schema's coercion is exercised;
 * mapStyle merges this over DEFAULT_PARAMS then bounds via labParamsSchema.
 */
const modelParamsArb: fc.Arbitrary<Record<string, unknown>> = fc.record(
  {
    palette: fc.constantFrom("rainbow", "ember", "ice", "aurora", "solar", "mono", "plasma"),
    blend: fc.constantFrom("additive", "alpha"),
    colorA: fc.constantFrom("#112233", "#abcdef", "#ff8800"),
    colorB: fc.constantFrom("#000000", "#ffffff", "#00ff88"),
    tint: fc.constantFrom("#ffffff", "#334455"),
    bloom: fc.boolean(),
    bloomStrength: fc.double({ min: 0, max: 6, noNaN: true }),
    pointSize: fc.double({ min: 0.5, max: 12, noNaN: true }),
  },
  { requiredKeys: [] },
);

/**
 * Assert a candidate/params set is a fixed point of labParamsSchema: parsing it
 * again coerces every field to exactly the same value, i.e. it is fully
 * in-range. This is the machine-checkable form of "every parameter lies within
 * the simulator's valid range" (Property 9).
 */
function assertInRangeFixedPoint(params: LabParams): void {
  const reparsed = labParamsSchema.parse(params);
  assert.deepEqual(
    reparsed,
    params,
    "returned params must be a fixed point of labParamsSchema (in-range)",
  );
}

// ---------------------------------------------------------------------------
// Property 8: Tuner returns a candidate no worse than its start
// ---------------------------------------------------------------------------
describe("runTuner — Property 8: returns a candidate no worse than its start", () => {
  // Feature: helion-completion, Property 8: Tuner returns a candidate no worse than its start
  it("performs >=2 evaluations and score >= seedScore for any objective + seed", () => {
    fc.assert(
      fc.property(objectiveArb, candidateArb, (objective, seed) => {
        const evaluate = (c: Candidate) => scoreCandidate(objective, c);
        const result = runTuner({ prompt: "any prompt", seed, evaluate });

        // Req 9.2: at least two evaluation iterations.
        assert.ok(
          result.evaluations >= 2,
          `expected >= 2 evaluations, got ${result.evaluations}`,
        );
        // Req 9.3 / Property 8: the returned candidate is never worse than the seed.
        assert.ok(
          result.score >= result.seedScore,
          `expected score (${result.score}) >= seedScore (${result.seedScore})`,
        );
      }),
      RUNS,
    );
  });

  // Feature: helion-completion, Property 8: Tuner returns a candidate no worse than its start
  it("example: returns the seed unchanged when no candidate improves (constant evaluate)", () => {
    const seed: Candidate = { gravityX: 1.5, drag: 0.1, bloom: true, bloomStrength: 2 };
    // A constant objective function: nothing the tuner tries can improve it, so
    // it must return the seed's score unchanged and never fabricate a "better"
    // result.
    const evaluate = () => 0.5;
    const result = runTuner({ seed, evaluate });

    assert.equal(result.seedScore, 0.5);
    assert.equal(result.score, 0.5, "no improvement possible → score stays at seed score");
    assert.ok(result.evaluations >= 2, "still performs >= 2 evaluations");
    // The returned params are the (clamped) seed — merged over DEFAULT_PARAMS.
    assert.equal(result.params.gravityX, 1.5);
    assert.equal(result.params.drag, 0.1);
    assert.equal(result.params.bloom, true);
    assert.equal(result.params.bloomStrength, 2);
  });
});

// ---------------------------------------------------------------------------
// Property 9: Tuner and Style outputs are within valid parameter ranges
// ---------------------------------------------------------------------------
describe("Property 9: tuner and style outputs are within valid parameter ranges", () => {
  // Feature: helion-completion, Property 9: Tuner and Style outputs are within valid parameter ranges
  it("runTuner result params are a fixed point of labParamsSchema (in-range)", () => {
    fc.assert(
      fc.property(objectiveArb, candidateArb, (objective, seed) => {
        const evaluate = (c: Candidate) => scoreCandidate(objective, c);
        const result = runTuner({ seed, evaluate });
        assertInRangeFixedPoint(result.params);
      }),
      RUNS,
    );
  });

  // Feature: helion-completion, Property 9: Tuner and Style outputs are within valid parameter ranges
  it("mapStyle result params are a fixed point of labParamsSchema (in-range)", () => {
    fc.assert(
      fc.property(styleRequestArb, modelParamsArb, (request, modelParams) => {
        const result = mapStyle(request, modelParams);
        assert.ok(result.ok, "a valid model params object must map successfully");
        if (result.ok) assertInRangeFixedPoint(result.params);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Style mapping preserves generator and count and includes style fields
// ---------------------------------------------------------------------------
describe("mapStyle — Property 10: preserves generator/count and includes style fields", () => {
  // Feature: helion-completion, Property 10: Style mapping preserves generator and count and includes style fields
  it("preserves generator + spawnCount and populates palette/color/blend for any request", () => {
    fc.assert(
      fc.property(styleRequestArb, modelParamsArb, (request, modelParams) => {
        const result = mapStyle(request, modelParams);
        assert.ok(result.ok, "a valid model params object must map successfully");
        if (!result.ok) return;

        // Req 10.3: generator kind and spawn count are preserved. The request's
        // generator is drawn from GENERATOR_KINDS so it survives verbatim; the
        // spawn count is preserved (clamped to the mapper's 200..200,000 domain).
        assert.equal(result.generator, request.generator, "generator preserved");
        assert.ok(
          GENERATOR_KINDS.includes(result.generator),
          "preserved generator is a valid kind",
        );
        const expectedCount = Math.max(200, Math.min(200_000, Math.round(request.spawnCount)));
        assert.equal(result.spawnCount, expectedCount, "spawn count preserved (clamped)");

        // Req 10.1: the style set always includes populated palette, the color
        // trio (colorA/colorB/tint), and blend — even when the model omits them.
        assert.ok(
          typeof result.params.palette === "string" && result.params.palette.length > 0,
          "palette populated",
        );
        assert.match(result.params.colorA, /^#[0-9a-fA-F]{6}$/, "colorA populated");
        assert.match(result.params.colorB, /^#[0-9a-fA-F]{6}$/, "colorB populated");
        assert.match(result.params.tint, /^#[0-9a-fA-F]{6}$/, "tint populated");
        assert.ok(
          result.params.blend === "additive" || result.params.blend === "alpha",
          "blend populated",
        );
      }),
      RUNS,
    );
  });

  // Feature: helion-completion, Property 10: Style mapping preserves generator and count and includes style fields
  it("example: an unparseable model response returns an error (ok:false), not fabricated params", () => {
    const request: StyleRequest = { generator: "galaxy", spawnCount: 8000 };
    // Invalid JSON with no extractable object span → parseModelJson returns null
    // → mapStyle must surface an error rather than fabricate params (Req 10.4).
    const invalid = mapStyle(request, "not json at all, no braces here");
    assert.equal(invalid.ok, false, "unparseable response → ok:false");

    // A null/undefined model response is likewise an error, never fabricated.
    assert.equal(mapStyle(request, null).ok, false);
    assert.equal(mapStyle(request, undefined).ok, false);

    // Malformed JSON inside a brace span (unparseable) is also an error.
    const brokenBraces = mapStyle(request, "{ palette: rainbow, ");
    assert.equal(brokenBraces.ok, false, "malformed JSON braces → ok:false");
  });

  // Feature: helion-completion, Property 10: Style mapping preserves generator and count and includes style fields
  it("example: a valid raw JSON model string maps successfully with preserved fields", () => {
    const request: StyleRequest = { generator: "ring", spawnCount: 12000 };
    const result = mapStyle(
      request,
      '```json\n{ "palette": "ember", "blend": "additive", "bloom": true }\n```',
    );
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.generator, "ring");
    assert.equal(result.spawnCount, 12000);
    assert.equal(result.params.palette, "ember");
    assert.equal(result.params.blend, "additive");
  });
});
