# Lift

A personal, auto-progressing workout tracker. The app prescribes the weight for every set and adjusts it from what you actually lifted. No backend, no accounts: everything lives in your browser (IndexedDB) and works offline.

See [CLAUDE.md](./CLAUDE.md) for the full spec.

```bash
npm install
npm run dev      # local dev server
npm test         # progression-engine tests
npm run build    # type-check + production build
```

The progression engine is pure TypeScript in `src/engine/` (no UI or DB imports). Deployment to GitHub Pages runs from `.github/workflows/deploy.yml` on push to `main`.
