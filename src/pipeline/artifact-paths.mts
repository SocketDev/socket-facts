import { mavenCoordinateKey } from '../contract/coordinate.mts'

import type { ResolvedArtifactPaths } from '../contract/sidecar.mts'
import type { MergedNode } from './assemble.mts'
import type { RawProject } from './records.mts'

// The `withFiles` half of assembly: which on-disk artifacts each resolved
// coordinate maps to. Kept apart from the SBOM assembly because it answers a
// different question — the SBOM says what resolved, this says where it landed —
// and only a reachability run asks the second one.

export function buildArtifactPaths(
  finalNodes: Map<string, MergedNode>,
  projects: RawProject[],
  fileExists: (path: string) => boolean,
): ResolvedArtifactPaths {
  const projectsByGav = new Map<
    string,
    { sources: string[]; targets: string[] }
  >()
  for (let i = 0, { length } = projects; i < length; i += 1) {
    const p = projects[i]!
    projectsByGav.set(gav(p.group, p.name, p.version), {
      sources: p.sources,
      targets: p.targets,
    })
  }
  const targetsByCoord = new Map<string, string[]>()
  const targetsByGav = new Map<string, string[]>()
  const sourcesByCoord = new Map<string, string[]>()
  const coords = new Set<string>()
  for (const fn of finalNodes.values()) {
    const c = fn.coord
    const coordKey = mavenCoordinateKey({
      groupId: c.group,
      artifactId: c.name,
      type: c.ext,
      classifier: c.classifier,
      version: c.version,
    })
    if (!coordKey) {
      continue
    }
    coords.add(coordKey)
    const pi = projectsByGav.get(gav(c.group, c.name, c.version ?? ''))
    const sources = (pi?.sources ?? []).filter(fileExists).toSorted()
    // A coordinate that is BOTH a resolved node and a first-party project
    // reports the project's own output roots, NOT its published jar: per
    // subproject reachability reads the module being analysed, and adding the
    // jar would show the analyser a second copy of the same classes.
    const targets = [...new Set(pi ? pi.targets : fn.targets)]
      .filter(fileExists)
      .toSorted()
    if (sources.length) {
      sourcesByCoord.set(coordKey, sources)
    }
    if (!targets.length) {
      continue
    }
    targetsByCoord.set(coordKey, targets)
    const gavKey = mavenCoordinateKey({
      groupId: c.group,
      artifactId: c.name,
      version: c.version,
    })
    if (gavKey) {
      const acc = targetsByGav.get(gavKey)
      if (acc) {
        for (let i = 0, { length } = targets; i < length; i += 1) {
          const f = targets[i]!
          if (!acc.includes(f)) {
            acc.push(f)
          }
        }
      } else {
        targetsByGav.set(gavKey, [...targets])
      }
    }
  }
  // A top-level module is a `project` but usually not a dependency node, so its
  // source roots (where reachability starts) are missed by the node loop above;
  // emit first-party module paths here.
  for (let i = 0, { length } = projects; i < length; i += 1) {
    const p = projects[i]!
    const coordKey = mavenCoordinateKey({
      groupId: p.group,
      artifactId: p.name,
      version: p.version,
    })
    if (!coordKey) {
      continue
    }
    coords.add(coordKey)
    unionInto(sourcesByCoord, coordKey, p.sources.filter(fileExists))
    const targets = p.targets.filter(fileExists)
    unionInto(targetsByCoord, coordKey, targets)
    unionInto(targetsByGav, coordKey, targets)
  }
  return { targetsByCoord, targetsByGav, sourcesByCoord, coords }
}

export function gav(group: string, name: string, version: string): string {
  return `${group}:${name}:${version}`
}

export function unionInto(
  map: Map<string, string[]>,
  key: string,
  add: string[],
): void {
  if (!add.length) {
    return
  }
  const acc = map.get(key)
  if (acc) {
    for (let i = 0, { length } = add; i < length; i += 1) {
      const f = add[i]!
      if (!acc.includes(f)) {
        acc.push(f)
      }
    }
  } else {
    map.set(key, [...add])
  }
}
