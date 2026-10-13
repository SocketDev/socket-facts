# API Reference

`@socketsecurity/facts` exposes generation, contract, report, and conformance APIs. The export map in [`package.json`](../package.json) defines the public subpaths. `src/index.mts` re-exports the top-level API; focused subpaths are `@socketsecurity/facts/assets`, `@socketsecurity/facts/conformance`, `@socketsecurity/facts/contract`, and `@socketsecurity/facts/report`.

## Generate facts

Use `runFactsGeneration` from the root package to run the selected build-tool emitter with a resolved, vetted invocation. The caller supplies the tool, absolute executable, arguments, environment, and working directory. The package does not discover an executable or read the process environment as a fallback.

```ts
import { runFactsGeneration } from '@socketsecurity/facts'

const result = await runFactsGeneration({
  tool: 'gradle',
  bin: '/repo/gradlew',
  opts: ['--no-daemon'],
  env: process.env,
  cwd: '/repo',
})
```

The required invocation fields and generation result are declared in [`src/run/run-facts-generation.mts`](../src/run/run-facts-generation.mts) and [`src/run/result.mts`](../src/run/result.mts). `assertFactsInvocation` validates the invocation boundary. `applyBuildEnvPolicy` and `scrubBuildToolEnv` implement explicit build-tool environment handling.

## Fact and sidecar contracts

The `contract` subpath provides `SocketFactsSbom`, `SocketFactsTool`, component and project types, `SOCKET_FACTS_SBOM_FORMAT`, and validators. `validateSocketFactsSbom` returns structured contract violations; `assertSocketFactsSbom` throws when validation fails. The sidecar contract covers resolved artifact paths and their project/component associations.

See [`src/contract/index.mts`](../src/contract/index.mts), [`src/contract/sbom.mts`](../src/contract/sbom.mts), and [`src/contract/sidecar.mts`](../src/contract/sidecar.mts) for exact schema fields, required values, and validation behavior. `mavenCoordinateKey` creates the Maven coordinate key used by the contract.

## Resolution reports

The root package exports report classifiers and renderers. They classify resolution failures by build-tool dialect and render resolution reports. Public classifiers are `classifyGradleFailure`, `classifyIvyFailure`, `classifyMavenFailure`, and `classifyNugetFailure`. The corresponding dialect constants are `GRADLE_DIALECT`, `SBT_DIALECT`, `MAVEN_DIALECT`, and `NUGET_DIALECT`.

`renderResolutionReport` and `renderResolutionErrorReport` produce reports from the typed structures in [`src/report/report-types.mts`](../src/report/report-types.mts). The report API does not invoke a build tool; generation is handled by the build-tool emitters.

## Conformance API

The `conformance` subpath compares generated facts with build-tool output. It exports `parseGradleDependencyTree`, `parseGradleDependencyRow`, and `createGroundTruth` for Gradle dependency data; `parseMavenDependencyTreeJson` and `isMavenTreeNode` for Maven tree data; and `compareFactsToGroundTruth`, `conformanceViolations`, and `renderConformanceReport` for comparisons.

Ground-truth rows represent the resolver's observed components and edges. See [`src/conformance/index.mts`](../src/conformance/index.mts), [`src/conformance/ground-truth.mts`](../src/conformance/ground-truth.mts), and [`src/conformance/compare.mts`](../src/conformance/compare.mts) for the input shapes and verdicts.

## Emitter assets

The `assets` subpath resolves packaged build-tool assets. Use `emitterAssetPath(tool)` for the emitter corresponding to a `BuildTool`. Dedicated helpers locate the Gradle init script, SBT plugin source, Maven extension JAR, and .NET tool DLL. `assertMavenExtensionBuilt` and `assertDotnetToolBuilt` report when those optional compiled assets are unavailable.

| Build tool | Emitter asset                                    |
| ---------- | ------------------------------------------------ |
| Gradle     | `socket-facts.init.gradle`                       |
| Maven      | `socket-facts-maven-extension.jar`               |
| SBT        | `SocketFactsPlugin.scala` source                 |
| NuGet      | `socket-facts.dll` under the .NET tool directory |

See [`src/assets.mts`](../src/assets.mts) for asset names and path behavior. Emitter implementation and build requirements are documented in [emitter guides](../emitters/README.md) where available.

## Resolution and configuration helpers

The root API exports helpers used by callers that construct generation inputs: `BUILD_TOOLS`, `isBuildTool`, `conventionalBuildToolBin`, and wrapper-path helpers; `createConfigGlobFilter`, `compileConfigPatterns`, and pattern serializers; timeout parsing and environment variable constants; and pipeline assembly functions such as `assembleFacts` and `buildArtifactPaths`.

The source modules linked from [`src/index.mts`](../src/index.mts) document their exact parameters, result types, and validation. See the [README examples](../README.md#usage) for invocation construction and report comparison.

## Hosted emitter details

- [Gradle emitter source](../emitters/socket-facts.init.gradle)
- [Maven extension source](../emitters/maven-extension/src/main/java/dev/socket/facts/SocketFactsRecordsEngine.java)
- [SBT plugin source](../emitters/socket-facts.plugin.scala)
- [.NET emitter source](../emitters/dotnet-tool/Program.cs)
