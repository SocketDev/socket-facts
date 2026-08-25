/*
 * @file `check --all` gate: this package's OWN TypeScript type-checks.
 *
 *   The fleet check config covers scripts/, the repo hooks, and the oxlint
 *   plugin — not `src/` and not `test/`. `src/` is checked only as a side
 *   effect of the build's declaration emit, and `test/` is checked by nothing,
 *   so a type error there survives a green `pnpm run check`. Two real defects
 *   reached main that way: a type-only import of a symbol its module never
 *   exported, and a `Record<BuildTool, string>` literal missing the `dotnet`
 *   key, which read back as `undefined` at runtime.
 *
 *   The config is generated into a tmpdir rather than committed, because
 *   per-repo config flows through the one member settings file and a new
 *   standalone tsconfig is blocked. It extends the fleet base so the gate
 *   checks under the same rules the rest of the tree does.
 *
 *   Usage: node scripts/repo/check/sources-are-type-checked.mts
 *   Exit 0 when clean, 1 on any diagnostic.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'

import { isMainModule } from '../../fleet/_shared/is-main-module.mts'
import { REPO_ROOT } from '../paths.mts'

const logger = getDefaultLogger()

// `.mts` only. The one `.ts` file under test/ is a fuzz target whose framework
// is an optional devDependency, so including it would fail this gate on a
// checkout that has not installed it — the same false-red the emitter-asset
// skip exists to avoid. It is therefore NOT type-checked, and a stale call
// inside it will not be caught here; that gap is real and known.
export const CHECKED_GLOBS: readonly string[] = [
  'src/**/*.mts',
  'test/**/*.mts',
]

export function checkConfig(): string {
  return JSON.stringify(
    {
      extends: path.join(REPO_ROOT, '.config/fleet/tsconfig.base.json'),
      compilerOptions: {
        // `.mts` specifiers appear in the import paths this package uses.
        allowImportingTsExtensions: true,
        module: 'nodenext',
        moduleResolution: 'nodenext',
        noEmit: true,
        types: ['node'],
        // The config lives in a tmpdir, so typeRoots must point back at the
        // repo or `@types/node` resolves against the tmpdir's parents.
        typeRoots: [path.join(REPO_ROOT, 'node_modules/@types')],
      },
      include: CHECKED_GLOBS.map(glob => path.join(REPO_ROOT, glob)),
    },
    undefined,
    2,
  )
}

export async function main(): Promise<void> {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'socket-facts-tscheck-'))
  const configPath = path.join(tmp, 'tsconfig.json')
  writeFileSync(configPath, checkConfig())
  try {
    await spawn(
      process.execPath,
      [
        path.join(REPO_ROOT, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '-p',
        configPath,
      ],
      { cwd: REPO_ROOT, stdio: 'inherit' },
    )
    logger.info(
      `sources-are-type-checked: ${CHECKED_GLOBS.join(' + ')} type-check clean.`,
    )
  } catch {
    logger.error(
      'sources-are-type-checked: type errors above. Where: src/ and test/. Saw diagnostics, wanted none. Fix: correct the types; this tree is not covered by the fleet check config.',
    )
    process.exitCode = 1
  } finally {
    safeDeleteSync(tmp)
  }
}

if (isMainModule(import.meta.url)) {
  void main()
}
