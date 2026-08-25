// socket-lint: mirror-exempt — an end-to-end suite over the Gradle EMITTER's
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
// package compiles the globs, the emitter only Pattern.compile()s them. A
// mismatch there matches NOTHING silently — a wrong scan, not a crash — so the
// unit tests on either side of the boundary cannot catch it. This suite drives
// a real Gradle build across that boundary.
const FIXTURE_SOURCE_DIR = path.join(
  import.meta.dirname,
  'exclude-paths-gradle',
)

let workspace: { projectDir: string; gradleUserHome: string } | undefined
let cleanup: (() => Promise<void>) | undefined

async function generate(
  excludePaths?: string[] | undefined,
): Promise<FactsGenerationResult> {
  return await runFactsGeneration({
    bin: findBuildToolBin('gradle')!,
    cwd: workspace!.projectDir,
    env: compatEnv(),
    opts: ['--offline', '-g', workspace!.gradleUserHome],
    tool: 'gradle',
    ...(excludePaths ? { excludePaths } : {}),
  })
}

function projectNames(result: FactsGenerationResult): string[] {
  return (result.facts.projects ?? []).map(p => p.name).toSorted()
}

// The root build is itself a project, so it is present in every expectation
// below; only the subprojects are what an exclude path removes here.
const ROOT = 'exclude-paths-fixture'

describe('excludePaths reaches the gradle emitter', () => {
  beforeAll(async () => {
    const reason = skipReasonFor('gradle')
    if (reason) {
      enforceOrAnnounceSkip(reason)
      return
    }
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'socket-facts-excl-'))
    const projectDir = path.join(root, 'project')
    await fs.cp(FIXTURE_SOURCE_DIR, projectDir, { recursive: true })
    workspace = { gradleUserHome: path.join(root, 'gradle-home'), projectDir }
    cleanup = async () => {
      await fs.rm(root, { force: true, recursive: true })
    }
  })

  afterAll(async () => {
    await cleanup?.()
  })

  it('records every subproject when nothing is excluded', async () => {
    if (!workspace) {
      return
    }
    expect(projectNames(await generate())).toStrictEqual([
      'app',
      ROOT,
      'legacy',
    ])
  })

  it('drops a wholly excluded subproject', async () => {
    if (!workspace) {
      return
    }
    expect(projectNames(await generate(['legacy']))).toStrictEqual([
      'app',
      ROOT,
    ])
  })

  // The compiled pattern already means "this dir OR its subtree", so a
  // user-written trailing `/**` must not change the outcome.
  it('treats a trailing globstar as the same exclusion', async () => {
    if (!workspace) {
      return
    }
    expect(projectNames(await generate(['legacy/**']))).toStrictEqual([
      'app',
      ROOT,
    ])
  })

  it('leaves a non-matching exclude path alone', async () => {
    if (!workspace) {
      return
    }
    expect(projectNames(await generate(['legacyx']))).toStrictEqual([
      'app',
      ROOT,
      'legacy',
    ])
  })
})
