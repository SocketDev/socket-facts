/*
 * @file Rolldown configuration for the published bundle.
 *
 *   Source is ESM `.mts`; output is CJS, the fleet publish shape. Three entry
 *   points, matching the `exports` map:
 *
 *   - `index` — the generation API plus every re-export.
 *   - `contract` — types and validators only, for a consumer that parses or
 *     emits the wire formats and never spawns a build.
 *   - `assets` — emitter path resolution, for a consumer that wires the
 *     emitters into a build it drives itself.
 *
 *   The emitter assets themselves are not bundled: they are Gradle/Scala/Java
 *   artifacts a build tool reads off disk, so they ship under `emitters/` and
 *   `src/assets.mts` resolves them relative to the package root.
 */

import path from 'node:path'

import type { RolldownOptions } from 'rolldown'

import { PACKAGE_DIST_DIR, SRC_DIR } from '../../scripts/repo/paths.mts'

const config: RolldownOptions = {
  external: [/^@socketsecurity\//, /^node:/],
  input: {
    assets: path.join(SRC_DIR, 'assets.mts'),
    conformance: path.join(SRC_DIR, 'conformance', 'index.mts'),
    contract: path.join(SRC_DIR, 'contract', 'index.mts'),
    index: path.join(SRC_DIR, 'index.mts'),
  },
  output: {
    dir: PACKAGE_DIST_DIR,
    entryFileNames: '[name].js',
    format: 'cjs',
    sourcemap: false,
  },
  platform: 'node',
}

export default config
