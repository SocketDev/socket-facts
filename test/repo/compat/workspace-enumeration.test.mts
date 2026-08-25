// socket-lint: mirror-exempt — an end-to-end suite over the workspaces
// EMITTER, not over a TypeScript module.
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { enumerateWorkspaces } from '../../../src/run/workspace-enumeration.mts'
import {
  compatEnv,
  enforceOrAnnounceSkip,
  findBuildToolBin,
  skipReasonFor,
} from './lib/toolchain.mts'

import type { WorkspaceEnumerationResult } from '../../../src/run/workspace-enumeration.mts'

// Workspace enumeration is a SECOND emitter family sharing one jar and one
// invocation path with facts generation. It resolves nothing, so a wrong task
// gate or a wrong plugin filename yields an empty project list rather than an
// error — which is why this drives a real build instead of asserting on args.
// The fixture is the two-module tree the exclude-paths suite uses.
const FIXTURE_SOURCE_DIR = path.join(
  import.meta.dirname,
  'exclude-paths-gradle',
)

let workspace: { projectDir: string; gradleUserHome: string } | undefined
let cleanup: (() => Promise<void>) | undefined

async function enumerate(
  excludePaths?: string[] | undefined,
): Promise<WorkspaceEnumerationResult> {
  return await enumerateWorkspaces({
    bin: findBuildToolBin('gradle')!,
    cwd: workspace!.projectDir,
    env: compatEnv(),
    opts: ['--offline', '-g', workspace!.gradleUserHome],
    tool: 'gradle',
    ...(excludePaths ? { excludePaths } : {}),
  })
}

function names(result: WorkspaceEnumerationResult): string[] {
  return result.projects.map(p => p.name).toSorted()
}

describe('workspace enumeration', () => {
  beforeAll(async () => {
    const reason = skipReasonFor('gradle')
    if (reason) {
      enforceOrAnnounceSkip(reason)
      return
    }
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'socket-facts-ws-'))
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

  it('lists every module without resolving dependencies', async () => {
    if (!workspace) {
      return
    }
    const result = await enumerate()
    expect(result.code).toBe(0)
    expect(names(result)).toStrictEqual([
      'app',
      'exclude-paths-fixture',
      'legacy',
    ])
  })

  it('honours excludePaths, the same as the facts emitters', async () => {
    if (!workspace) {
      return
    }
    expect(names(await enumerate(['legacy']))).toStrictEqual([
      'app',
      'exclude-paths-fixture',
    ])
  })

  it('reports each module with a purl identity, not just a name', async () => {
    if (!workspace) {
      return
    }
    const app = (await enumerate()).projects.find(p => p.name === 'app')
    expect(app?.type).toBe('maven')
    expect(app?.namespace).toBe('com.example')
    expect(app?.version).toBe('1.0.0')
  })
})
