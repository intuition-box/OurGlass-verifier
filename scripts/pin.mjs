#!/usr/bin/env node
/**
 * Pin the built `dist/` directory to IPFS via Pinata and print the CID.
 *
 * Usage:
 *   PINATA_JWT=... node scripts/pin.mjs      (run `bun run build` first)
 *   bun run pin                              (builds, then pins)
 *
 * No server, no Docker: the static build is content-addressed on IPFS. The
 * returned CID is the verifier's identity — a changed build is a different CID.
 */

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'

const JWT = process.env.PINATA_JWT || process.env.VITE_PINATA_JWT
if (!JWT) {
  console.error('Set PINATA_JWT to your Pinata API JWT.')
  process.exit(1)
}

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null)
  if (!entries) return []
  const files = []
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) files.push(...(await walk(p)))
    else files.push(p)
  }
  return files
}

const files = await walk(DIST)
if (files.length === 0) {
  console.error('dist/ is empty — run `bun run build` first.')
  process.exit(1)
}

// Pinata requires the files to share a common root folder; it then returns that
// folder's CID, so index.html sits at the root (/ipfs/<cid>/index.html) and the
// relative asset paths resolve.
const ROOT = 'ourglass-verifier'
const form = new FormData()
for (const abs of files) {
  const rel = relative(DIST, abs).split(sep).join('/')
  form.append('file', new Blob([await readFile(abs)]), `${ROOT}/${rel}`)
}
form.append('pinataMetadata', JSON.stringify({ name: 'ourglass-verifier' }))
form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

console.log(`Pinning ${files.length} files to Pinata…`)
const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
  method: 'POST',
  headers: { Authorization: `Bearer ${JWT}` },
  body: form,
})
if (!res.ok) {
  console.error(`Pinata failed (${res.status}): ${await res.text()}`)
  process.exit(1)
}

const { IpfsHash } = await res.json()
console.log(`\nCID:  ${IpfsHash}`)
console.log(`IPFS: https://${IpfsHash}.ipfs.dweb.link/`)
console.log(`\nVITE_VERIFIER_URL (OurGlass) — update on each re-pin:`)
console.log(`  https://${IpfsHash}.ipfs.dweb.link/`)
