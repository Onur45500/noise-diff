# Contributing

Thanks for your interest in noise-diff.

1. Fork the repository and create a branch from `main`.
2. `pnpm install`, then make your change.
3. Add or update tests for any behavior change.
4. Make sure `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.
5. Open a pull request describing what changed and why.

Setup, scripts and conventions are in [docs/development.md](docs/development.md).

## Reporting bugs

Open an issue with the smallest input that reproduces the problem, the expected result and the actual result. Remove any secrets or private paths first.

## Security

Do not open a public issue for a vulnerability (for example a redaction bypass in `sticky-pr`). Report it privately through GitHub's "Report a vulnerability" option on the Security tab.
