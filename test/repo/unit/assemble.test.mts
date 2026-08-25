import { describe, expect, it } from 'vitest'

import { assembleFacts } from '../../../src/pipeline/assemble.mts'
import { parseRecords } from '../../../src/pipeline/records.mts'
import {
  accumulateSidecar,
  serializeSidecar,
} from '../../../src/pipeline/sidecar.mts'

import type { SidecarAccumulator } from '../../../src/pipeline/sidecar.mts'

// Minimal line-protocol records for a one-module Gradle build (--with-files):
// - first-party module `:app` (a project, NOT a dependency node) with source +
//   output roots,
// - an external dep `lib` resolved to a jar,
// - a `bom` resolved as a constraints-only artifact (no file).
const RECORDS = [
  'meta\tgradle\t8.0\t17',
  'project\t:app\tcom.example\tapp\t1.0\t/abs/app',
  'projectSrc\t:app\t/abs/app/src/main/java',
  'projectTgt\t:app\t/abs/app/build/classes',
  'root\tr1\t:app\truntimeClasspath\t1',
  'node\tr1\tcom.example:lib:jar:1.0\tcom.example\tlib\t1.0\tjar\t\t1',
  'node\tr1\tcom.example:bom:2.0\tcom.example\tbom\t2.0\t\t\t1',
  'file\tr1\tcom.example:lib:jar:1.0\t/abs/lib.jar',
  'scanned\truntimeClasspath',
].join('\n')

const FACTS_FILE = '/abs/.socket.facts.json'

describe('records → assemble → sidecar', () => {
  it('carries first-party project paths, external jars, and artifactless BOMs', () => {
    // Inject fileExists so the synthetic absolute paths aren't filtered out.
    const { artifactPaths, facts } = assembleFacts(parseRecords(RECORDS), {
      fileExists: () => true,
    })

    expect(facts.metadata?.tool).toBe('gradle')
    expect(facts.metadata?.javaVersion).toBe('17')
    // contentHash/schemaVersion are intentionally absent from metadata.
    expect(facts.metadata).not.toHaveProperty('contentHash')
    expect(facts.metadata).not.toHaveProperty('schemaVersion')

    const acc: SidecarAccumulator = new Map()
    accumulateSidecar(acc, facts, artifactPaths, FACTS_FILE)
    const bucket = serializeSidecar(acc)[FACTS_FILE]!
    const componentsByName = new Map(bucket.components.map(c => [c.name, c]))

    // First-party module: a project (not a node), yet its source/output roots
    // reach the sidecar.
    expect(bucket.projects).toEqual([
      {
        type: 'maven',
        namespace: 'com.example',
        name: 'app',
        version: '1.0',
        subprojectDir: '/abs/app',
        dependencies: ['com.example:bom:2.0', 'com.example:lib:jar:1.0'],
        resolvedAs: [],
        targets: ['/abs/app/build/classes'],
        sources: ['/abs/app/src/main/java'],
      },
    ])

    // External dependency: jar target, no sources.
    expect(componentsByName.get('lib')?.targets).toEqual(['/abs/lib.jar'])
    expect(componentsByName.get('lib')?.sources).toEqual([])

    // Artifactless BOM: present with empty arrays (resolved, no artifact).
    expect(componentsByName.get('bom')).toMatchObject({
      targets: [],
      sources: [],
    })
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

describe('dotnet records → assemble', () => {
  it('types components as nuget and omits the empty namespace', () => {
    const { facts } = assembleFacts(parseRecords(DOTNET_RECORDS), {
      fileExists: () => true,
    })

    expect(facts.metadata?.tool).toBe('dotnet')
    const component = facts.components[0]!
    expect(component.type).toBe('nuget')
    expect(component.name).toBe('Newtonsoft.Json')
    // A groupless ecosystem drops the key rather than serializing "".
    expect(component).not.toHaveProperty('namespace')
    expect(facts.projects?.[0]).not.toHaveProperty('namespace')
  })

  it('keeps a maven build emitting an explicit empty namespace', () => {
    const records = [
      'meta\tgradle\t8.0\t17',
      'root\tr1\t:app\truntimeClasspath\t1',
      'node\tr1\tlib:jar:1.0\t\tlib\t1.0\tjar\t\t1',
    ].join('\n')
    const { facts } = assembleFacts(parseRecords(records), {
      fileExists: () => true,
    })

    expect(facts.components[0]).toHaveProperty('namespace', '')
  })

  it('attributes target frameworks to the project that resolved them', () => {
    const { report } = assembleFacts(parseRecords(DOTNET_RECORDS), {
      fileExists: () => true,
    })

    expect(report.configsByProject).toStrictEqual([
      { project: 'App', configs: ['net6.0', 'net8.0'] },
    ])
  })

  // A Windows emitter that forgets to force LF would otherwise glue a '\r' to
  // every record's LAST field: prod/direct flags stop parsing as booleans,
  // edge targets match no node, and artifact paths fail their exists-check —
  // all silently, with the scan still reporting success.
  it('parses a CRLF records stream identically to an LF one', () => {
    const lf = assembleFacts(parseRecords(DOTNET_RECORDS), {
      fileExists: () => true,
    })
    const crlf = assembleFacts(
      parseRecords(DOTNET_RECORDS.replaceAll('\n', '\r\n')),
      { fileExists: () => true },
    )

    expect(crlf.facts).toStrictEqual(lf.facts)
    expect(crlf.report).toStrictEqual(lf.report)
    expect(crlf.facts.components[0]?.direct).toBe(true)
  })
})
