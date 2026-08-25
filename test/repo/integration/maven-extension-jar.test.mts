// The facts and workspaces participants ship in ONE jar. If the build ever
// emits them separately, a consumer loading only the facts jar silently loses
// workspace enumeration — and a Maven run with no participant emits an empty
// SBOM, which reads downstream as "no dependencies" rather than as an error.
// So this asserts the packaged bytes, not the source tree.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { mavenExtensionJarPath } from '../../../src/assets.mts'

const PARTICIPANTS = [
  'dev.socket.facts.SocketFactsLifecycleParticipant',
  'dev.socket.facts.SocketWorkspacesLifecycleParticipant',
]

function jarEntry(jarPath: string, entry: string): string {
  return execFileSync('unzip', ['-p', jarPath, entry], { encoding: 'utf8' })
}

function skipReason(): string | undefined {
  if (!existsSync(mavenExtensionJarPath())) {
    return (
      `No maven emitter asset. Where: ${mavenExtensionJarPath()}. ` +
      `Saw no file, wanted the built extension jar. ` +
      `Fix: run \`pnpm run build:maven-extension\` (needs a JDK).`
    )
  }
  return undefined
}

describe('the maven extension jar', () => {
  it('registers both lifecycle participants in its sisu index', () => {
    const reason = skipReason()
    if (reason) {
      // oxlint-disable-next-line socket/no-console-prefer-logger -- a test-runner warning belongs on the runner's own stream, not a product logger.
      console.warn(`SKIPPED JAR CHECK: ${reason}`)
      return
    }
    // Sisu discovers a participant only if it is in this index; a class present
    // in the jar but absent here is never loaded.
    const index = jarEntry(
      mavenExtensionJarPath(),
      'META-INF/sisu/javax.inject.Named',
    )
    for (const participant of PARTICIPANTS) {
      expect(index, `sisu index is missing ${participant}`).toContain(
        participant,
      )
    }
  })

  it('carries both participant classes and the shared support class', () => {
    const reason = skipReason()
    if (reason) {
      // oxlint-disable-next-line socket/no-console-prefer-logger -- a test-runner warning belongs on the runner's own stream, not a product logger.
      console.warn(`SKIPPED JAR CHECK: ${reason}`)
      return
    }
    const listing = execFileSync('unzip', ['-l', mavenExtensionJarPath()], {
      encoding: 'utf8',
    })
    for (const participant of PARTICIPANTS) {
      expect(listing).toContain(`${participant.replaceAll('.', '/')}.class`)
    }
    // One copy of the shared helpers, in the same jar as both participants:
    // two shaded copies on one ext classpath would let load order decide.
    expect(listing).toContain('dev/socket/facts/SocketSupport.class')
  })
})
