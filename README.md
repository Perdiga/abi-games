# ABI Trainer

Project scaffold for the ABI Trainer inventory-packing game.

## Source of truth

The locked implementation plan lives in `docs/design/game-design.md`.

## Getting started

### Option A: VS Code Dev Container

1. Install Docker Desktop and the VS Code **Dev Containers** extension.
2. Open this folder in VS Code.
3. Run **Dev Containers: Reopen in Container** when prompted (or from the Command Palette).
4. Wait for the container to build and for `npm install` to finish automatically.
5. Run the existing scripts in the VS Code terminal:

```bash
npm run dev
npm test
npm run build
npm run lint
```

The Vite dev server runs on `http://localhost:5173` and is forwarded automatically by the container.

## Deployment

The repository includes GitHub Actions CI and automatic deployment to an OCI
Always Free VM running Nginx. See
[the OCI deployment guide](docs/deployment-oci-always-free.md) to create the
bucket and configure the required GitHub secrets.

### Option B: Local Node.js

```bash
npm install
npm run dev
npm test
npm run build
npm run lint
```

## ABI assets

Run `npm run sync:assets` to refresh the catalog and download missing images.
The sync reads metadata and images directly from the source repository on GitHub
to avoid stale GitHub Pages metadata referencing images that have moved.
Images returning HTTP 404 produce a warning and a null image path in the generated
catalog, allowing the UI to use its default item icon. Other download failures
still stop the sync. The generated catalog is written only after image processing
finishes successfully.

Use `npm run sync:assets:metadata` to update metadata without downloading images.
This metadata-only mode does not guarantee that the referenced images exist locally.

## Working areas

- `src/data/` — static catalog and layout definitions
- `src/engine/` — geometry, rules, inventory, and run simulation
- `src/components/` — React UI surface
- `src/state/` — shared app state
- `src/__tests__/` and `src/test/` — Vitest specs and test setup
