# Architecture

## Monorepo

A pnpm workspace (`pnpm-workspace.yaml`) with two packages:

- **`noise-diff`**: the public package. Exposes a `noise-diff` binary (`dist/cli.js`), a library entry (`dist/index.js`) and a JSON `schema` directory. Built with esbuild (`build.mjs`).
- **`sticky-pr`**: a private, source-only library (`exports: ./src/index.ts`). It is not published; `noise-diff` depends on it as `workspace:*` and bundles it at build time.

## Intended pipeline

The `noise-diff` dependencies show the intended design:

1. **Collect** the binary files changed between the base and head of a pull request. Path filtering uses `picomatch` globs; configuration is read from YAML and validated with `zod`.
2. **Decode and compare by content**, per format:
   - PNG (`pngjs`), JPEG (`jpeg-js`), GIF (`omggif`): decoded pixels. `sharp` is an optional dependency.
   - SVG (`fast-xml-parser`): parsed XML.
   - ZIP (`fflate`): archive entries.
   - PDF and fonts: format-specific comparison.
3. **Classify** each file as `noise` (identical content) or `real` (content changed), with a severity.
4. **Report** as Markdown, published through `sticky-pr`. Full reports can be uploaded as a workflow artifact (`@actions/artifact`).

Steps 1 to 3 are not yet in the repository; see the [roadmap](roadmap.md).

## sticky-pr

Pure publishing layer, independent of what the report says. See [sticky-pr.md](sticky-pr.md).
