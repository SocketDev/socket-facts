// socket-lint: mirror-exempt — an end-to-end suite over build-tool argument
// precedence, not over a TypeScript module.
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

// Every build tool resolves a repeated property last-one-wins — measured on
// maven `-D` and gradle `-P`. This package therefore passes its own properties
// AFTER the caller's opts, so a caller cannot unload the emitter.
//
// The case here is the one a collision check cannot catch: maven accepts
// `--define` as a synonym for `-D`, which matches no `-D` pattern. Before the
// ordering fix this run emitted nothing and still exited 0 — an empty SBOM that
// reads downstream as "no dependencies".
const POM = `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>precedence</artifactId>
  <version>1.0.0</version>
  <packaging>jar</packaging>
</project>
`

let projectDir: string | undefined
let cleanup: (() => Promise<void>) | undefined

describe('this package own properties outrank caller opts', () => {
  beforeAll(async () => {
    const reason = skipReasonFor('maven')
    if (reason) {
      enforceOrAnnounceSkip(reason)
      return
    }
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'socket-facts-prec-'))
    projectDir = path.join(root, 'project')
    await fs.mkdir(projectDir, { recursive: true })
    await fs.writeFile(path.join(projectDir, 'pom.xml'), POM)
    cleanup = async () => {
      await fs.rm(root, { force: true, recursive: true })
    }
  }, 300_000)

  afterAll(async () => {
    await cleanup?.()
  })

  it('keeps the extension loaded when a caller aliases maven.ext.class.path', async () => {
    if (!projectDir) {
      return
    }
    const result = await runFactsGeneration({
      bin: findBuildToolBin('maven')!,
      cwd: projectDir,
      env: compatEnv(),
      // `--define` is `-D`. A collision check keyed on `-D` never sees it.
      opts: ['--define', 'maven.ext.class.path=/nonexistent-socket-facts.jar'],
      tool: 'maven',
    })

    expect(result.code).toBe(0)
    // An unloaded extension emits no records at all, so a populated project
    // list is the proof that ours won.
    expect(result.facts.projects?.length ?? 0).toBeGreaterThan(0)
    expect(result.facts.projects?.[0]?.name).toBe('precedence')
  }, 300_000)
})
