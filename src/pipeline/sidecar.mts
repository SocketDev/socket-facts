import { mavenCoordinateKey } from '../contract/coordinate.mts'

import type { AnyPURL, SocketFactsSbom } from '../contract/sbom.mts'
import type {
  ResolvedArtifactPaths,
  ResolvedPathsSidecar,
  SidecarComponentEntry,
  SidecarProjectEntry,
} from '../contract/sidecar.mts'

// Emit an entry for every SBOM component AND every first-party project: a
// top-level module is a project, not a dependency component, yet its source
// roots are where reachability starts, so the sidecar must carry them.
// A second call for the same factsFile (a dual-marker directory where two
// build tools both target it) overwrites rather than merges, matching the
// existing last-writer-wins convention for that case.
export function accumulateSidecar(
  acc: SidecarAccumulator,
  facts: SocketFactsSbom,
  artifactPaths: ResolvedArtifactPaths,
  factsFile: string,
): void {
  acc.set(factsFile, {
    components: facts.components.map(comp =>
      attachResolvedPaths(comp, artifactPaths),
    ),
    projects: (facts.projects ?? []).map(proj =>
      attachResolvedPaths(proj, artifactPaths),
    ),
  })
}

// Both fields omitted means resolution could not even be attempted — the only
// case is a degenerate entry with no computable coordinate at all, since every
// entry reaching here already came from a resolved graph node (an unresolved
// dependency lives in the resolution report, not here).
export function attachResolvedPaths<T extends AnyPURL>(
  entry: T,
  artifactPaths: ResolvedArtifactPaths,
): T & { targets?: string[] | undefined; sources?: string[] | undefined } {
  const coordKey = mavenCoordinateKey({
    groupId: entry.namespace,
    artifactId: entry.name,
    type: entry.qualifiers?.['ext'],
    classifier: entry.qualifiers?.['classifier'],
    version: entry.version,
  })
  if (!coordKey) {
    return { ...entry }
  }
  return {
    ...entry,
    targets: (artifactPaths.targetsByCoord.get(coordKey) ?? []).toSorted(),
    sources: (artifactPaths.sourcesByCoord.get(coordKey) ?? []).toSorted(),
  }
}

export function createSidecarAccumulator(): SidecarAccumulator {
  return new Map()
}

export function hasResolvedPathsSidecarEntries(
  sidecar: ResolvedPathsSidecar,
): boolean {
  return Object.keys(sidecar).length > 0
}

export function hasSidecarEntries(acc: SidecarAccumulator): boolean {
  return acc.size > 0
}

// Combines two already-serialized sidecars (e.g. the recursive-discovery path
// and the plain auto-manifest path). Keys are already scoped to one facts file
// each and cannot collide between the two inputs in practice, so this is a
// plain merge; the later input wins on a genuine key collision.
export function mergeResolvedPathsSidecars(
  a: ResolvedPathsSidecar,
  b: ResolvedPathsSidecar,
): ResolvedPathsSidecar {
  const merged: ResolvedPathsSidecar = Object.create(null)
  return Object.assign(merged, a, b)
}

export function purlSortKey(entry: AnyPURL): string {
  return `${entry.type}:${entry.namespace ?? ''}:${entry.name}:${entry.version ?? ''}:${entry.qualifiers?.['ext'] ?? ''}:${entry.qualifiers?.['classifier'] ?? ''}`
}

// Keyed by the absolute facts-file path each bucket describes.
export type SidecarAccumulator = Map<
  string,
  { projects: SidecarProjectEntry[]; components: SidecarComponentEntry[] }
>

export function serializeSidecar(
  acc: SidecarAccumulator,
): ResolvedPathsSidecar {
  // Null-prototype so a facts-file path like "__proto__" cannot reach
  // Object.prototype; typed on the declaration rather than asserted.
  const result: ResolvedPathsSidecar = Object.create(null)
  const factsFiles = [...acc.keys()].toSorted()
  for (let i = 0, { length } = factsFiles; i < length; i += 1) {
    const factsFile = factsFiles[i]!
    const bucket = acc.get(factsFile)!
    result[factsFile] = {
      projects: sortEntriesByPurl(bucket.projects),
      components: sortEntriesByPurl(bucket.components),
    }
  }
  return result
}

export function sortEntriesByPurl<T extends AnyPURL>(entries: T[]): T[] {
  return entries.toSorted((a, b) => {
    const ka = purlSortKey(a)
    const kb = purlSortKey(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}
