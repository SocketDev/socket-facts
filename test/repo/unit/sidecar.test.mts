/*
 * @file The wire format itself, and the maven paths through it, are covered
 *   verbatim by socket-cli's own suite in parity/sidecar.test.mts. What lives
 *   here is what only this package owns: the dotnet emitter's records reaching
 *   the sidecar with a nuget purl type.
 */
import { describe, expect, it } from 'vitest'

import { assembleFacts } from '../../../src/pipeline/assemble.mts'
import { parseRecords } from '../../../src/pipeline/records.mts'
import {
  accumulateSidecar,
  createSidecarAccumulator,
  serializeSidecar,
} from '../../../src/pipeline/sidecar.mts'

// The dotnet emitter's records for one project that resolved two target
// frameworks. NuGet coordinates are groupless, so the namespace is empty
// throughout — that is what makes the purl type load-bearing rather than
// decoration.
const DOTNET_RECORDS = [
  'meta\tdotnet\t8.0.404\t',
  'project\t/repo/App/App.csproj\t\tApp\t1.0.0\tApp',
  'projectSrc\t/repo/App/App.csproj\t/repo/App',
  'projectTgt\t/repo/App/App.csproj\t/repo/App/bin/App.dll',
  'root\tr-net8\t/repo/App/App.csproj\tnet8.0\t1',
  'node\tr-net8\tNewtonsoft.Json:13.0.3\t\tNewtonsoft.Json\t13.0.3\t\t\t1',
  'file\tr-net8\tNewtonsoft.Json:13.0.3\t/cache/newtonsoft.json/13.0.3/lib/net6.0/Newtonsoft.Json.dll',
  'root\tr-net6\t/repo/App/App.csproj\tnet6.0\t1',
  'node\tr-net6\tNewtonsoft.Json:13.0.3\t\tNewtonsoft.Json\t13.0.3\t\t\t1',
  'scanned\tnet8.0',
  'scanned\tnet6.0',
].join('\n')

// A Maven build whose artifactId collides with the NuGet id above.
const MAVEN_RECORDS = [
  'meta\tmaven\t3.9.6\t17',
  'root\tr1\t:app\tcompile\t1',
  'node\tr1\tNewtonsoft.Json:13.0.3\t\tNewtonsoft.Json\t13.0.3\t\t\t1',
].join('\n')

const DOTNET_FACTS_FILE = '/repo/App/.socket.facts.json'

const MAVEN_FACTS_FILE = '/repo/.socket.facts.json'

describe('sidecar purl types across ecosystems', () => {
  it('keeps a nuget coordinate separate from a maven one of the same name', () => {
    const acc = createSidecarAccumulator()
    const dotnet = assembleFacts(parseRecords(DOTNET_RECORDS), {
      fileExists: () => true,
    })
    accumulateSidecar(
      acc,
      dotnet.facts,
      dotnet.artifactPaths,
      DOTNET_FACTS_FILE,
    )
    const maven = assembleFacts(parseRecords(MAVEN_RECORDS), {
      fileExists: () => true,
    })
    accumulateSidecar(acc, maven.facts, maven.artifactPaths, MAVEN_FACTS_FILE)
    const resolved = serializeSidecar(acc)

    // Two guarantees, not one: the facts-file key scopes each reactor's
    // entries, and the purl type discriminates within a bucket.
    const dotnetEntry = resolved[DOTNET_FACTS_FILE]!.components.find(
      c => c.name === 'Newtonsoft.Json',
    )
    const mavenEntry = resolved[MAVEN_FACTS_FILE]!.components.find(
      c => c.name === 'Newtonsoft.Json',
    )

    expect(dotnetEntry?.type).toBe('nuget')
    expect(mavenEntry?.type).toBe('maven')
  })

  it('carries the dotnet runtime assembly onto the nuget component', () => {
    const acc = createSidecarAccumulator()
    const dotnet = assembleFacts(parseRecords(DOTNET_RECORDS), {
      fileExists: () => true,
    })
    accumulateSidecar(
      acc,
      dotnet.facts,
      dotnet.artifactPaths,
      DOTNET_FACTS_FILE,
    )

    const entry = serializeSidecar(acc)[DOTNET_FACTS_FILE]!.components.find(
      c => c.name === 'Newtonsoft.Json',
    )
    expect(entry?.targets).toEqual([
      '/cache/newtonsoft.json/13.0.3/lib/net6.0/Newtonsoft.Json.dll',
    ])
  })

  it('carries the first-party dotnet project source and output roots', () => {
    const acc = createSidecarAccumulator()
    const dotnet = assembleFacts(parseRecords(DOTNET_RECORDS), {
      fileExists: () => true,
    })
    accumulateSidecar(
      acc,
      dotnet.facts,
      dotnet.artifactPaths,
      DOTNET_FACTS_FILE,
    )

    const project = serializeSidecar(acc)[DOTNET_FACTS_FILE]!.projects[0]!
    expect(project.type).toBe('nuget')
    expect(project.sources).toEqual(['/repo/App'])
    expect(project.targets).toEqual(['/repo/App/bin/App.dll'])
  })
})
