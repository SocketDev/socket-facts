import path from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  compatEnv,
  emitterAssetSkipReason,
  enforceOrAnnounceSkip,
  findBuildToolBin,
  REQUIRE_COMPAT_ENV_VAR,
  skipReasonFor,
} from './lib/toolchain.mts'

// A conformance suite that skips quietly reports green on a machine where it
// never ran, which is the exact failure mode the dynamic-version fixture exists
// to prevent. These tests hold the skip path to the same standard as the
// assertions it guards.

const MISSING_GRADLE = '/socket-facts/definitely/not/a/gradle'

const MISSING_ASSET = '/socket-facts/definitely/not/an/emitter-asset'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('findBuildToolBin', () => {
  it('uses the dotnet binary override', () => {
    vi.stubEnv('SOCKET_FACTS_DOTNET_BIN', process.execPath)
    vi.stubEnv('PATH', '')
    expect(findBuildToolBin('dotnet')).toBe(process.execPath)
  })

  it('ignores an override that points at nothing', () => {
    vi.stubEnv('SOCKET_FACTS_GRADLE_BIN', MISSING_GRADLE)
    expect(findBuildToolBin('gradle')).toBeUndefined()
  })

  it('returns an absolute path, which the generation API requires', () => {
    const bin = findBuildToolBin('gradle')
    if (bin) {
      expect(path.isAbsolute(bin)).toBe(true)
    }
  })
})

describe('skipReasonFor', () => {
  it('explains what is missing, what was wanted, and how to fix it', () => {
    vi.stubEnv('PATH', '')
    const reason = skipReasonFor('gradle')
    expect(reason).toBeDefined()
    expect(reason).toContain('Where:')
    expect(reason).toContain('Saw no executable, wanted')
    expect(reason).toContain('Fix: install gradle')
    expect(reason).toContain(REQUIRE_COMPAT_ENV_VAR)
  })

  it('passes both preconditions on a checkout that has the tool and the asset', () => {
    vi.stubEnv('SOCKET_FACTS_MAVEN_BIN', '')
    vi.stubEnv('PATH', '')
    expect(skipReasonFor('maven')).toContain('No mvn on PATH')
  })
})

// The Maven emitter is a jar a JDK has to build, and `pnpm run build` does not
// build it. Without this second precondition the suite finds `mvn`, starts the
// run, and dies inside beforeAll on the missing jar — a hard failure where a
// loud skip is the honest answer.
describe('emitterAssetSkipReason', () => {
  it('says which asset is missing and how to produce it', () => {
    const reason = emitterAssetSkipReason('maven', MISSING_ASSET)
    expect(reason).toBeDefined()
    expect(reason).toContain('No maven emitter asset')
    expect(reason).toContain(MISSING_ASSET)
    expect(reason).toContain('Fix: run `pnpm run build:maven-extension`')
    expect(reason).toContain(REQUIRE_COMPAT_ENV_VAR)
  })

  it('points a broken checkout at the committed source, not at a build', () => {
    const reason = emitterAssetSkipReason('gradle', MISSING_ASSET)
    expect(reason).toContain('Fix: restore the committed emitter source')
  })

  it('is silent when the asset is there', () => {
    expect(emitterAssetSkipReason('gradle', process.execPath)).toBeUndefined()
  })
})

describe('enforceOrAnnounceSkip', () => {
  it('warns loudly when the toolchain is merely absent', () => {
    vi.stubEnv(REQUIRE_COMPAT_ENV_VAR, '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    enforceOrAnnounceSkip('no gradle here')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('SKIPPED CONFORMANCE RUN')
  })

  it('fails instead of skipping where the matrix is required', () => {
    vi.stubEnv(REQUIRE_COMPAT_ENV_VAR, '1')
    expect(() => enforceOrAnnounceSkip('no gradle here')).toThrow(
      'no gradle here',
    )
  })
})

describe('compatEnv', () => {
  it('carries PATH so the build tool can find its own helpers', () => {
    expect(compatEnv()['PATH']).toBe(process.env['PATH'] ?? '')
  })

  it('carries nothing the fixture did not ask for', () => {
    vi.stubEnv('GRADLE_OPTS', '-Dinjected=true')
    expect(compatEnv()['GRADLE_OPTS']).toBeUndefined()
  })
})
