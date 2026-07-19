import { copyFile } from 'node:fs/promises'
import { build } from 'esbuild'

const output = 'asset-worker.cjs'

await build({
  entryPoints: ['workers/asset-worker.ts'],
  outfile: output,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  external: ['@prisma/client'],
})

await copyFile(output, '.next/standalone/asset-worker.cjs')
