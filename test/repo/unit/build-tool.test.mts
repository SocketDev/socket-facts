// Build-tool KNOWLEDGE, exported so a consumer can compute a candidate. None
// of it resolves, probes the filesystem, or decides that a binary is safe.
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  BUILD_TOOLS,
  buildToolWrapperFilename,
  buildToolWrapperPath,
  conventionalBuildToolBin,
  isBuildTool,
} from '../../../src/run/build-tool.mts'

describe('build-tool knowledge', () => {
  it('exposes the conventional binary name without resolving it', () => {
    expect(conventionalBuildToolBin('gradle')).toBe('gradle')
    expect(conventionalBuildToolBin('maven')).toBe('mvn')
    expect(conventionalBuildToolBin('sbt')).toBe('sbt')
  })

  it('names the wrapper only for the tools that have one', () => {
    expect(buildToolWrapperFilename('gradle')).toBe('gradlew')
    expect(buildToolWrapperFilename('maven')).toBe('mvnw')
    expect(buildToolWrapperFilename('sbt')).toBeUndefined()
  })

  // Pure: it reports where a wrapper would live and says nothing about whether
  // one is there or whether running it is acceptable.
  it('builds a wrapper path without touching the filesystem', () => {
    expect(buildToolWrapperPath('gradle', '/repo')).toBe(
      path.resolve('/repo', 'gradlew'),
    )
    expect(buildToolWrapperPath('gradle', '/missing/example-project')).toBe(
      path.resolve('/missing/example-project', 'gradlew'),
    )
    expect(buildToolWrapperPath('sbt', '/repo')).toBeUndefined()
  })

  it('recognizes exactly the supported tools', () => {
    for (const tool of BUILD_TOOLS) {
      expect(isBuildTool(tool)).toBe(true)
    }
    expect(isBuildTool('bazel')).toBe(false)
    expect(isBuildTool(undefined)).toBe(false)
  })
})
