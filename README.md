# Fire Tower website

A static project showcase with the actual meshes exported from `Firewatch_Improved.blend`. The opening scene includes the corrected exterior staircase and restored north window.

## Run locally

```sh
npm install
npm run build
npm run dev
```

Open `http://127.0.0.1:4173`.

## Files

- `dist/index.html`, `dist/style.css`: page content and layout.
- `src/scene.js`: Three.js scene, camera presets, lighting controls, and motion.
- `dist/assets/tower.glb`, `landscape.glb`: exported Blender meshes, with shared forest geometry.
- `export_models.py`: rerun inside Blender after scene edits to refresh assets. Temporary simplified export materials are restored afterward; the `.blend` is not saved or modified by this script.

The original Blender noise materials are approximated with web PBR colors. Blender volume nodes do not export to glTF; the browser uses its own animated sky shader. The render images provide a fallback when WebGL is unavailable. Animation pauses offscreen and respects reduced motion.

`dist/` is self-contained and can be served by any static host, including GitHub Pages. Build paths are relative so it also works below `/fire-tower/`. Fonts use Google Fonts with system fallbacks. Model and scene dependencies are bundled locally.

The provided GitHub repository is linked from the website. It is a separate remote from the private Sites hosting source.
