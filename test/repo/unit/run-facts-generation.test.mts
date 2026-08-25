// The generation API validates the invocation before it spawns anything, so
// an under-specified call never reaches a build tool.
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { emitterProps } from '../../../src/run/invoke-build-tool.mts'
import { runFactsGeneration } from '../../../src/run/run-facts-generation.mts'

import type { FactsInvocation } from '../../../src/run/invocation.mts'

function invocation(overrides: Partial<FactsInvocation> = {}): FactsInvocation {
  return {
    bin: path.resolve('/opt/gradle/bin/gradle'),
    cwd: path.resolve('/repo'),
    env: {},
    opts: [],
    tool: 'gradle',
    ...overrides,
  }
}

describe('runFactsGeneration', () => {
  it('validates before it spawns anything', async () => {
    await expect(
      runFactsGeneration(invocation({ bin: 'gradle' })),
    ).rejects.toThrow(/under-specified/)
  })
})

// The emitters Pattern.compile() what they receive, so what crosses this
// boundary must already be an anchored regex source. A raw glob reaching an
// emitter silently matches nothing.
describe('emitterProps excludePaths', () => {
  it('emits compiled anchored pattern sources, not the raw globs', () => {
    const props = emitterProps(
      { ...invocation(), excludePaths: ['legacy', 'src/**/generated'] },
      '-P',
    )

    expect(props).toContain(
      '-Psocket.excludePaths=^(?:legacy)(?:/.*)?$,^(?:src/(?:[^/]+/)*generated)(?:/.*)?$',
    )
  })

  it('omits the property when there are no exclude paths', () => {
    expect(emitterProps(invocation(), '-P')).not.toContainEqual(
      expect.stringContaining('socket.excludePaths'),
    )
    expect(
      emitterProps({ ...invocation(), excludePaths: [] }, '-P'),
    ).not.toContainEqual(expect.stringContaining('socket.excludePaths'))
  })
})
