/*
 * @file Build the publishable artifact.
 *
 *   Two steps, in order:
 *
 *   1. **Bundle `src/` to CJS** with rolldown, the fleet's publish shape.
 *   2. **Emit the `.d.mts` declarations** the `exports` map's `types`
 *      conditions point at. rolldown bundles runtime JS only, so without this
 *      the package advertises types it does not ship and every TypeScript
 *      consumer falls back to `any`.
 *
 *   The Maven extension jar is NOT built here. It needs a JDK, which a plain
 *   `pnpm run build` cannot assume, so it has its own script
 *   (`pnpm run build:maven-extension`) and its own release-time gate
 *   (`scripts/repo/check/emitter-assets-are-publishable.mts`).
 *
 *   Usage: node scripts/repo/build.mts
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'

import { isMainModule } from '../fleet/process/is-main-module.mts'
import { REPO_ROOT } from './paths.mts'

const logger = getDefaultLogger()

export const ROLLDOWN_CONFIG_REL_PATH = '.config/repo/rolldown.config.mts'

export const DTS_CONFIG_REL_PATH = '.config/repo/tsconfig.dts.json'

export async function runBundle(): Promise<void> {
  await spawn(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules', 'rolldown', 'bin', 'cli.mjs'),
      '--config',
      ROLLDOWN_CONFIG_REL_PATH,
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  )
}

export async function runDeclarations(): Promise<void> {
  await spawn(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--project',
      DTS_CONFIG_REL_PATH,
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  )
}

export async function main(): Promise<void> {
  if (!existsSync(path.join(REPO_ROOT, ROLLDOWN_CONFIG_REL_PATH))) {
    throw new Error(
      `Rolldown config is missing. ` +
        `Where: ${ROLLDOWN_CONFIG_REL_PATH}. ` +
        `Saw no such file, wanted the CJS bundle config for a published js package. ` +
        `Fix: add ${ROLLDOWN_CONFIG_REL_PATH}, or re-run the wheelhouse cascade.`,
    )
  }
  logger.info('build: bundling src/ to CJS…')
  await runBundle()
  logger.info('build: emitting type declarations…')
  await runDeclarations()
  logger.info('build: done')
}

if (isMainModule(import.meta.url)) {
  main().then(
    () => process.exit(0),
    (error: unknown) => {
      logger.error(errorMessage(error))
      process.exit(1)
    },
  )
}
