import type {
  SocketFactsSbomComponent,
  SocketFactsSbomProject,
} from './sbom.mts'

// The `--compute-artifacts-sidecar` wire format. An entry is the facts SBOM's
// own component/project entry carried through verbatim with resolved paths
// bolted on, so the consumer reads one shape and `id`/`direct`/`dev`/
// `dependencies`/`subprojectDir`/`resolvedAs` survive the trip untouched.
//
// `targets`/`sources` present, `[]` included → resolution was attempted, and
// an empty array is a successful resolve that found nothing (a pom/BOM, an
// aggregator module, a NuGet package with no runtime assemblies). Both absent
// → there was no computable coordinate to resolve against at all. A coordinate
// missing from a facts file's lists entirely → the consumer resolves it
// itself, with a best-effort probe of local caches, then
// `mvn -Dtransitive=false dependency:get`, then HTTP.
//
// So the sidecar is an accelerator, not an authority. A coordinate we omit is
// not dropped from the scan — it is handed back to exactly the reach-time
// resolution this format exists to avoid, at that path's cost and
// reliability. Treat a coverage gap as a correctness concern to surface, not
// as a silent fallback: see docs/agents.md/repo/contract.md.
export type SidecarComponentEntry = SocketFactsSbomComponent & {
  // Classpath entries: jars, or a sibling first-party project's own build
  // output dirs when this dependency edge resolves to one. For NuGet, runtime
  // (lib/) assemblies and first-party build outputs.
  targets?: string[] | undefined
  // First-party source roots; `[]` for a genuinely external dependency.
  sources?: string[] | undefined
}

export type SidecarProjectEntry = SocketFactsSbomProject & {
  targets?: string[] | undefined
  sources?: string[] | undefined
}

// Keyed by the absolute path of the `.socket.facts.json` whose own
// projects[]/components[] these entries describe. The key IS the scope: two
// independent reactors that happen to emit the same purl identity can never
// collide, because each is only ever looked up within its own key. That is
// what per-subproject reachability reads. No cross-reactor deduplication —
// the same external dependency resolved by several independent reactors is
// deliberately duplicated across all of their components[], which is simpler
// and safer than a shared bucket.
//
// Changing this shape is a coordinated release with the consumer, never a
// local edit: see docs/agents.md/repo/contract.md.
export type ResolvedPathsSidecar = Record<
  string,
  {
    // This facts file's own first-party modules.
    projects: SidecarProjectEntry[]
    // This reactor's dependency-position entries: genuinely external
    // artifacts, and dependency edges that resolve to a sibling first-party
    // project, reported via that project's own source/target roots instead of
    // a jar path.
    components: SidecarComponentEntry[]
  }
>

// Resolved on-disk paths for a `withFiles` run, keyed by coordinate. In-memory
// only — this never crosses a process boundary, so Map/Set are fine here where
// they would not be in the sidecar above. `targets` = classpath entries (jars /
// module output dirs); `sources` = module source roots.
export type ResolvedArtifactPaths = {
  targetsByCoord: Map<string, string[]>
  // ext/classifier-agnostic, to recover the variant when an ingested ext is
  // untrustworthy (Gradle lockfile / version-catalog hardcode ext=jar).
  targetsByGav: Map<string, string[]>
  sourcesByCoord: Map<string, string[]>
  coords: Set<string>
}
