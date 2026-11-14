# noise-diff

Sort the binary files of a pull request into **noise** (re-exports whose content is identical) and **real changes**, with a severity.

Re-saving a PNG, re-zipping an archive or re-exporting a PDF changes the bytes but not the content. Git shows a binary diff anyway, and reviewers can't tell the difference. `noise-diff` compares what the files actually contain and reports the result as a single PR comment.

> **Status: early development (v0.1.0).** The repository currently contains the reusable [`sticky-pr`](packages/sticky-pr) publishing library. The `noise-diff` analysis package is scaffolded (dependencies and package metadata are in place) but its source is not published yet. See [Status](#status) and the [roadmap](docs/roadmap.md).

## Goals

- Compare binary formats by content, not by bytes: PNG, JPEG, GIF, SVG, PDF, ZIP and fonts.
- Classify each changed file as `noise` or `real`, with a severity.
- Run as a CLI (`noise-diff`) and as a GitHub Action.
- Post one sticky comment per pull request, updated in place on every push.
- Never leak secrets or local paths into the comment.

## Repository layout

| Path | Description |
| --- | --- |
| [`packages/noise-diff`](packages/noise-diff) | The analyzer: CLI, library and GitHub Action (published as `noise-diff`). |
| [`packages/sticky-pr`](packages/sticky-pr) | Internal library: one sticky PR comment per tool. Bundled into `noise-diff`. |
| [`docs/`](docs) | Documentation. |

## Documentation

- [Architecture](docs/architecture.md): how the monorepo and the pipeline fit together.
- [sticky-pr reference](docs/sticky-pr.md): API, behavior, fork and permission fallbacks, redaction.
- [Development guide](docs/development.md): setup, scripts, testing, conventions.
- [Roadmap](docs/roadmap.md)

## Development

Requirements: Node.js >= 20 and [pnpm](https://pnpm.io) 9.

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

See the [development guide](docs/development.md) for details.

## Status

| Component | State |
| --- | --- |
| `sticky-pr` (comment upsert, truncation, fork fallback, redaction) | Implemented and tested |
| `noise-diff` format analyzers, CLI, Action | Not yet in the repository |

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE)
