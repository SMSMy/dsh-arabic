/**
 * scan-asar.mjs — find how the app renders two things our RTL layer affects.
 *
 * 1. the animated status line ("Deep diving for 4m 39s ···")
 * 2. the settings switch (the toggle that looks broken in Arabic)
 *
 * Usage: node scan-asar.mjs <app.asar> <needle> [context] [maxHits]
 */
import { open, stat } from 'node:fs/promises'

const [, , file, needle, contextArg, maxArg] = process.argv
if (!file || !needle) { console.error('usage: node scan-asar.mjs <app.asar> <needle> [context] [maxHits]'); process.exit(1) }
const context = Number(contextArg || 120)
const maxHits = Number(maxArg || 4)

const { size } = await stat(file)
const chunkSize = 8 * 1024 * 1024
const handle = await open(file, 'r')
let carry = ''
let offset = 0
let hits = 0
const buffer = Buffer.alloc(chunkSize)

while (offset < size && hits < maxHits) {
  const { bytesRead } = await handle.read(buffer, 0, chunkSize, offset)
  if (!bytesRead) break
  const text = carry + buffer.toString('latin1', 0, bytesRead)
  let from = 0
  while (hits < maxHits) {
    const at = text.indexOf(needle, from)
    if (at === -1) break
    hits++
    const start = Math.max(0, at - context)
    const end = Math.min(text.length, at + needle.length + context)
    console.log(`--- hit ${hits} (byte ~${offset - carry.length + at}) ---`)
    console.log(text.slice(start, end).replace(/[\u0000-\u001f]/g, ' '))
    console.log('')
    from = at + needle.length
  }
  carry = text.slice(-needle.length * 2)
  offset += bytesRead
}
await handle.close()
if (!hits) console.log(`no occurrence of ${JSON.stringify(needle)}`)
