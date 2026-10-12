import { describe, expect, it } from 'vitest'

import {
  manifestFilesCoverEmitterRuntimeAssets,
  readPackageFiles,
} from '../../../../scripts/repo/check/emitter-assets-are-publishable.mts'

const NARROW_EMITTER_PACKAGE_FILES: readonly string[] = [
  'emitters/socket-facts.init.gradle',
  'emitters/socket-facts.plugin.scala',
  'emitters/maven-extension/socket-facts-maven-extension.jar',
  'emitters/dotnet-tool/publish/**/*',
]

const OMITTED_EMITTER_ENTRIES: readonly {
  asset: string
  entry: string
}[] = [
  { asset: 'Gradle', entry: 'emitters/socket-facts.init.gradle' },
  { asset: 'Scala', entry: 'emitters/socket-facts.plugin.scala' },
  {
    asset: 'Maven jar',
    entry: 'emitters/maven-extension/socket-facts-maven-extension.jar',
  },
  {
    asset: '.NET publish directory',
    entry: 'emitters/dotnet-tool/publish/**/*',
  },
]

describe('manifestFilesCoverEmitterRuntimeAssets', () => {
  it('accepts the package manifest', () => {
    expect(manifestFilesCoverEmitterRuntimeAssets(readPackageFiles())).toBe(
      true,
    )
  })

  for (const { asset, entry } of OMITTED_EMITTER_ENTRIES) {
    it(`rejects a manifest without the ${asset} asset`, () => {
      const files = NARROW_EMITTER_PACKAGE_FILES.filter(
        packageEntry => packageEntry !== entry,
      )
      expect(manifestFilesCoverEmitterRuntimeAssets(files)).toBe(false)
    })
  }

  it('accepts a directory entry for the emitter runtime assets', () => {
    expect(manifestFilesCoverEmitterRuntimeAssets(['emitters'])).toBe(true)
  })

  it('accepts a broad emitter glob', () => {
    expect(manifestFilesCoverEmitterRuntimeAssets(['emitters/**/*'])).toBe(true)
  })
})
