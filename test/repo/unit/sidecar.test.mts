import { describe, expect, it } from 'vitest'

import { assembleFacts } from '../../../src/pipeline/assemble.mts'
import { parseRecords } from '../../../src/pipeline/records.mts'
import {
  accumulateSidecar,
  createSidecarAccumulator,
  serializeSidecar,
} from '../../../src/pipeline/sidecar.mts'

import type { SocketFactsSbom } from '../../../src/contract/sbom.mts'
import type { ResolvedArtifactPaths } from '../../../src/contract/sidecar.mts'
import type { SidecarAccumulator } from '../../../src/pipeline/sidecar.mts'

function emptyArtifactPaths(): ResolvedArtifactPaths {
  return {
    targetsByCoord: new Map(),
    targetsByGav: new Map(),
    sourcesByCoord: new Map(),
    coords: new Set(),
  }
}

function mkRootFixture(target: string): {
  facts: SocketFactsSbom
  paths: ResolvedArtifactPaths
} {
  const paths = emptyArtifactPaths()
  paths.targetsByCoord.set('g:a:jar:1', [target])
  return {
    facts: {
      components: [
        {
          type: 'maven',
          namespace: 'g',
          name: 'a',
          version: '1',
          qualifiers: { ext: 'jar' },
          id: 'g:a:jar:1',
        },
      ],
    },
    paths,
  }
}

describe('compute-artifacts sidecar', () => {
  it('emits the frozen ResolvedComponent[] contract', () => {
    const facts: SocketFactsSbom = {
      components: [
        {
          type: 'maven',
          namespace: 'com.example',
          name: 'lib',
          version: 'da517db',
          qualifiers: { ext: 'jar' },
          id: 'com.example:lib:jar:da517db',
        },
      ],
    }
    const artifactPaths = emptyArtifactPaths()
    artifactPaths.targetsByCoord.set('com.example:lib:jar:da517db', [
      '/abs/lib.jar',
    ])
    artifactPaths.sourcesByCoord.set('com.example:lib:jar:da517db', [
      '/abs/lib/src/main/java',
    ])

    const acc: SidecarAccumulator = new Map()
    accumulateSidecar(acc, facts, artifactPaths)
    const resolved = serializeSidecar(acc)

    expect(resolved).toEqual([
      {
        group: 'com.example',
        name: 'lib',
        version: 'da517db',
        ext: 'jar',
        classifier: null,
        ecosystem: 'maven',
        targets: ['/abs/lib.jar'],
        sources: ['/abs/lib/src/main/java'],
      },
    ])
  })

  it('emits empty target/source arrays for a resolved-but-artifactless coord (pom/BOM)', () => {
    const facts: SocketFactsSbom = {
      components: [
        {
          type: 'maven',
          namespace: 'com.example',
          name: 'bom',
          version: '1.0',
          qualifiers: { ext: 'pom' },
          id: 'com.example:bom:pom:1.0',
        },
      ],
    }
    const acc: SidecarAccumulator = new Map()
    accumulateSidecar(acc, facts, emptyArtifactPaths())
    const resolved = serializeSidecar(acc)

    expect(resolved).toHaveLength(1)
    expect(resolved[0]!.targets).toEqual([])
    expect(resolved[0]!.sources).toEqual([])
  })

  it('preserves a classifier qualifier and defaults it to null when absent', () => {
    const facts: SocketFactsSbom = {
      components: [
        {
          type: 'maven',
          namespace: 'g',
          name: 'a',
          version: '1',
          qualifiers: { ext: 'jar', classifier: 'sources' },
          id: 'g:a:jar:sources:1',
        },
      ],
    }
    const acc: SidecarAccumulator = new Map()
    accumulateSidecar(acc, facts, emptyArtifactPaths())
    expect(serializeSidecar(acc)[0]!.classifier).toBe('sources')
  })

  it('carries a first-party module (project, not a component) source/target roots', () => {
    const facts: SocketFactsSbom = {
      // The app module is a project but nothing depends on it, so it is absent
      // from components — its source roots must still reach the sidecar.
      components: [],
      projects: [
        {
          type: 'maven',
          namespace: 'com.example',
          name: 'app',
          version: '1.0',
          subprojectDir: 'app',
          dependencies: [],
          resolvedAs: [],
        },
      ],
    }
    const artifactPaths = emptyArtifactPaths()
    artifactPaths.sourcesByCoord.set('com.example:app:1.0', [
      '/abs/app/src/main/java',
    ])
    artifactPaths.targetsByCoord.set('com.example:app:1.0', [
      '/abs/app/build/classes',
    ])

    const acc: SidecarAccumulator = new Map()
    accumulateSidecar(acc, facts, artifactPaths)
    const resolved = serializeSidecar(acc)

    expect(resolved).toEqual([
      {
        group: 'com.example',
        name: 'app',
        version: '1.0',
        ext: '',
        classifier: null,
        ecosystem: 'maven',
        targets: ['/abs/app/build/classes'],
        sources: ['/abs/app/src/main/java'],
      },
    ])
  })

  it('merges the same coordinate across build roots, unioning paths', () => {
    const acc: SidecarAccumulator = new Map()
    const a = mkRootFixture('/root-a/a.jar')
    const b = mkRootFixture('/root-b/a.jar')
    accumulateSidecar(acc, a.facts, a.paths)
    accumulateSidecar(acc, b.facts, b.paths)
    const resolved = serializeSidecar(acc)

    expect(resolved).toHaveLength(1)
    expect(resolved[0]!.targets).toEqual(['/root-a/a.jar', '/root-b/a.jar'])
  })
})

// The dotnet emitter's records for one project that resolved two target
// frameworks. NuGet coordinates are groupless, so the `group` field is empty
// throughout — that is what makes the namespace and accumulator-key handling
// load-bearing rather than cosmetic.
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

describe('sidecar ecosystem tagging', () => {
  it('keeps a nuget coordinate separate from a maven one of the same name', () => {
    const acc = createSidecarAccumulator()
    const dotnet = assembleFacts(parseRecords(DOTNET_RECORDS), {
      fileExists: () => true,
    })
    accumulateSidecar(acc, dotnet.facts, dotnet.artifactPaths)

    // A groupless NuGet id and a Maven artifactId can produce the same
    // coordinate key; only the ecosystem tag keeps them apart.
    const maven = assembleFacts(
      parseRecords(
        [
          'meta\tmaven\t3.9.6\t17',
          'root\tr1\t:app\tcompile\t1',
          'node\tr1\tNewtonsoft.Json:13.0.3\t\tNewtonsoft.Json\t13.0.3\t\t\t1',
        ].join('\n'),
      ),
      { fileExists: () => true },
    )
    accumulateSidecar(acc, maven.facts, maven.artifactPaths)

    const ecosystems = serializeSidecar(acc)
      .filter(e => e.name === 'Newtonsoft.Json')
      .map(e => e.ecosystem)
      .toSorted()
    expect(ecosystems).toStrictEqual(['maven', 'nuget'])
  })
})
