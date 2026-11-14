# Development

## Requirements

- Node.js >= 20
- pnpm 9 (`packageManager` is pinned in `package.json`)

## Scripts (run at the repository root)

| Command | Effect |
| --- | --- |
| `pnpm install` | Install all workspace dependencies. |
| `pnpm build` | Build every package. |
| `pnpm test` | Run Vitest in every package. |
| `pnpm coverage` | Tests with V8 coverage. |
| `pnpm typecheck` | `tsc` in every package. |
| `pnpm lint` | Biome check. |
| `pnpm format` | Biome format, write. |

Run a single package with `pnpm --filter sticky-pr test`.

## Conventions

- TypeScript, ES modules, strict settings from `tsconfig.base.json`.
- Biome handles formatting and linting (`biome.json`).
- Dependencies are pinned to exact versions.
- Network and filesystem access in `sticky-pr` is injectable (`fetch`, `stdout`, `logger`) so tests need no real GitHub calls; see `packages/sticky-pr/test/sticky-pr.test.ts` for a fake GitHub API.
- `dist/` is ignored, except `packages/noise-diff/dist/action/`, which is committed for the GitHub Action bundle.
