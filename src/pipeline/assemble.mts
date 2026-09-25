import crypto from 'node:crypto'
import { existsSync } from 'node:fs'
import { compareStr } from '@socketsecurity/lib-stable/sorts/strings'

import { isBuildTool } from '../run/build-tool.mts'
import { buildArtifactPaths, gav } from './artifact-paths.mts'

import type {
  SocketFactsSbom,
  SocketFactsSbomComponent,
  SocketFactsSbomMetadata,
  SocketFactsSbomProject,
  SocketFactsTool,
} from '../contract/sbom.mts'
import type { ResolvedArtifactPaths } from '../contract/sidecar.mts'
import type { ResolutionReport } from '../report/report-types.mts'
import type { ParsedRecords, RawCoord } from './records.mts'

const PURL_TYPE_MAVEN = 'maven'

const PURL_TYPE_NUGET = 'nuget'

// Exhaustive, not a "dotnet or else maven" ternary: adding a fifth tool to
// SocketFactsTool then fails to type-check here until someone names its purl
// type, instead of silently assembling maven-typed components for it.
const PURL_TYPE_BY_TOOL: Readonly<Record<SocketFactsTool, string>> =
  Object.freeze({
    dotnet: PURL_TYPE_NUGET,
    gradle: PURL_TYPE_MAVEN,
    maven: PURL_TYPE_MAVEN,
    sbt: PURL_TYPE_MAVEN,
  })

export type AssembleResult = {
  facts: SocketFactsSbom
  report: ResolutionReport
  artifactPaths: ResolvedArtifactPaths
}

export type AssembleOptions = {
  emitProjects?: boolean | undefined
  // Injectable for tests; an uncompiled module's output dir is dropped (module
  // stays resolvable via its sources).
  fileExists?: ((path: string) => boolean) | undefined
}

export type MergedNode = {
  coord: RawCoord
  children: Set<string>
  prod: boolean
  direct: boolean
  targets: Set<string>
}

export type PerRoot = {
  projectKey: string
  prod: boolean
  nodes: Map<
    string,
    { coord: RawCoord; children: string[]; direct: boolean; targets: string[] }
  >
}

export function assembleFacts(
  parsed: ParsedRecords,
  opts: AssembleOptions = {},
): AssembleResult {
  const fileExists = opts.fileExists ?? existsSync
  const perRoot = buildPerRoot(parsed)
  const { directByRoot, finalNodes } = mergePathSensitive(perRoot)

  const tool = isBuildTool(parsed.tool) ? parsed.tool : 'gradle'
  const purlType = purlTypeForTool(tool)
  const components = buildComponents(finalNodes, purlType)
  const projects =
    opts.emitProjects === false
      ? []
      : buildProjects(parsed, finalNodes, directByRoot, perRoot, purlType)

  const metadata: SocketFactsSbomMetadata = {
    format: 'socket-facts-sbom',
    tool,
    toolVersion: parsed.toolVersion,
    ...(parsed.javaVersion ? { javaVersion: parsed.javaVersion } : {}),
  }

  const facts: SocketFactsSbom = projects.length
    ? { metadata, projects, components }
    : { metadata, components }

  return {
    facts,
    report: buildReport(parsed),
    artifactPaths: buildArtifactPaths(
      finalNodes,
      [...parsed.projects.values()],
      fileExists,
    ),
  }
}

export function buildComponents(
  finalNodes: Map<string, MergedNode>,
  purlType: string,
): SocketFactsSbomComponent[] {
  return [...finalNodes.keys()].toSorted().map(id => {
    const fn = finalNodes.get(id)!
    const c = fn.coord
    const qualifiers: Record<string, string> = Object.create(null)
    if (c.classifier) {
      qualifiers['classifier'] = c.classifier
    }
    if (c.ext) {
      qualifiers['ext'] = c.ext
    }
    const comp: SocketFactsSbomComponent = {
      type: purlType,
      ...namespaceEntry(purlType, c.group),
      name: c.name,
      ...(c.version ? { version: c.version } : {}),
      ...(Object.keys(qualifiers).length ? { qualifiers } : {}),
      id,
    }
    if (fn.direct) {
      comp.direct = true
    }
    if (!fn.prod) {
      comp.dev = true
    }
    if (fn.children.size) {
      comp.dependencies = [...fn.children].toSorted()
    }
    return comp
  })
}

