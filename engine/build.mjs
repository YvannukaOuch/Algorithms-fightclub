// Compiles the C++ engine (engine/src) into src/engine/arena.wasm.
//
// By default this uses @yowasp/clang: Clang/LLD compiled to WebAssembly and run
// by Node, so building the engine needs nothing beyond `npm install`.
// Set FC_CLANG to a native clang++ with the wasm32 target to use that instead.
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const engineDir = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.join(engineDir, 'src')
const outFile = path.resolve(engineDir, '..', 'src', 'engine', 'arena.wasm')

const FLAGS = [
  '--target=wasm32',
  '-std=c++17',
  '-O3',
  '-ffreestanding',
  '-nostdlib',
  // Only Clang's built-in headers (stdint.h, stddef.h); no libc or libc++ headers.
  '-nostdinc++',
  '-nostdlibinc',
  '-fno-exceptions',
  '-fno-rtti',
  '-fno-threadsafe-statics',
  '-mbulk-memory',
  '-Wall',
  '-Wextra',
  '-Werror',
  '-Wl,--no-entry',
  '-Wl,--strip-all',
  '-Wl,-z,stack-size=262144',
]

async function readSources() {
  const names = (await readdir(srcDir)).filter((f) => /\.(cpp|hpp)$/.test(f))
  const entries = await Promise.all(
    names.map(async (name) => [name, await readFile(path.join(srcDir, name), 'utf8')]),
  )
  return Object.fromEntries(entries)
}

async function buildWithYoWASP(sources) {
  const { runClang } = await import('@yowasp/clang')
  const decoder = new TextDecoder()
  let log = ''
  const capture = (bytes) => {
    if (bytes) log += decoder.decode(bytes, { stream: true })
  }
  try {
    const out = await runClang(['clang++', ...FLAGS, 'src/arena.cpp', '-o', 'arena.wasm'], { src: sources }, {
      stdout: capture,
      stderr: capture,
      fetchProgress: () => {},
    })
    if (log.trim()) process.stderr.write(log)
    return out['arena.wasm']
  } catch (err) {
    process.stderr.write(log)
    throw new Error(`clang failed${err?.code !== undefined ? ` (exit ${err.code})` : ''}`)
  }
}

async function buildWithSystemClang(clang) {
  const work = path.join(tmpdir(), `fightclub-engine-${process.pid}`)
  await mkdir(work, { recursive: true })
  const out = path.join(work, 'arena.wasm')
  const res = spawnSync(clang, [...FLAGS, path.join(srcDir, 'arena.cpp'), '-o', out], { stdio: 'inherit' })
  if (res.status !== 0) throw new Error(`${clang} failed (exit ${res.status})`)
  const bytes = await readFile(out)
  await rm(work, { recursive: true, force: true })
  return bytes
}

async function main() {
  const started = performance.now()
  const toolchain = process.env.FC_CLANG ?? '@yowasp/clang'
  const wasm = process.env.FC_CLANG
    ? await buildWithSystemClang(process.env.FC_CLANG)
    : await buildWithYoWASP(await readSources())

  const mod = await WebAssembly.compile(wasm)
  const imports = WebAssembly.Module.imports(mod)
  if (imports.length > 0) {
    const names = imports.map((i) => `${i.module}.${i.name}`).join(', ')
    throw new Error(`the engine must be import-free, but it imports: ${names}`)
  }
  const exports = WebAssembly.Module.exports(mod).map((e) => e.name)

  await mkdir(path.dirname(outFile), { recursive: true })
  await writeFile(outFile, wasm)
  const kib = (wasm.byteLength / 1024).toFixed(1)
  const ms = (performance.now() - started).toFixed(0)
  console.log(`arena.wasm: ${kib} KiB, ${exports.length} exports, built with ${toolchain} in ${ms} ms`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
