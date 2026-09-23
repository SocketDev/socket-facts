# The wire contracts

`src/contract/` holds two formats a second implementation parses:
`.socket.facts.json` (`SocketFactsSbom`) and the resolved-paths sidecar
(`ResolvedPathsSidecar`). They are the reason this package exists as a shared
library rather than a socket-cli internal, so treat them as published shapes.

## Why a shared definition

The reachability consumer hand-maintains its own copies:

- `coana-package-manager/packages/shared-types/src/socket-facts-schema.ts` - a
  parallel type declaration of the SBOM side.
- `.../java/sidecar-artifact-paths.ts` - a zod schema for the sidecar, with
  `.strict()` on the component object.

Two hand-maintained copies of one format drift, and the drift is silent until a
scan produces the wrong answer. What this package exports is a superset the
consumer could import in place of both: the same field names and the same
optionality, plus runtime validators and a coordinate-key helper the consumer
already reimplements.

## An absent coordinate is an accelerator miss, not a downgrade

When a coordinate is missing from the sidecar, the consumer does not skip it and
does not downgrade its vulnerabilities to a precomputed result. It resolves the
coordinate itself, best-effort: local caches first, then
`mvn -Dtransitive=false dependency:get`, then HTTP. The fallback lives in
`coana-package-manager/packages/reachability-analyzers/src/whole-program-code-aware-vulnerability-scanner/java/java-code-aware-vulnerability-scanner.ts:807-826`,
calling the `resolveArtifact` helper at line 710 of the same file.

The history is worth knowing, because the short-lived behavior is the one people
remember. Coana's
[#2292](https://github.com/coana-tech/coana-package-manager/pull/2292)
(`548637bbc`, 2026-06-30) landed the sidecar consumer with a hard short-circuit:
uncovered meant unresolved.
[#2295](https://github.com/coana-tech/coana-package-manager/pull/2295)
(`5d3056a1b`, 2026-07-01) relaxed it the next day, because reachability is not
scoped per project yet, so a scan legitimately carries artifacts from
subprojects outside the sidecar's build root. The pinned 15.9.5 contains the
relaxed behavior.

The consequence is the load-bearing part. **The sidecar is an accelerator, not an
authority.** A gap does not fail the scan and does not narrow it - it silently
hands that coordinate back to the reach-time resolution the sidecar design
(#1385) set out to eliminate, with that path's latency, its network dependency,
and its lower success rate. So a coverage gap is a correctness and performance
concern worth surfacing, not a benign fallback. Nothing in the wire format
signals the miss; the only evidence is a `resolvedSource` other than `sidecar` /
`sidecar-no-artifact` in the consumer's debug log.

## `classifier` serializes as an explicit JSON null

The fleet prefers `undefined` over `null` everywhere except here. The sidecar's
consumer types `classifier` as `z.string().nullable()`, and an absent key is a
different payload from an explicit `null`. `validateResolvedPathsSidecar`
therefore rejects a component whose `classifier` key is missing, even though
every other absent-optional would be fine.

## An additive field is a coordinated release

The sidecar consumer's component schema is `.strict()`. Under a strict schema an
unrecognized key is not ignored - it fails the parse, and the failure is
whole-payload, not per-field. So adding **any** field to `ResolvedComponent`,
including a `schemaVersion` intended to make future additions safe, breaks every
consumer pinned to a version released before the addition.

`validateResolvedPathsSidecar` enforces this from the producer side: an unknown
key is a violation here, so a producer cannot emit a payload the consumer will
reject.

### `ecosystem` is the one field added under that rule

`ResolvedComponent.ecosystem` carries the artifact's purl type, because a
groupless NuGet id and a Maven artifactId can produce the same coordinate key
and there is no other way to tell them apart. Adding it follows the rule above
rather than escaping it: **every** reachability scan, single-ecosystem JVM ones
included, fails at the sidecar handoff until the consumer's schema accepts the
key, because the producer stamps the tag on every entry and a `.strict()` parse
rejects the whole payload rather than the one field. Releasing the consumer's
schema change first is the gate on shipping a version of this package that
emits it.

The validator is asymmetric here on purpose: it accepts a payload with no
`ecosystem` key, because that is exactly what a sidecar written before the tag
existed looks like, and it means `maven`. Strict producer, liberal consumer.

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
