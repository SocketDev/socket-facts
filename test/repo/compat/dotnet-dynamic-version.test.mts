// socket-lint: mirror-exempt — a conformance suite over the dotnet EMITTER, not
// over a TypeScript module.
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { spawn } from '@socketsecurity/lib/process/spawn/child'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runFactsGeneration } from '../../../src/run/run-facts-generation.mts'
import {
  compatEnv,
  enforceOrAnnounceSkip,
  findBuildToolBin,
  skipReasonFor,
} from './lib/toolchain.mts'

import type { FactsGenerationResult } from '../../../src/run/result.mts'

// The gradle and maven fixtures hold the JVM resolvers to resolve-once: resolve
// at scan time against the developer's real build, never from a manifest parse
// or a cache. The dotnet resolver had no equivalent, so nothing held it to that
// bar — this closes it.
//
// The oracle is MSBuild's own property evaluation, never a golden file. Scope
// boundary worth naming: a full TRANSITIVE NuGet oracle would need a local
// package feed, so this fixture proves the resolve-once property and the
// project-graph edge, not transitive package resolution.
const FIXTURE_SOURCE_DIR = path.join(
  import.meta.dirname,
  'dotnet-dynamic-version',
)

const VERSION_FILENAME = 'version.txt'

let workspace: { projectDir: string; computedVersion: string } | undefined
let cleanup: (() => Promise<void>) | undefined
let result: FactsGenerationResult | undefined

describe('the dotnet dynamic-version fixture cannot be satisfied statically', () => {
  // Runs with no .NET toolchain: it asserts a property of the fixture text
  // itself, which is what makes the build assertions below meaningful.
  it('names no resolved version anywhere in the committed project files', async () => {
    const entries = await fs.readdir(FIXTURE_SOURCE_DIR, {
      recursive: true,
      withFileTypes: true,
    })
    let checked = 0
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue
      }
      const text = await fs.readFile(
        path.join(entry.parentPath, entry.name),
        'utf8',
      )
      // The only version-shaped thing allowed is the file read itself.
      expect(text).not.toMatch(/<Version>\s*\d/)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('reads its version from a file the checkout does not carry', async () => {
    const csproj = await fs.readFile(
      path.join(FIXTURE_SOURCE_DIR, 'app/App.csproj'),
      'utf8',
    )
    expect(csproj).toContain('System.IO.File]::ReadAllText')
    expect(csproj).toContain(VERSION_FILENAME)
    await expect(
      fs.access(path.join(FIXTURE_SOURCE_DIR, VERSION_FILENAME)),
    ).rejects.toThrow()
  })
})

describe('the dotnet emitter resolves once, against the real build', () => {
  beforeAll(async () => {
    const reason = skipReasonFor('dotnet')
    if (reason) {
      enforceOrAnnounceSkip(reason)
      return
    }
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'socket-facts-dotnet-dynver-'),
    )
    const projectDir = path.join(root, 'project')
    await fs.cp(FIXTURE_SOURCE_DIR, projectDir, { recursive: true })
    // Generated per run, so it appears in no committed file. No trailing
    // newline: MSBuild's ReadAllText does not trim.
    const computedVersion = `0.0.0-resolved-${process.hrtime.bigint()}`
    await fs.writeFile(path.join(projectDir, VERSION_FILENAME), computedVersion)
    workspace = { computedVersion, projectDir }
    cleanup = async () => {
      await fs.rm(root, { force: true, recursive: true })
    }
    result = await runFactsGeneration({
      bin: findBuildToolBin('dotnet')!,
      cwd: projectDir,
      env: compatEnv(),
      opts: [],
      tool: 'dotnet',
      withFiles: true,
    })
  }, 300_000)

  afterAll(async () => {
    await cleanup?.()
  })

  it('completes with no resolution failures', () => {
    if (!workspace) {
      return
    }
    expect(result?.code).toBe(0)
    expect(result?.report.failures).toEqual([])
  })

  it('carries the computed version on every project', () => {
    if (!workspace) {
      return
    }
    const projects = result?.facts.projects ?? []
    expect(projects.map(p => p.name).toSorted()).toStrictEqual(['App', 'Lib'])
    for (const project of projects) {
      expect(project.version).toBe(workspace.computedVersion)
    }
  })

  // The csproj states the ProjectReference as a PATH and gives no version, so
  // the version on this edge exists only after MSBuild evaluates the referenced
  // project. A static resolver cannot produce it at all.
  it('carries the computed version on the project-reference edge', () => {
    if (!workspace) {
      return
    }
    const lib = result?.facts.components.find(c => c.name === 'Lib')
    expect(lib, 'no component for the referenced project').toBeDefined()
    expect(lib?.type).toBe('nuget')
    expect(lib?.version).toBe(workspace.computedVersion)
  })

  it("agrees with MSBuild's own evaluation of the version", async () => {
    if (!workspace) {
      return
    }
    // The oracle: dotnet reporting the property itself, not a golden file.
    const out = await spawn(
      findBuildToolBin('dotnet')!,
      ['msbuild', 'app/App.csproj', '-getProperty:Version', '-nologo'],
      { cwd: workspace.projectDir, env: compatEnv(), stdio: 'pipe' },
    )
    const reported = String(out.stdout).trim()
    expect(reported).toBe(workspace.computedVersion)
    expect(result?.facts.projects?.[0]?.version).toBe(reported)
  })
})
