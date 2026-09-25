import { mavenCoordinateKey } from '../contract/coordinate.mts'
import { compareStr } from '@socketsecurity/lib-stable/sorts/strings'

import type { SocketFactsSbom } from '../contract/sbom.mts'
import type {
  ResolvedArtifactPaths,
  ResolvedComponent,
  ResolvedPathsSidecar,
} from '../contract/sidecar.mts'

// Emit an entry for every SBOM component AND every first-party project: a
// top-level module is a project, not a dependency component, yet its source
// roots are where reachability starts, so the sidecar must carry them. The
// ecosystem is each artifact's own purl `type`, passed through verbatim.
export function accumulateSidecar(
  acc: SidecarAccumulator,
  facts: SocketFactsSbom,
  artifactPaths: ResolvedArtifactPaths,
): void {
  for (const comp of facts.components) {
    addEntry(
      acc,
      artifactPaths,
      comp.namespace ?? '',
      comp.name,
      comp.version ?? '',
      comp.qualifiers?.['ext'] ?? '',
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- frozen sidecar contract serializes an explicit JSON null
      comp.qualifiers?.['classifier'] ?? null,
      comp.type,
    )
  }
  // First-party modules have no ext/classifier.
  for (const proj of facts.projects ?? []) {
    addEntry(
      acc,
      artifactPaths,
      proj.namespace ?? '',
      proj.name,
      proj.version ?? '',
      '',
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- frozen sidecar contract serializes an explicit JSON null
      null,
      proj.type,
    )
  }
}

export function addEntry(
  acc: SidecarAccumulator,
  artifactPaths: ResolvedArtifactPaths,
  group: string,
  name: string,
  version: string,
  ext: string,
  classifier: string | null,
  ecosystem: string,
): void {
  const coordKey = mavenCoordinateKey({
    groupId: group,
    artifactId: name,
    type: ext || undefined,
    classifier: classifier ?? undefined,
    version: version || undefined,
  })
  if (!coordKey) {
    return
  }
  // Namespaced by ecosystem so a groupless NuGet coordinate can never merge
  // with a Maven one. This key is accumulator-internal; the wire format
  // carries the ecosystem tag on the entry itself.
  const accKey = `${ecosystem}|${coordKey}`
  let entry = acc.get(accKey)
  if (!entry) {
    entry = {
      group,
      name,
      version,
      ext,
      classifier,
      ecosystem,
      targets: [],
      sources: [],
    }
    acc.set(accKey, entry)
  }
  pushUnique(entry.targets, artifactPaths.targetsByCoord.get(coordKey) ?? [])
  pushUnique(entry.sources, artifactPaths.sourcesByCoord.get(coordKey) ?? [])
}

export function createSidecarAccumulator(): SidecarAccumulator {
  return new Map()
}

// Keyed by full coordinate; unions paths so multiple build roots merge into one.
export type SidecarAccumulator = Map<string, ResolvedComponent>

export function pushUnique(into: string[], from: string[]): void {
  for (let i = 0, { length } = from; i < length; i += 1) {
    const f = from[i]!
    if (!into.includes(f)) {
      into.push(f)
    }
  }
}

export function serializeSidecar(
  acc: SidecarAccumulator,
): ResolvedPathsSidecar {
  const resolved = [...acc.values()]
  for (let i = 0, { length } = resolved; i < length; i += 1) {
    const entry = resolved[i]!
    entry.targets.sort()
    entry.sources.sort()
  }
  resolved.sort((a, b) => {
    const ka = `${a.ecosystem ?? ''}:${a.group}:${a.name}:${a.ext}:${a.classifier ?? ''}:${a.version}`
    const kb = `${b.ecosystem ?? ''}:${b.group}:${b.name}:${b.ext}:${b.classifier ?? ''}:${b.version}`
    return compareStr(ka, kb)
  })
  return resolved
}
