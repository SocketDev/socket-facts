/*
 * @file Publish the dotnet facts emitter into the directory `src/assets.mts`
 *   resolves it from. Needs a .NET 8+ SDK; the tool itself targets net6.0 with
 *   RollForward, so it runs on every SDK from 6 up.
 *
 *   Publishing goes to a fresh staging dir which then replaces the old one, so
 *   a stale assembly can never linger next to a fresh one. The displaced
 *   directory parks in the system temp dir, where the OS reclaims it — no
 *   recursive delete of a path this script assembled.
 *
 *   Usage: `pnpm run` build:dotnet-tool
 */

import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'

import { isMainModule } from '../fleet/process/is-main-module.mts'
import {
  DOTNET_TOOL_DIR,
  DOTNET_TOOL_DLL,
  DOTNET_TOOL_PROJECT,
  DOTNET_TOOL_PUBLISH_DIR,
} from './paths.mts'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

const logger = getDefaultLogger()

export async function publishTool(stagingDir: string): Promise<void> {
  await spawn(
    'dotnet',
    [
      'publish',
      DOTNET_TOOL_PROJECT,
      '-c',
      'Release',
      '-o',
      stagingDir,
      '--nologo',
      '-v',
      'quiet',
    ],
    { cwd: DOTNET_TOOL_DIR, stdio: 'inherit' },
  )
}

export async function placePublishOutput(stagingDir: string): Promise<void> {
  const stagedDll = path.join(stagingDir, path.basename(DOTNET_TOOL_DLL))
  if (!existsSync(stagedDll)) {
    throw new Error(
      `dotnet publish finished but produced no tool assembly. ` +
        `Where: ${stagedDll}. ` +
        `Saw no file, wanted the published socket-facts-dotnet assembly. ` +
        `Fix: re-run with \`-v quiet\` removed from publishTool to see the SDK's own output.`,
    )
  }
  // Debug symbols are not runtime assets and roughly double the shipped size.
  const entries = await fs.readdir(stagingDir)
  for (const entry of entries) {
    if (entry.endsWith('.pdb')) {
      await safeDelete(path.join(stagingDir, entry))
    }
  }
  if (existsSync(DOTNET_TOOL_PUBLISH_DIR)) {
    // A path that does not exist yet: renaming onto an existing directory is
    // an error on Windows and only legal for an empty one on POSIX.
    await fs.rename(
      DOTNET_TOOL_PUBLISH_DIR,
      path.join(
        os.tmpdir(),
        `socket-facts-dotnet-old-${process.pid}-${Date.now()}`,
      ),
    )
  }
  await fs.rename(stagingDir, DOTNET_TOOL_PUBLISH_DIR)
}

export async function main(): Promise<void> {
  logger.info('build:dotnet-tool: publishing the facts emitter…')
  const stagingDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'socket-facts-dotnet-'),
  )
  await publishTool(stagingDir)
  await placePublishOutput(stagingDir)
  logger.success(`build:dotnet-tool: ${DOTNET_TOOL_DLL}`)
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
