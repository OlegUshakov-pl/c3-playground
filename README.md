<a href="https://c3-lang.org">
  <img src="favicon.svg" align="right" height="120" width="120" />
</a>

# C3 Playground

**Write, compile and run [C3](https://c3-lang.org) entirely in the browser.**

[![Deploy](https://github.com/manulinares/c3-playground/actions/workflows/main.yml/badge.svg)](https://github.com/manulinares/c3-playground/actions)
[![Live Demo](https://img.shields.io/badge/demo-live-38bdf8?style=flat&logo=githubpages)](https://manulinares.github.io/c3-playground/)
[![C3](https://img.shields.io/badge/language-C3-ff7b72?style=flat)](https://c3-lang.org)
[![License](https://img.shields.io/badge/license-MIT-94a3b8?style=flat)](#license)

<div align="center">

**[▶ Start Coding](https://manulinares.github.io/c3-playground/)**

No install. No backend. Compiler runs as WebAssembly in a Web Worker.

<img width="900" alt="C3 Playground preview" src="https://github.com/user-attachments/assets/c120d6f2-c011-43f1-a619-831a4a72ba8a" />

</div>

---

## ✨ Features

| Area | Details |
|------|---------|
| **Zero-setup compiler** | Full `c3c` compiled to WASM via Emscripten, runs in `c3-worker.js` worker (`--target emscripten --linker=builtin`). |
| **Monaco Editor** | Syntax highlighting, autocomplete, hover docs, go-to-definition, diagnostics — powered by `c3c docgen --json` live DB (`js/monaco-c3.js`). |
| **Run anything** | Console output, **raylib** 2D/3D graphics, audio (miniaudio/WebAudio), input — rendered on `<canvas>` via `build/emscripten_runtime.js` (GLFW + WebGL2). |
| **Stdlib Docs** | Offline `docs.html` generated in worker, shown in modal with patched navigation + floating source viewer (`js/docs-iframe-patch.js`). |
| **Assets** | `// @asset: https://url -> path` directive — auto-fetched and mounted into Emscripten VFS before compile (`js/assets.js`). |
| **Sharing** | One-click share via `pastes.dev` (`#p=key`), example links (`?example=snake`), save to `main.c3`, copy, URL persistence. |
| **Compiler flags** | Extra `c3c compile` flags in settings popover (e.g. `-O3 --safe=yes`), persisted in `localStorage`. |
| **Responsive** | Resizable panes (grid + `ResizeObserver`), mobile layout, fullscreen canvas, AudioContext resume handling. |

## 📦 Examples

33 curated examples, grouped in the dropdown (`js/examples.js`):

| Category | Examples |
|----------|----------|
| **Tutorials** (pure C3) | Hello World · Slices & Defer · Reflection · Error Handling · JSON Pretty Print · Bitstructs · SIMD Vectors · Brainfuck Interpreter |
| **Examples** (raylib) | Beep & Draw · Particles & Input · 3D FPS Camera · GLSL Shader Vortex · Audio Visualizer · FM Synthesizer · VoxelSpace + Synthwave · Earth Explorer (3D) |
| **Games** | Neon Overdrive · Snake |
| **Apps** | Piano & MIDI Recorder · Text Editor |
| **AI** | Neural Engine (karpathy/tinyllamas) |

> All examples are auto-tested in CI (`test/test_all_examples.js` — compiles every `.c3` to WASM via Node + `build/c3c.js`).

## 🚀 Quick Start

### Use online
Just open **[manulinares.github.io/c3-playground](https://manulinares.github.io/c3-playground/)**.

### Run locally (no build needed)

The `dist/` is not committed — but you can run the playground with a pre-built `build/`:

```bash
git clone https://github.com/manulinares/c3-playground.git
cd c3-playground
# if you have a prebuilt build/ folder, just serve:
npx serve .          # or: python3 -m http.server 8000
# open http://localhost:3000
```

> Without `build/c3c.wasm` + `build/c3c.js` + `build/c3c.data` + `build/emscripten_runtime.js` the editor will show `Loading...` forever.

## 🛠 Build from Source

Compiles `c3c` to WebAssembly and patches the Emscripten runtime.

**Requirements:** `emsdk` (latest), `cmake`, `ninja`, `ccache`, `python3`

```bash
# 1. Clone with c3c
git clone https://github.com/manulinares/c3-playground.git
cd c3-playground
git clone --depth 1 https://github.com/c3lang/c3c.git c3c

# 2. Install Emscripten
git clone https://github.com/emscripten-core/emsdk.git
./emsdk/emsdk install latest && ./emsdk/emsdk activate latest
source ./emsdk/emsdk_env.sh

# 3. Build
chmod +x build.sh
./build.sh Release latest
#  Build Type:     Release
#  LLVM Tag:       latest
#  -> build/c3c.js + build/c3c.wasm + build/c3c.data + build/emscripten_runtime.js
#  -> dist/ ready to deploy

# 4. Serve
npx serve dist
```

`build.sh` does:
1. `embuilder build libc libdlmalloc ...` → `build/wasm32-emscripten/*.a`
2. `emcmake cmake` c3c with `-DC3_WITH_LLVM=ON -DC3_FETCH_LLVM=ON` → `build/c3c.wasm`
3. Standalone `emscripten_runtime.js` (`USE_GLFW=3 USE_WEBGL2=1 MODULARIZE=1`) + 9 Python patches (dynamic `EM_ASM` proxy, `syncHeapGlobals`, miniaudio bridge, canvas-scoped GLFW keys, clipboard, `InitWindow(0,0)` fix, etc.)
4. Assembles `dist/` (`index.html`, `c3-worker.js`, `js/`, `examples/`, `build/`).

## 🗂 Project Structure

```
.
├── index.html              # Layout, styles, canvas, docs modal
├── c3-worker.js            # Worker: compile / docgen / version / read_file / assets
├── js/
│   ├── main.js             # App bootstrap, Monaco, UI, runEmscriptenProgram
│   ├── compiler.js         # preloadCompilerAssets, executeCompilerTask, stdlib docs cache
│   ├── monaco-c3.js        # C3 Monarch grammar, completion/hover/definition
│   ├── assets.js           # @asset parse / fetch / writeVfsFile
│   ├── examples.js         # Manifest + fetch + prefetch
│   ├── share.js            # pastes.dev share / ?example= loader
│   └── docs-iframe-patch.js# srcdoc patch: history, file:// links, source viewer
├── examples/               # 33 .c3 files (tutorials / examples / games / apps / ai)
├── lib/raylib6.c3l         # Prebuilt raylib for c3c
├── build.sh                # Full WASM build pipeline
├── test/test_all_examples.js # Node integration tests
└── .github/workflows/main.yml # CI: build.sh Release + node test + Pages deploy
```

## 🧩 How It Works

```
[Monaco Editor] --(source)--> [main.js] --(assets + flags)--> [compiler.js]
                                                         |
                                         Worker(c3-worker.js) --callMain--> c3c.wasm
                                                         |                    |
                                                         +-- /main.c3 -> /main.wasm
                                                         +-- /doc.json (docgen DB)
                                                         +-- /docs.html (stdlib)
                                                         |
[Console <pre>] <-- stdout/stderr -- [main.js] <-- postMessage --+
[Canvas #canvas] <-- WebGL/GLFW -- [C3EmscriptenRuntime] <-- wasmBinary (/main.wasm)
```

Key invariants (`c3-worker.js:15`):
`--stdlib /usr/lib/c3/std --libdir /usr/lib/c3/lib --lib raylib6 --build-dir /c3build -L /usr/lib/c3/wasm32-emscripten -l c -l dlmalloc ... -z --no-entry --export=main`

## 🎨 Asset Directive

Fetch external files into the VFS before compile — useful for textures, models, audio:

```c
// @asset: https://example.com/texture.png -> resources/texture.png
// @asset: https://example.com/song.ogg => audio/song.ogg
// @asset: https://example.com/data.bin  // defaults to data.bin in /

module my_game;
import raylib;
// ... LoadTexture("resources/texture.png");
```

Parsing: `js/assets.js:13` (supports `->`/`=>`, `//` and `/* */`).

## ⌨️ Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Enter` | Compile & Run |
| `Ctrl/Cmd + S` | Save `main.c3` |
| `F12` / `Ctrl+Click` | Go to definition (local vars or stdlib docs modal) |
| Hover | Symbol signature + docs + `[Open Docs]` |

## ✅ Tests

```bash
# After ./build.sh
node test/test_all_examples.js              # all examples
node test/test_all_examples.js examples/games/02_snake.c3  # single
```

Each file is compiled with the same flags as the worker (`--target emscripten --linker=builtin ...`) and checks exit code + `test.wasm` existence.

## 🤝 Contributing

PRs welcome — especially new examples, editor improvements, and runtime patches. Please run `node test/test_all_examples.js` before submitting.

## 📄 License

MIT — see [LICENSE](LICENSE) (add one if missing). C3 compiler itself is licensed under the [C3 license](https://github.com/c3lang/c3c).

---

<div align="center">
  <sub>Built with <a href="https://c3-lang.org">C3</a> · <a href="https://emscripten.org">Emscripten</a> · <a href="https://microsoft.github.io/monaco-editor/">Monaco</a> · <a href="https://www.raylib.com">raylib</a></sub>
</div>
