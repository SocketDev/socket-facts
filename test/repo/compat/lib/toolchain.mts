import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { emitterAssetPath } from '../../../../src/assets.mts'

import type { BuildTool } from '../../../../src/run/build-tool.mts'

// Set to a truthy value where the conformance matrix MUST run — a machine with
// the JVM toolchain installed, or a CI job that provisions one. A missing build
// tool then fails the suite instead of skipping it, so "the fixture is green"
// can never mean "the fixture never ran".
export const REQUIRE_COMPAT_ENV_VAR = 'SOCKET_FACTS_REQUIRE_COMPAT'

const BIN_ENV_VAR: Readonly<Record<BuildTool, string>> = Object.freeze({
  dotnet: 'SOCKET_FACTS_DOTNET_BIN',
  gradle: 'SOCKET_FACTS_GRADLE_BIN',
  maven: 'SOCKET_FACTS_MAVEN_BIN',
  sbt: 'SOCKET_FACTS_SBT_BIN',
})

const BIN_NAME: Readonly<Record<BuildTool, string>> = Object.freeze({
  dotnet: 'dotnet',
  gradle: 'gradle',
  maven: 'mvn',
  sbt: 'sbt',
})

// How an absent emitter asset gets repaired. The gradle init script and the sbt
// plugin source are committed, so an absent one is a broken checkout. The Maven
// extension is a jar that a JDK has to build, which `pnpm run build`
// deliberately does not do — a plain checkout carries no JDK obligation.
const ASSET_FIX: Readonly<Record<BuildTool, string>> = Object.freeze({
  dotnet: 'run `pnpm run build:dotnet-tool` (needs a .NET 8+ SDK)',
  gradle: 'restore the committed emitter source',
  maven: 'run `pnpm run build:maven-extension` (needs a JDK)',
  sbt: 'restore the committed emitter source',
})

export function compatIsRequired(): boolean {
  return Boolean(process.env[REQUIRE_COMPAT_ENV_VAR])
}

// An absolute path, because the generation API refuses anything else. Looks at
// the per-tool env override first, then walks PATH.
export function findBuildToolBin(tool: BuildTool): string | undefined {
  const override = process.env[BIN_ENV_VAR[tool]]
  if (override) {
    const resolved = path.isAbsolute(override)
      ? override
      : path.resolve(override)
    return existsSync(resolved) ? resolved : undefined
  }
  const entries = (process.env['PATH'] ?? '').split(path.delimiter)
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const entry = entries[i]
    if (!entry) {
      continue
    }
    const candidate = path.join(entry, BIN_NAME[tool])
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return undefined
}

// The environment the fixture build runs with. Deliberately minimal: the
// generation API takes an explicit env, and a conformance run that inherited
// the developer's shell would not be reproducible.
export function compatEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'] ?? '',
  }
  const javaHome = process.env['JAVA_HOME']
  if (javaHome) {
    env['JAVA_HOME'] = javaHome
  }
  const home = process.env['HOME']
  if (home) {
    env['HOME'] = home
  }
  return env
}

// Loud, not silent. A skipped conformance run prints why it skipped and what to
// install, and under REQUIRE_COMPAT it throws instead. Two preconditions, both
// announced the same way: the build tool itself, and the emitter asset this
// package hands that build.
export function skipReasonFor(tool: BuildTool): string | undefined {
  if (!findBuildToolBin(tool)) {
    return (
      `No ${BIN_NAME[tool]} on PATH. ` +
      `Where: the ${tool} dynamic-version conformance fixture. ` +
      `Saw no executable, wanted ${tool === 'dotnet' ? 'a .NET 8+ SDK' : `a ${tool} install plus a JDK`}. ` +
      `Fix: install ${tool}, or point ${BIN_ENV_VAR[tool]} at its binary. ` +
      `Set ${REQUIRE_COMPAT_ENV_VAR}=1 to turn this skip into a failure.`
    )
  }
  return emitterAssetSkipReason(tool, emitterAssetPath(tool))
}

// The second precondition, split out so it is testable without a checkout that
// happens to be missing the jar.
export function emitterAssetSkipReason(
  tool: BuildTool,
  assetPath: string,
): string | undefined {
  if (existsSync(assetPath)) {
    return undefined
  }
  return (
    `No ${tool} emitter asset. ` +
    `Where: ${assetPath}. ` +
    `Saw no file, wanted the emitter this package hands the build. ` +
    `Fix: ${ASSET_FIX[tool]}. ` +
    `Set ${REQUIRE_COMPAT_ENV_VAR}=1 to turn this skip into a failure.`
  )
}

export function enforceOrAnnounceSkip(reason: string): void {
  if (compatIsRequired()) {
    throw new Error(reason)
  }
  // oxlint-disable-next-line socket/no-console-prefer-logger -- a test-runner warning belongs on the runner's own stream, not a product logger.
  console.warn(`SKIPPED CONFORMANCE RUN: ${reason}`)
}