// Roots carry the (project, config) pairs. Label each project by its relative
// dir, which is unique and human-readable, and fall back to its name, then its
// key. The flat scannedConfigs union is not enough on its own once projects in
// one build resolve different configs — routine for dotnet, where every
// project picks its own target frameworks.
export function buildConfigsByProject(
  parsed: ParsedRecords,
): Array<{ project: string; configs: string[] }> {
  const configsByProjectKey = new Map<string, Set<string>>()
  for (const root of parsed.roots.values()) {
    if (!root.config) {
      continue
    }
    let set = configsByProjectKey.get(root.projectKey)
    if (!set) {
      set = new Set()
      configsByProjectKey.set(root.projectKey, set)
    }
    set.add(root.config)
  }
  return [...configsByProjectKey]
    .map(({ 0: projectKey, 1: configs }) => {
      const p = parsed.projects.get(projectKey)
      return {
        __proto__: null,
        project: p?.dir || p?.name || projectKey,
        configs: [...configs].toSorted(),
      }
    })
    .toSorted((a, b) => compareStr(a.project, b.project))
}

export function buildPerRoot(parsed: ParsedRecords): Map<string, PerRoot> {
  const out = new Map<string, PerRoot>()
  for (const [rootId, r] of parsed.roots) {
    const childrenByParent = new Map<string, Set<string>>()
    for (const [p, c] of r.edges) {
      if (!r.nodes.has(p) || !r.nodes.has(c)) {
        continue
      }
      let set = childrenByParent.get(p)
      if (!set) {
        set = new Set()
        childrenByParent.set(p, set)
      }
      set.add(c)
    }
    const nodes = new Map<
      string,
      {
        coord: RawCoord
        children: string[]
        direct: boolean
        targets: string[]
      }
    >()
    for (const [coordId, n] of r.nodes) {
      nodes.set(coordId, {
        coord: n.coord,
        children: [...(childrenByParent.get(coordId) ?? [])].toSorted(),
        direct: n.direct,
        targets: n.targets,
      })
    }
    out.set(rootId, { projectKey: r.projectKey, prod: r.prod, nodes })
  }
  return out
}

export function buildProjects(
  parsed: ParsedRecords,
  finalNodes: Map<string, MergedNode>,
  directByRoot: Map<string, Set<string>>,
  perRoot: Map<string, PerRoot>,
  purlType: string,
): SocketFactsSbomProject[] {
  const idsByGav = new Map<string, Set<string>>()
  for (const [id, fn] of finalNodes) {
    const key = gav(fn.coord.group, fn.coord.name, fn.coord.version ?? '')
    let set = idsByGav.get(key)
    if (!set) {
      set = new Set()
      idsByGav.set(key, set)
    }
    set.add(id)
  }
  const directByProject = new Map<string, Set<string>>()
  for (const [rootId, ids] of directByRoot) {
    const pk = perRoot.get(rootId)?.projectKey ?? ''
    let set = directByProject.get(pk)
    if (!set) {
      set = new Set()
      directByProject.set(pk, set)
    }
    for (const id of ids) {
      set.add(id)
    }
  }

  const projects = [...parsed.projects.values()].map(p => {
    const entry: SocketFactsSbomProject = {
      type: purlType,
      ...namespaceEntry(purlType, p.group),
      name: p.name,
      ...(p.version ? { version: p.version } : {}),
      subprojectDir: p.dir,
      dependencies: [...(directByProject.get(p.projectKey) ?? [])].toSorted(),
      resolvedAs: [
        ...(idsByGav.get(gav(p.group, p.name, p.version)) ?? []),
      ].toSorted(),
    }
    return entry
  })
  projects.sort((a, b) => {
    const ka = `${a.subprojectDir} ${a.namespace ?? ''}:${a.name}`
    const kb = `${b.subprojectDir} ${b.namespace ?? ''}:${b.name}`
    return compareStr(ka, kb)
  })
  return projects
}

