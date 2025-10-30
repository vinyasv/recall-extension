# Repository Guidelines

## Project Structure & Module Organization
The extension source lives under `src/`. Background service worker logic sits in `src/background`, content scripts in `src/content`, UI assets in `src/ui`, and offscreen workers in `src/offscreen`. Shared logic, embeddings, storage, and RAG pipelines are grouped under `src/lib` and `src/utils`. Static assets load from `public/`, while production bundles land in `dist/`. Review `docs/ARCHITECTURE.md` for end-to-end data flows before touching cross-cutting modules.

## Build, Test, and Development Commands
- `npm install` – install dependencies; rerun when `package-lock.json` changes.
- `npm run dev` – Vite watch build for development; rebuilds background, content, and UI bundles on change.
- `npm run build` – type-check via `tsc --noEmit` and produce production artifacts in `dist/`.
- `npm run preview` – serve the latest build for manual verification.
- `npm run type-check` – run the TypeScript compiler without emitting output.

## Coding Style & Naming Conventions
Write TypeScript modules with 2-space indentation and ES module syntax (`"type": "module"`). Prefer named exports for shared utilities; reserve default exports for UI entry points or singletons. Use `camelCase` for functions/variables, `PascalCase` for classes and exported factories, and uppercase snake case for constants (see `src/lib/constants`). Keep files focused—mirror the existing pattern of splitting background workers into dedicated files.

## Testing Guidelines
Unit coverage is light; pair new behaviors with targeted scripts in `scripts/`. Use `npx tsx scripts/test-hybrid-search.ts` for search assertions and `npx tsx scripts/test-end-to-end.ts` to exercise the extension pipeline with Puppeteer. Add new automated checks alongside related modules or expand the `scripts/` directory. Document manual verification steps in PR descriptions when automation is impractical.

## Commit & Pull Request Guidelines
Commit messages follow concise sentence-style summaries (see recent `git log`); start with an imperative verb and mention the area touched (e.g., “Update indexing queue retry logic”). Avoid batching unrelated edits. PRs should include context, screenshots or GIFs for UI changes, test instructions, and links to relevant issues or docs. Flag breaking changes clearly, and update `README.md` or `docs/ARCHITECTURE.md` whenever behavior or integration points shift.
