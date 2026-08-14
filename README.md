# facts

<a href="https://badge.socket.dev/npm/package/@socketsecurity/facts"><img src="https://badge.socket.dev/npm/package/@socketsecurity/facts" alt="Socket Badge" height="20"></a>
<img src="https://raw.githubusercontent.com/SocketDev/socket-facts/HEAD/assets/repo/coverage.svg" width="97" height="20" alt="Coverage" />

[![Follow @SocketSecurity](https://raw.githubusercontent.com/SocketDev/socket-facts/HEAD/assets/fleet/badge-follow-x.svg)](https://twitter.com/SocketSecurity)
[![Follow @socket.dev on Bluesky](https://raw.githubusercontent.com/SocketDev/socket-facts/HEAD/assets/fleet/badge-follow-bluesky.svg)](https://bsky.app/profile/socket.dev)

Generation of `.socket.facts.json` and the wire contracts around it.

Generation of `.socket.facts.json` for JVM projects has crossed the same
ownership boundary twice: socket-cli delegated it to a reachability partner in
June 2026 and reversed the delegation 26 days later, because the partner
re-resolved the build later in the pipeline and diverged from the scan-time
build on dynamically-versioned projects. Both sides now carry emitters and
schemas that describe the same bytes, so this package holds one copy of each and
both consumers import it instead of the code moving back and forth again.

**This package never decides whether a build-tool invocation is trustworthy.**
`socket.json` lets a repository supply the build binary and its options, which
makes that an attacker-controlled input and the consumer's call. So
`runFactsGeneration` takes an invocation that is already resolved and already
vetted - an absolute `bin`, an explicit `opts` array, an explicit `env`, an
explicit `cwd` - and throws when any of them is missing rather than falling back
to a PATH lookup, a wrapper probe, or `process.env`. It runs the invocation; it
does not assemble one.

The property everything here protects is that **resolution happens once, at scan
time, against the developer's real build**. A resolver that reads a cache or
parses a manifest statically passes a literal-version fixture and diverges on a
real project, so the conformance suite is built out of selectors - a wildcard, a
bounded range, a SNAPSHOT, and a project version generated per run - whose
answers appear in no committed file, and it diffs what this package emitted
against what the build tool itself reports resolving. There is no static
fallback: a build tool that cannot run is a loud failure, never a degraded
success.

[sdxgen](https://github.com/SocketDev/sdxgen) is the other intended consumer,
and the dependency runs **sdxgen → facts**: its JVM lane converts these facts to
CycloneDX, which lets it drop its own duplicated Gradle init script and replace
best-effort sbt regex parsing with real plugin-driven resolution. Component
identity here is purl-shaped and the edge list is addressable so that conversion
is comfortable, but the converter belongs on sdxgen's side, not this one.

## Install

```sh
npm install @socketsecurity/facts
```

## Usage

Run a build tool's emitter against an invocation you have already resolved:

```js
import { runFactsGeneration } from '@socketsecurity/facts'

const { artifactPaths, code, facts, report } = await runFactsGeneration({
  tool: 'gradle',
  // Absolute, and chosen by your trust policy - not looked up here.
  bin: '/repo/gradlew',
  // Already filtered by your trust policy.
  opts: [],
  // Explicit. GRADLE_OPTS, JAVA_TOOL_OPTIONS, MAVEN_OPTS, SBT_OPTS, and
  // _JAVA_OPTIONS are stripped by default; pass envPolicy: 'as-given' to keep them.
  env: { JAVA_HOME: process.env.JAVA_HOME, PATH: process.env.PATH },
  cwd: '/repo',
  withFiles: true,
})
```

<details>
<summary>The other three entry points: wire contracts, conformance, and emitter assets</summary>

Share the wire contracts instead of re-declaring them:

```js
import {
  assertResolvedPathsSidecar,
  validateSocketFactsSbom,
} from '@socketsecurity/facts/contract'

// Throws with what / where / saw-vs-wanted / fix, including on an additive
// field, which a strict consumer rejects wholesale.
const sidecar = assertResolvedPathsSidecar(payload, 'reachability sidecar read')
```

Verify emitted facts against the build's own answer:

```js
import {
  compareFactsToGroundTruth,
  conformanceViolations,
  parseGradleDependencyTree,
} from '@socketsecurity/facts/conformance'

// `gradle dependencies --configuration runtimeClasspath` output.
const truth = parseGradleDependencyTree(report)
const divergence = conformanceViolations(
  compareFactsToGroundTruth(facts, truth),
)
```

Resolve the emitter assets rather than guessing where they live:

```js
import {
  assertMavenExtensionBuilt,
  dotnetToolDllPath,
  gradleInitScriptPath,
  sbtPluginSourcePath,
} from '@socketsecurity/facts/assets'
```

</details>

## Development

<details>
<summary>Contributor commands</summary>

```sh
pnpm install
pnpm run check
pnpm test
```

Two emitters compile from source and are not part of `pnpm run build`, because
a plain checkout cannot assume either toolchain. The Maven core extension needs
a JDK; the dotnet tool needs a .NET 8+ SDK:

```sh
pnpm run build:maven-extension
pnpm run build:dotnet-tool
```

The dynamic-version conformance suite needs Gradle, Maven, and a JDK. It skips
loudly when they are absent; set `SOCKET_FACTS_REQUIRE_COMPAT=1` to turn that
skip into a failure on a machine that should have them:

```sh
SOCKET_FACTS_REQUIRE_COMPAT=1 pnpm test test/repo/compat
```

</details>

## License

MIT

<br/>
<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SocketDev/socket-facts/HEAD/assets/fleet/socket-combomark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/SocketDev/socket-facts/HEAD/assets/fleet/socket-combomark-light.svg">
    <img width="320" height="91" alt="Socket" src="https://raw.githubusercontent.com/SocketDev/socket-facts/HEAD/assets/fleet/socket-combomark-light.svg">
  </picture>
</div>