export function buildReport(parsed: ParsedRecords): ResolutionReport {
  const seen = new Set<string>()
  const failures = parsed.failures.filter(f => {
    const key = `${f.coord}|${f.detail}|${f.config}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
  const seenUnscannable = new Set<string>()
  const unscannable = parsed.unscannable.filter(u => {
    const key = `${u.config}|${u.detail}`
    if (seenUnscannable.has(key)) {
      return false
    }
    seenUnscannable.add(key)
    return true
  })
  return {
    configsByProject: buildConfigsByProject(parsed),
    failures,
    scannedConfigs: parsed.scannedConfigs,
    unscannable,
  }
}

// A coordinate with identical subtrees everywhere collapses to one node (id =
// coordId); divergent subtrees each get a content-addressed id
// (`<coordId>#<subtree-hash>`) so per-subproject overrides stay distinct.
export function mergePathSensitive(perRoot: Map<string, PerRoot>): {
  finalNodes: Map<string, MergedNode>
  directByRoot: Map<string, Set<string>>
} {
  const memo = new Map<string, string>()
  const nodesOf = (rootId: string) => perRoot.get(rootId)?.nodes

  function computeSig(
    rootId: string,
    coordId: string,
    onPath: Set<string>,
  ): string {
    const memoKey = rootId + ' ' + coordId
    const cached = memo.get(memoKey)
    if (cached !== undefined) {
      return cached
    }
    if (onPath.has(coordId)) {
      // Cycle: back-edge as leaf.
      return coordId
    }
    const node = nodesOf(rootId)?.get(coordId)
    if (!node) {
      return coordId
    }
    onPath.add(coordId)
    const childSigs = node.children.map(c => computeSig(rootId, c, onPath))
    onPath.delete(coordId)
    // Digest, not the raw string: caching expanded subtree strings OOMs on
    // reconverging DAGs; a fixed-size digest keeps the pass O(V+E).
    const sig = coordId + '{' + childSigs.join(',') + '}'
    const digest = crypto
      .createHash('sha256')
      .update(sig, 'utf8')
      .digest('hex')
      .slice(0, 16)
    memo.set(memoKey, digest)
    return digest
  }

  // Sorted iteration keeps cyclic-graph signatures stable run-to-run.
  const sigsByCoord = new Map<string, Set<string>>()
  const rootIds = [...perRoot.keys()].toSorted()
  for (let i = 0, { length } = rootIds; i < length; i += 1) {
    const rootId = rootIds[i]!
    const nodes = perRoot.get(rootId)!.nodes
    const coordIds = [...nodes.keys()].toSorted()
    for (
      let j = 0, { length: coordLength } = coordIds;
      j < coordLength;
      j += 1
    ) {
      const coordId = coordIds[j]!
      const sig = computeSig(rootId, coordId, new Set())
      let set = sigsByCoord.get(coordId)
      if (!set) {
        set = new Set()
        sigsByCoord.set(coordId, set)
      }
      set.add(sig)
    }
  }
  const divergent = (coordId: string): boolean =>
    (sigsByCoord.get(coordId)?.size ?? 0) > 1
  const emittedIdMemo = new Map<string, string>()
  const emittedIdFor = (rootId: string, coordId: string): string => {
    const k = rootId + ' ' + coordId
    let v = emittedIdMemo.get(k)
    if (v === undefined) {
      v = divergent(coordId)
        ? coordId + '#' + shortHash(computeSig(rootId, coordId, new Set()))
        : coordId
      emittedIdMemo.set(k, v)
    }
    return v
  }

  const finalNodes = new Map<string, MergedNode>()
  const directByRoot = new Map<string, Set<string>>()
  for (const [rootId, { nodes, prod }] of perRoot) {
    for (const [coordId, node] of nodes) {
      const eid = emittedIdFor(rootId, coordId)
      let fn = finalNodes.get(eid)
      if (!fn) {
        fn = {
          coord: node.coord,
          children: new Set(),
          prod: false,
          direct: false,
          targets: new Set(),
        }
        finalNodes.set(eid, fn)
      }
      if (prod) {
        fn.prod = true
      }
      if (node.direct) {
        fn.direct = true
      }
      for (const c of node.children) {
        fn.children.add(emittedIdFor(rootId, c))
      }
      for (const t of node.targets) {
        fn.targets.add(t)
      }
      if (node.direct) {
        let d = directByRoot.get(rootId)
        if (!d) {
          d = new Set()
          directByRoot.set(rootId, d)
        }
        d.add(eid)
      }
    }
  }
  return { finalNodes, directByRoot }
}

// Maven-type entries always carry the `namespace` key, even when it is empty:
// that is the shape every pre-dotnet consumer matches identity on. Groupless
// ecosystems (NuGet) omit the key entirely.
export function namespaceEntry(
  purlType: string,
  group: string,
): { namespace?: string | undefined } {
  if (purlType === PURL_TYPE_NUGET && !group) {
    return {}
  }
  return { namespace: group }
}

export function purlTypeForTool(tool: SocketFactsTool): string {
  return PURL_TYPE_BY_TOOL[tool]
}

export function shortHash(s: string): string {
  return crypto
    .createHash('sha256')
    .update(s, 'utf8')
    .digest('hex')
    .slice(0, 12)
}
