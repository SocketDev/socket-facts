// socket-lint: mirror-exempt — asserts a buildArtifactPaths behaviour that only
// manifests through the real records → assemble → sidecar path, so it drives
// three modules to reach one decision in artifact-paths.mts.
// A coordinate can be BOTH a resolved dependency node and a first-party
// project: a module that publishes under the same GAV it builds. Which paths
// win decides what per-subproject reachability analyses, and the two answers
// are indistinguishable in aggregate output — so it is pinned here.
import { describe, expect, it } from 'vitest'

import { assembleFacts } from '../../../src/pipeline/assemble.mts'
import { parseRecords } from '../../../src/pipeline/records.mts'
import {
  accumulateSidecar,
  createSidecarAccumulator,
  serializeSidecar,
} from '../../../src/pipeline/sidecar.mts'

// `:app` is a first-party module with its own output dir, AND appears as a
// resolved node whose artifact is a published jar of that same module.
const SELF_PUBLISHING_RECORDS = [
  'meta\tgradle\t8.0\t17',
  'project\t:app\tcom.example\tapp\t1.0\t/abs/app',
  'projectSrc\t:app\t/abs/app/src/main/java',
  'projectTgt\t:app\t/abs/app/build/classes',
  'root\tr1\t:app\truntimeClasspath\t1',
  'node\tr1\tcom.example:app:jar:1.0\tcom.example\tapp\t1.0\tjar\t\t1',
  'file\tr1\tcom.example:app:jar:1.0\t/abs/published/app.jar',
  'scanned\truntimeClasspath',
].join('\n')

const FACTS_FILE = '/abs/.socket.facts.json'

describe('buildArtifactPaths for a self-publishing module', () => {
  it('reports the project output roots, not the published jar', () => {
    const { artifactPaths, facts } = assembleFacts(
      parseRecords(SELF_PUBLISHING_RECORDS),
      { fileExists: () => true },
    )
    const acc = createSidecarAccumulator()
    accumulateSidecar(acc, facts, artifactPaths, FACTS_FILE)
    const bucket = serializeSidecar(acc)[FACTS_FILE]!

    // Adding the jar alongside the classes would show the analyser two copies
    // of the same classes.
    expect(bucket.projects[0]!.targets).toEqual(['/abs/app/build/classes'])
    expect(bucket.projects[0]!.targets).not.toContain('/abs/published/app.jar')
    for (const component of bucket.components) {
      expect(component.targets).not.toContain('/abs/published/app.jar')
    }
  })

  it('still reports source roots for that module', () => {
    const { artifactPaths, facts } = assembleFacts(
      parseRecords(SELF_PUBLISHING_RECORDS),
      { fileExists: () => true },
    )
    const acc = createSidecarAccumulator()
    accumulateSidecar(acc, facts, artifactPaths, FACTS_FILE)

    expect(serializeSidecar(acc)[FACTS_FILE]!.projects[0]!.sources).toEqual([
      '/abs/app/src/main/java',
    ])
  })
})
