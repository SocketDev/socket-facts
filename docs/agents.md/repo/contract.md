# The wire contracts

`src/contract/` holds two formats a second implementation parses:
`.socket.facts.json` (`SocketFactsSbom`) and the resolved-paths sidecar
(`ResolvedPathsSidecar`). They are the reason this package exists as a shared
library rather than a socket-cli internal, so treat them as published shapes.

## Why a shared definition

The reachability consumer hand-maintains its own copies:

- a parallel type declaration of the SBOM side, in its shared-types package.
- `sidecar-artifact-paths.ts` in its JVM reachability analyzer - a zod schema for
  the sidecar: a record keyed by facts-file path, with `.strict()` on both the
  component and the project object.

Two hand-maintained copies of one format drift, and the drift is silent until a
scan produces the wrong answer. What this package exports is a superset the
consumer could import in place of both: the same field names and the same
optionality, plus runtime validators and a coordinate-key helper the consumer
already reimplements.

## An absent coordinate is an accelerator miss, not a downgrade

When a coordinate is missing from the sidecar, the consumer does not skip it and
does not downgrade its vulnerabilities to a precomputed result. It resolves the
coordinate itself, best-effort: local caches first, then
`mvn -Dtransitive=false dependency:get`, then HTTP. The fallback lives in the
consumer's JVM reachability scanner, in its own artifact-resolution helper.

The history is worth knowing, because the short-lived behavior is the one people
remember. The consumer first landed the sidecar with a hard short-circuit on
2026-06-30: uncovered meant unresolved. It relaxed that the next day, because
reachability is not scoped per project yet, so a scan legitimately carries
artifacts from subprojects outside the sidecar's build root. The version pinned
today carries the relaxed behavior.

The consequence is the load-bearing part. **The sidecar is an accelerator, not an
authority.** A gap does not fail the scan and does not narrow it - it silently
hands that coordinate back to the reach-time resolution the sidecar design
(#1385) set out to eliminate, with that path's latency, its network dependency,
and its lower success rate. So a coverage gap is a correctness and performance
concern worth surfacing, not a benign fallback. Nothing in the wire format
signals the miss; the only evidence is a `resolvedSource` other than `sidecar` /
`sidecar-no-artifact` in the consumer's debug log.

## An additive field is a coordinated release

The sidecar consumer parses each component AND each project with a `.strict()`
schema, inside a record keyed by facts-file path. Under a strict schema an
unrecognized key is not ignored - it fails the parse, and the failure is
whole-payload, not per-field. So adding **any** field to `SidecarComponentEntry`
or `SidecarProjectEntry`, including a `schemaVersion` intended to make future
additions safe, breaks every consumer pinned to a version released before the
addition.

`validateResolvedPathsSidecar` enforces this from the producer side: an unknown
key is a violation here, so a producer cannot emit a payload the consumer will
reject. `SIDECAR_COMPONENT_FIELDS` and `SIDECAR_PROJECT_FIELDS` are sorted so
each list diffs against the consumer's own `.strict()` object at a glance.

### The facts-file key is the scope

The sidecar is keyed by the absolute path of the `.socket.facts.json` whose own
`projects[]`/`components[]` each bucket describes, and that key is what
per-subproject reachability reads. Two independent reactors that emit the same
purl identity cannot collide, because each is only ever looked up within its own
key. There is no cross-reactor deduplication: the same external dependency
resolved by several reactors is deliberately duplicated across all of their
`components[]`, which is simpler and safer than a shared bucket.

### The purl `type` discriminates the ecosystem

A groupless NuGet id and a Maven artifactId can produce the same coordinate key,
and an entry's purl `type` is what tells them apart - `maven` for
gradle/maven/sbt, `nuget` for dotnet. It is the facts entry's own `type` carried
through verbatim, so there is no narrowing and no re-derivation. An artifact's
packaging and classifier travel in `qualifiers.ext` and
`qualifiers.classifier`, the same places the SBOM puts them.

### Proposed versioning approach - not adopted

Recorded here so the next person does not have to rederive it. **Do not
implement any of this unilaterally**; it is a change to a format two
organizations parse.

1. **Consumer first, in its own release.** Relax the component schema from
   `.strict()` to `.passthrough()` (or `.strip()`), so an unrecognized key is
   tolerated. Ship it and let it reach the pinned version both sides use. This
   step adds nothing and breaks nothing; it only removes the trap.
2. **Then, and only then, add the envelope.** With tolerant consumers deployed,
   a `schemaVersion` becomes addable, and every later addition is a normal
   additive change instead of a lockstep release.
3. **Record the pin.** `.config/repo/lockstep.json` is where the version pair
   that may talk to each other belongs, so a bump on either side is visible as a
   diff rather than as a scan that silently returns nothing.

The ordering is the whole point: adding `schemaVersion` while the consumer is
still strict is the failure it was meant to prevent.

## The SBOM side is deliberately not strict

`validateSocketFactsSbom` checks types and the `format` discriminant but
tolerates unknown top-level keys, because the SBOM travels to the Socket backend
rather than to a strict parser. Keeping the two validators asymmetric is
intentional: each one mirrors what its real consumer does.
