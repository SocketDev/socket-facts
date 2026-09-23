# Resolve once, at scan time

The invariant this package protects: **the dependency graph and the artifact
file paths come from one resolution, performed at scan time, against the
developer's real build.** A second resolution later in the pipeline is a
different resolution.

## Where the invariant came from

socket-cli #1352 (2026-06-04) delegated JVM facts generation to a reachability
partner. #1385 reversed it 26 days later, because the partner re-resolved the
build at reachability time and diverged from the scan-time build on projects
whose versions are dynamic - git-derived versions, CI build numbers, timestamps.
The partner landed the mirror image the same day, deleting its own manifest
surface.

## Why the old acceptance suite could not have caught it

The compat matrix that guarded the emitters used literal versions throughout: no
wildcard, no range, no BOM import, no SNAPSHOT, no conflict resolution.
Byte-equivalence on those fixtures is satisfiable by an implementation that never
runs the build at all - a cache read or a static parse of the build file produces
the same answer, because the build file already contains it.

That made the one criterion that mattered untested, which is why the ownership
question could not be asked honestly.

## What the fixture asserts

`test/repo/compat/` publishes several versions of each module into a hermetic
local repository generated per run, then asks for them by a selector that names
none of them:

| Shape    | Selector       | Published           | Must resolve to          |
| -------- | -------------- | ------------------- | ------------------------ |
| wildcard | `1.+`          | 1.0, 1.7, 2.0       | `1.7`                    |
| range    | `[1.0,2.0)`    | 1.3, 1.9, 2.5       | `1.9`                    |
| SNAPSHOT | `1.0-SNAPSHOT` | one unique snapshot | the timestamped artifact |

The project's own version is generated per run and read from a file (Gradle) or a
`-Drevision` property (Maven), so it appears in no committed text either.

Two assertions run with no JVM toolchain at all, and they are what make the rest
meaningful: the committed build file **contains** each selector and **does not
contain** the version it resolves to. A static parser cannot produce `1.7` from a
file whose only mention is `1.+`.

Gradle additionally has to report the timestamped snapshot filename rather than
`sprocket-1.0-SNAPSHOT.jar`, which no reader of the build file could know.

## Skipping is loud, never silent

`skipReasonFor` returns a What / Where / Saw-vs-wanted / Fix message when the
build tool is absent, `enforceOrAnnounceSkip` prints it prefixed
`SKIPPED CONFORMANCE RUN`, and `SOCKET_FACTS_REQUIRE_COMPAT=1` turns the skip
into a thrown failure. `test/repo/compat/loud-skip.test.mts` covers that
machinery, so the guard against a quietly-green conformance suite is itself
tested.

## The gate any future ownership change has to pass

This suite, green, on the candidate implementation - not on this one. An
implementation that resolves from a cache, from a lockfile, or from a static
parse fails it. That is the receipt the ownership question needs and did not
have.

Two things it still does not cover, recorded so nobody mistakes it for complete:
sbt has no leg yet, and neither does a BOM import or a conflict-resolution case.
