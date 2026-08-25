// socket-lint: mirror-exempt — an end-to-end suite over the dotnet EMITTER's
// exclude handling, not over a TypeScript module.
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runFactsGeneration } from '../../../src/run/run-facts-generation.mts'
import {
  compatEnv,
  enforceOrAnnounceSkip,
  findBuildToolBin,
  skipReasonFor,
} from './lib/toolchain.mts'

import type { FactsGenerationResult } from '../../../src/run/result.mts'

// excludePaths crosses a language boundary as pre-compiled regex sources: this
// package compiles the globs, the emitter only compiles them to a Regex. A
// mismatch there matches NOTHING silently — a wrong scan, not a crash — so the
// unit tests on either side of the boundary cannot catch it. This suite drives
// a real dotnet build across that boundary.
const FIXTURE_SOURCE_DIR = path.join(
  import.meta.dirname,
  'exclude-paths-dotnet',
)

let workspace: { projectDir: string } | undefined
let cleanup: (() => Promise<void>) | undefined

async function generate(
  excludePaths?: string[] | undefined,
): Promise<FactsGenerationResult> {
  return await runFactsGeneration({
    bin: findBuildToolBin('dotnet')!,
    cwd: workspace!.projectDir,
    env: compatEnv(),
    opts: [],
    tool: 'dotnet',
    ...(excludePaths ? { excludePaths } : {}),
  })
}

function projectNames(result: FactsGenerationResult): string[] {
  return (result.facts.projects ?? []).map(p => p.name).toSorted()
}

// A .slnx contributes no project of its own, so unlike the Gradle fixture
// there is no root entry in these expectations.
describe('excludePaths reaches the dotnet emitter', () => {
  beforeAll(async () => {
    const reason = skipReasonFor('dotnet')
    if (reason) {
      enforceOrAnnounceSkip(reason)
      return
    }
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'socket-facts-excl-net-'),
    )
    const projectDir = path.join(root, 'project')
    await fs.cp(FIXTURE_SOURCE_DIR, projectDir, { recursive: true })
    workspace = { projectDir }
    cleanup = async () => {
      await fs.rm(root, { force: true, recursive: true })
    }
  })

  afterAll(async () => {
    await cleanup?.()
  })

  it('records every project when nothing is excluded', async () => {
    if (!workspace) {
      return
    }
    expect(projectNames(await generate())).toStrictEqual(['App', 'Legacy'])
  })

  it('drops a wholly excluded project', async () => {
    if (!workspace) {
      return
    }
    expect(projectNames(await generate(['legacy']))).toStrictEqual(['App'])
  })

  // The compiled pattern already means "this dir OR its subtree", so a
  // user-written trailing `/**` must not change the outcome.
  it('treats a trailing globstar as the same exclusion', async () => {
    if (!workspace) {
      return
    }
    expect(projectNames(await generate(['legacy/**']))).toStrictEqual(['App'])
  })

  it('leaves a non-matching exclude path alone', async () => {
    if (!workspace) {
      return
    }
    expect(projectNames(await generate(['legacyx']))).toStrictEqual([
      'App',
      'Legacy',
    ])
  })
})
