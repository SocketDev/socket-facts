import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, it } from 'vitest'

import {
  SBT_PLUGIN_FILENAME,
  sbtPluginSourcePath,
} from '../../../src/assets.mts'
import { invokeSbt } from '../../../src/run/invoke-build-tool.mts'

import type { FactsGenerationOptions } from '../../../src/run/invocation.mts'

const created: string[] = []

afterEach(async () => {
  while (created.length) {
    await fs.rm(created.pop()!, { force: true, recursive: true })
  }
})

async function globalBase(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'socket-facts-owned-'))
  created.push(dir)
  return dir
}

// The build tool never runs here: `process.execPath` is a real absolute
// executable that rejects sbt's arguments, and the invocation layer is
// never-throw, so the call returns (or rejects on the absent records file)
// without needing a JVM. What is under test is which directory the plugin was
// written into, and whether that directory survives.
function options(
  overrides: Partial<FactsGenerationOptions>,
): FactsGenerationOptions {
  return {
    bin: process.execPath,
    cwd: path.resolve('/'),
    env: {},
    opts: [],
    tool: 'sbt',
    ...overrides,
  }
}

async function runSbtInvocation(config: FactsGenerationOptions): Promise<void> {
  try {
    await invokeSbt(
      config,
      sbtPluginSourcePath(),
      SBT_PLUGIN_FILENAME,
      'socketFacts',
      'socket-sbt-facts-',
    )
  } catch {
    // The fake bin emits no records; the paths under test are already written.
  }
}

// sbt provisions the Scala toolchain under `<global base>/boot`, and withFiles'
// artifactPaths point into it. An ephemeral base deleted before the call
// returns therefore hands back paths that no longer exist — a scan that
// silently under-resolves rather than failing.
describe('invokeSbt with a caller-owned global base', () => {
  it('runs sbt against the supplied directory, not an ephemeral one', async () => {
    const dir = await globalBase()

    await runSbtInvocation(options({ tmpDir: dir }))

    // The plugin lands in the caller's dir only if the supplied base was used.
    await expect(
      fs.access(path.join(dir, 'plugins', SBT_PLUGIN_FILENAME)),
    ).resolves.toBeUndefined()
  })

  it('leaves the supplied directory in place for the caller to delete', async () => {
    const dir = await globalBase()

    await runSbtInvocation(options({ tmpDir: dir }))

    await expect(fs.access(dir)).resolves.toBeUndefined()
  })

  it('writes nothing into the caller-owned dir when none is supplied', async () => {
    const dir = await globalBase()

    await runSbtInvocation(options({}))

    // An ephemeral base is used and cleaned up; the caller's dir is untouched.
    expect(await fs.readdir(dir)).toEqual([])
  })
})
