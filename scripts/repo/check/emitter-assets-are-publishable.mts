/*
 * @file `check --all` gate: the emitter assets a consumer needs at runtime are
 *   present and reach the published tarball.
 *
 *   Three failure modes, and one of them is the reason this gate exists at all.
 *   Maven loaded with no core extension on `-Dmaven.ext.class.path` runs to
 *   completion and emits nothing, so a tarball that ships the sources without
 *   the built jar produces an EMPTY SBOM on a real project — which downstream
 *   reads as "this project has no dependencies", not as a failure. The gate is
 *   therefore fail-closed on a packaging run.
 *
 *   1. An emitter source is missing. Always a failure.
 *   2. `package.json` `files` does not cover `emitters/`, so npm would drop the
 *      assets from the tarball. Always a failure.
 *   3. A built emitter artifact is absent — the Maven extension jar or the
 *      published dotnet tool. A failure under `--require-built` (the packaging
 *      gate) and a warning otherwise, because a plain checkout has no JDK or
 *      .NET SDK obligation.
 *
 *   Usage: node scripts/repo/check/emitter-assets-are-publishable.mts [--require-built]
 *   Exit 0 when clean, 1 on any finding.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { isMainModule } from '../../fleet/process/is-main-module.mts'
import {
  DOTNET_TOOL_DIR,
  DOTNET_TOOL_DLL,
  EMITTERS_DIR,
  MAVEN_EXTENSION_DIR,
  MAVEN_EXTENSION_JAR,
  MAVEN_WRAPPER,
  REPO_ROOT,
} from '../paths.mts'

const logger = getDefaultLogger()

export const REQUIRED_EMITTER_FILES: readonly string[] = [
  path.join(EMITTERS_DIR, 'socket-facts.init.gradle'),
  path.join(EMITTERS_DIR, 'socket-facts.plugin.scala'),
  path.join(MAVEN_EXTENSION_DIR, 'pom.xml'),
  path.join(DOTNET_TOOL_DIR, 'socket-facts-dotnet.csproj'),
  path.join(DOTNET_TOOL_DIR, 'FactsRunner.cs'),
  path.join(DOTNET_TOOL_DIR, 'Program.cs'),
  path.join(DOTNET_TOOL_DIR, 'RecordsWriter.cs'),
  path.join(DOTNET_TOOL_DIR, 'ToolOptions.cs'),
  MAVEN_WRAPPER,
]

// Emitter artifacts that a build step produces rather than a checkout carrying.
// Both are fail-closed at packaging time and a warning otherwise, because a
// plain checkout has no JDK or .NET SDK obligation.
export const BUILT_EMITTER_ARTIFACTS: ReadonlyArray<{
  path: string
  wanted: string
  fix: string
}> = [
  {
    path: MAVEN_EXTENSION_JAR,
    wanted:
      'the shaded core-extension jar, without which Maven emits an empty SBOM instead of failing',
    fix: 'run `pnpm run build:maven-extension` (needs a JDK) before packaging',
  },
  {
    path: DOTNET_TOOL_DLL,
    wanted:
      'the published socket-facts-dotnet assembly, without which every dotnet facts run fails to launch',
    fix: 'run `pnpm run build:dotnet-tool` (needs a .NET 8+ SDK) before packaging',
  },
]

export const EMITTERS_FILES_ENTRY = 'emitters/**/*'

export interface EmitterFinding {
  readonly where: string
  readonly saw: string
  readonly wanted: string
  readonly fix: string
}

export function isManifestObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readPackageFiles(): string[] {
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  )
  const files = isManifestObject(manifest) ? manifest['files'] : undefined
  return Array.isArray(files)
    ? files.filter((entry): entry is string => typeof entry === 'string')
    : []
}

export function checkEmitterAssets(requireBuilt: boolean): EmitterFinding[] {
  const findings: EmitterFinding[] = []
  for (let i = 0, { length } = REQUIRED_EMITTER_FILES; i < length; i += 1) {
    const file = REQUIRED_EMITTER_FILES[i]!
    if (!existsSync(file)) {
      findings.push({
        fix: 'restore the emitter source; the three emitters are this package’s reason to exist',
        saw: 'no such file',
        wanted: 'the emitter asset the runtime resolver points at',
        where: path.relative(REPO_ROOT, file),
      })
    }
  }
  if (!readPackageFiles().includes(EMITTERS_FILES_ENTRY)) {
    findings.push({
      fix: `add "${EMITTERS_FILES_ENTRY}" to package.json \`files\``,
      saw: 'the emitters directory is not in the `files` allowlist',
      wanted: 'npm to ship the emitters with the package',
      where: 'package.json',
    })
  }
  if (requireBuilt) {
    for (let i = 0, { length } = BUILT_EMITTER_ARTIFACTS; i < length; i += 1) {
      const artifact = BUILT_EMITTER_ARTIFACTS[i]!
      if (!existsSync(artifact.path)) {
        findings.push({
          fix: artifact.fix,
          saw: 'no built artifact',
          wanted: artifact.wanted,
          where: path.relative(REPO_ROOT, artifact.path),
        })
      }
    }
  }
  return findings
}

export function main(): void {
  const requireBuilt = process.argv.includes('--require-built')
  const findings = checkEmitterAssets(requireBuilt)
  if (findings.length === 0) {
    if (!requireBuilt) {
      for (
        let i = 0, { length } = BUILT_EMITTER_ARTIFACTS;
        i < length;
        i += 1
      ) {
        const artifact = BUILT_EMITTER_ARTIFACTS[i]!
        if (!existsSync(artifact.path)) {
          logger.warn(
            `emitter-assets-are-publishable: ${path.relative(REPO_ROOT, artifact.path)} is not built. ` +
              `That emitter throws until you build it; packaging runs this gate with ` +
              `--require-built and fails instead. Fix: ${artifact.fix}.`,
          )
        }
      }
    }
    logger.info(
      `emitter-assets-are-publishable: ${REQUIRED_EMITTER_FILES.length} emitter asset(s) present and shipped.`,
    )
    return
  }
  logger.error(
    `emitter-assets-are-publishable: ${findings.length} finding(s) — a tarball missing an emitter produces an empty SBOM, not an error.`,
  )
  for (let i = 0, { length } = findings; i < length; i += 1) {
    const finding = findings[i]!
    logger.error(`  where:  ${finding.where}`)
    logger.error(`  saw:    ${finding.saw}`)
    logger.error(`  wanted: ${finding.wanted}`)
    logger.error(`  fix:    ${finding.fix}`)
  }
  process.exitCode = 1
}

if (isMainModule(import.meta.url)) {
  main()
}
