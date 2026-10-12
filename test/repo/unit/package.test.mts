import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'
import { describe, expect, it } from 'vitest'

import { tarExecutable } from '../../../scripts/fleet/archives/tar-executable.mts'
import { resolvePnpmCommand } from '../../../scripts/fleet/process/pnpm-command.mts'

const SHIPPED_RUNTIME_FILES: readonly string[] = [
  'CHANGELOG.md',
  'dist/index.js',
  'emitters/socket-facts.init.gradle',
  'emitters/socket-facts.plugin.scala',
  'emitters/maven-extension/socket-facts-maven-extension.jar',
  'emitters/dotnet-tool/publish/socket-facts-dotnet.dll',
  'emitters/dotnet-tool/publish/socket-facts-dotnet.deps.json',
  'emitters/dotnet-tool/publish/socket-facts-dotnet.runtimeconfig.json',
]

const PACKAGE_INTERMEDIATES: readonly string[] = [
  'emitters/dotnet-tool/bin/Release/net6.0/socket-facts-dotnet.dll',
  'emitters/dotnet-tool/obj/project.assets.json',
  'emitters/dotnet-tool/obj/Release/net6.0/.NETCoreApp,Version=v6.0.AssemblyAttributes.cs',
]

describe('package contents', () => {
  it('ships runtime emitters and excludes .NET build intermediates', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { files: string[] }
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'socket-facts-package-'))
    const fixtureDir = path.join(tempDir, 'fixture')
    const packDir = path.join(tempDir, 'packed')
    try {
      mkdirSync(fixtureDir)
      mkdirSync(packDir)
      writeFileSync(
        path.join(fixtureDir, 'package.json'),
        JSON.stringify({
          name: 'socket-facts-package-fixture',
          version: '1.0.0',
          files: manifest.files,
        }),
      )
      for (const file of [...SHIPPED_RUNTIME_FILES, ...PACKAGE_INTERMEDIATES]) {
        const filePath = path.join(fixtureDir, file)
        mkdirSync(path.dirname(filePath), { recursive: true })
        writeFileSync(filePath, '')
      }

      const command = resolvePnpmCommand(
        [
          'pack',
          '--offline',
          '--config.ignore-scripts=true',
          '--pack-destination',
          packDir,
        ],
        { requireInstalled: true },
      )
      const packed = spawnSync(command.command, command.args, {
        cwd: fixtureDir,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        timeout: 30_000,
      })
      expect(packed.status).toBe(0)
      const archive = path.join(
        packDir,
        'socket-facts-package-fixture-1.0.0.tgz',
      )
      const listed = spawnSync(tarExecutable(), ['-tzf', archive], {
        encoding: 'utf8',
        timeout: 10_000,
      })
      expect(listed.status).toBe(0)
      const files = listed.stdout
        .split(/\r?\n/u)
        .map(file => file.replace(/^package\//u, ''))
        .filter(Boolean)

      for (const file of SHIPPED_RUNTIME_FILES) {
        expect(files).toContain(file)
      }
      for (const file of PACKAGE_INTERMEDIATES) {
        expect(files).not.toContain(file)
      }
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })
})
