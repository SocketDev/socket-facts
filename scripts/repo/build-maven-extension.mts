/*
 * @file Compile the Maven core extension to a self-contained jar and place it
 *   where `src/assets.mts` resolves it. Uses the repo-root Maven wrapper, so a
 *   JDK is the only prerequisite. The wrapper runs with the extension directory
 *   as its cwd and finds its own `.mvn/` config by walking up to the repo root.
 *
 *   Usage: `pnpm run` build:maven-extension
 */

import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'

import { isMainModule } from '../fleet/process/is-main-module.mts'
import {
  MAVEN_EXTENSION_DIR,
  MAVEN_EXTENSION_JAR,
  MAVEN_WRAPPER,
} from './paths.mts'

const logger = getDefaultLogger()

export const SHADED_JAR = path.join(
  MAVEN_EXTENSION_DIR,
  'target',
  'socket-facts-maven-extension.jar',
)

export async function packageExtension(): Promise<void> {
  await spawn(MAVEN_WRAPPER, ['-q', '--batch-mode', 'package'], {
    cwd: MAVEN_EXTENSION_DIR,
    stdio: 'inherit',
  })
}

export async function placeJar(): Promise<void> {
  if (!existsSync(SHADED_JAR)) {
    throw new Error(
      `Maven wrapper finished but produced no shaded jar. ` +
        `Where: ${SHADED_JAR}. ` +
        `Saw no file, wanted the output of the shade plugin's package goal. ` +
        `Fix: re-run with \`-q\` removed from packageExtension to see the wrapper's own output.`,
    )
  }
  await fs.copyFile(SHADED_JAR, MAVEN_EXTENSION_JAR)
}

export async function main(): Promise<void> {
  logger.info('build:maven-extension: packaging the core extension…')
  await packageExtension()
  await placeJar()
  logger.success(`build:maven-extension: ${MAVEN_EXTENSION_JAR}`)
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
