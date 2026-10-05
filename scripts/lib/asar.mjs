/**
 * asar.mjs — read files out of an Electron archive without extracting it.
 *
 * The packaged app keeps its client code inside one `app.asar` file; the archive
 * is a small pickle header (sizes, then the JSON directory) followed by the file
 * bytes. Reading one file is a header parse and one ranged read, so an audit can
 * look at what actually ships instead of what a repository checked in.
 */

import { open } from 'node:fs/promises'

/** Path of every file in the archive, as `dir/sub/file.ext`, in directory order. */
export async function asarFiles(archive, prefix = '') {
  const handle = await open(archive, 'r')
  try {
    const header = await readHeader(handle)
    const out = []
    const walk = (node, path) => {
      for (const [name, entry] of Object.entries(node.files || {})) {
        const next = path ? `${path}/${name}` : name
        if (entry.files) walk(entry, next)
        else out.push(next)
      }
    }
    walk(header, prefix)
    return out
  } finally {
    await handle.close()
  }
}

/** Bytes of one file, or null when the archive has no such path. */
export async function readAsarFile(archive, virtualPath) {
  const handle = await open(archive, 'r')
  try {
    const { header, dataStart } = await readHeaderWithData(handle)
    let node = header
    for (const part of virtualPath.split('/').filter(Boolean)) {
      if (!node.files || !node.files[part]) return null
      node = node.files[part]
    }
    if (!node.size) return null
    const buffer = Buffer.alloc(Number(node.size))
    await handle.read(buffer, 0, Number(node.size), dataStart + Number(node.offset))
    return buffer
  } finally {
    await handle.close()
  }
}

async function readHeader(handle) {
  return (await readHeaderWithData(handle)).header
}

async function readHeaderWithData(handle) {
  const head = Buffer.alloc(16)
  await handle.read(head, 0, 16, 0)
  const headerSize = head.readUInt32LE(4)
  const jsonLength = head.readUInt32LE(12)
  const json = Buffer.alloc(jsonLength)
  await handle.read(json, 0, jsonLength, 16)
  return { header: JSON.parse(json.toString('utf8')), dataStart: 8 + headerSize }
}

/** The first path in the archive that ends with `suffix` (used when a build moves a file). */
export async function asarFileEndingWith(archive, suffix) {
  const files = await asarFiles(archive)
  return files.find((file) => file.endsWith(suffix)) || null
}
