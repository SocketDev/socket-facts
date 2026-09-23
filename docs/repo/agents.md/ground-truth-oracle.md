# The ground-truth oracle

`src/conformance/` diffs emitted facts against the build tool's **own**
authoritative resolution. A golden file records what this implementation
produced, so it agrees with itself forever; a ground-truth diff records what the
build produced, so it disagrees the moment an implementation stops running the
build. That difference is the regression test for the #1385 divergence.

## The shape

Borrowed from sdxgen's `src/utils/tool-comparison.mts`, which already diffs its
parser output against real `mvn dependency:tree` output. Same three moves:

1. **Run the build's own report.** `gradle dependencies --configuration <name>`
   or `mvn dependency:tree -DoutputType=json`.
2. **Parse it to a `GroundTruth`** - `group:name` → resolved version, plus the
   edge set. `parseGradleDependencyTree` reads the `selector -> resolved`
   substitution the report prints, which is the resolver stating in its own
   words that the declared and the resolved version differ.
3. **Diff, then assert.** `compareFactsToGroundTruth` classifies every
   component `match` / `missing` / `extra` / `version-mismatch`;
   `conformanceViolations` states the pass condition once so no caller can
   accidentally assert a weaker one.

## Why `extra` is allowed and nothing else is

A ground-truth report covers ONE configuration or scope; the facts cover every
one the emitter scanned. So a component the facts carry and the report does not
is expected. A component the build resolved and the facts dropped, an edge the
build reports and the facts omit, or a version the two disagree about is the
failure the suite exists to catch.

sdxgen's harness asserts a percentage, 80% or 90% with tool execution, because
its parser is allowed to be approximate. This one asserts zero divergence,
because ours is not.

## Two ways this differs from sdxgen's harness, deliberately

**No early return.** sdxgen's Maven comparison logs "Maven not available,
skipping comparison" and `return`s, which reports green on a machine where the
oracle never ran. Here `captureGradleGroundTruth` / `captureMavenGroundTruth`
throw, and the caller chooses between a loud skip and a hard failure through
`SOCKET_FACTS_REQUIRE_COMPAT`.

**No static fallback anywhere.** sdxgen's Maven path falls back to parsing the
pom when `mvn` is absent, and its sbt parser never executes sbt at all - its own
header calls it "regex-based build.sbt parsing (no Scala compiler)…
best-effort". That posture is right for sdxgen, whose job is to produce a
manifest from whatever is available. It is wrong here: a static fallback
reintroduces exactly the divergence #1385 was reversed over, and it does so
silently, because a static parse of a dynamically-versioned build produces a
plausible-looking answer rather than an error.

## Direction of dependency: sdxgen → facts

sdxgen's JVM lane is the intended consumer, not the supplier. When it adopts
this package it can delete its own
`src/parsers/gradle/dependency-tree.init.gradle` duplication and replace its
best-effort sbt regex with real plugin-driven resolution. facts does **not**
depend on sdxgen and never should - sdxgen's optional-execution posture is the
thing this package exists to not have.

The public API is shaped so that a CycloneDX conversion is comfortable on
sdxgen's side, and stops there:

- Component identity is purl-shaped (`type` / `namespace` / `name` / `version` /
  `qualifiers`), so a `bom-ref` and a `purl` fall out of it.
- The edge list is addressable: every component has a stable `id`, and
  `dependencies` holds `id`s, which is the `dependencies[].dependsOn` shape.
- `projects[]` keeps first-party modules distinguishable from resolved
  dependencies, which is the metadata-component-versus-component split.

**The CycloneDX converter is not built here.** It is sdxgen's output format, and
putting it here would drag a second output contract into a package whose whole
argument is that it owns exactly one.

## What was mined from sdxgen and what was left

| sdxgen module          | Here                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool-comparison.mts`  | ported in shape as `src/conformance/`, with a zero-divergence assertion instead of a percentage                                                                   |
| `spawn-timeouts.mts`   | ported as `src/run/timeouts.mts` - the facts spawn previously had no ceiling, so a wedged build hung a scan                                                       |
| `tool-version.mts`     | not ported - the emitter's own `meta` record already reports the version of the tool that actually ran, which is strictly better than probing a binary beforehand |
| `tool-diagnostics.mts` | not ported - its warnings describe an OPTIONAL execution being enabled; execution is mandatory here, and the resolution report already carries per-failure detail |
| `file-cache.mts`       | not ported, and must not be - a cache on the resolution path is the failure mode, not an optimization                                                             |
| `error-context.mts`    | not ported - `@socketsecurity/lib/errors/*` plus the What/Where/Saw/Fix convention already covers it                                                              |
