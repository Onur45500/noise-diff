# sticky-pr

One sticky pull request comment per tool: created on the first run, updated in place afterwards. Private to this workspace (not published to npm).

```ts
import { githubTargetFromEnv, publish } from 'sticky-pr';

const result = await publish({
  tool: 'noise-diff:report',
  markdown: '## Report\n...',
  github: githubTargetFromEnv(process.env.GITHUB_TOKEN),
  summaryPath: process.env.GITHUB_STEP_SUMMARY,
});
console.log(result.mode); // 'created' | 'updated' | 'summary' | 'none' | 'dry-run'
```

## How it works

- The comment is identified by a hidden marker on its first line: `<!-- <tool> -->`. `markerFor(tool)` builds it and rejects names outside letters, digits, `:`, `.`, `_`, `-`.
- `publish` lists the PR's comments (up to 50 pages of 100), updates the first one starting with the marker, or creates one.
- If a concurrent run created duplicates, the extra comments are deleted, but only those authored by the same user as the kept one.
- Requests use the GitHub REST API with a 30 s timeout. `apiUrl` supports GitHub Enterprise.

## `publish(options)`

| Option | Description |
| --- | --- |
| `tool` | Marker name. |
| `markdown` | Report body. Redacted before use. |
| `github` | A `GitHubTarget` (`token`, `owner`, `repo`, `issueNumber`, `isFork?`, `apiUrl?`). |
| `dryRun` | Print the final body to stdout; no network call. Returns `mode: 'dry-run'`. |
| `summaryPath` | Path of `GITHUB_STEP_SUMMARY`, used as fallback. |
| `alsoSummary` | Also append to the job summary after a successful comment. |
| `artifactUrl` | Link to the full report, shown in the truncation notice. |
| `secrets` | Extra literal values to mask. The GitHub token is always masked. |
| `maxChars` | Body limit (default `GITHUB_COMMENT_LIMIT`, 65 536). |
| `fetch`, `stdout`, `logger` | Injection points for tests and custom environments. |

Returns `{ mode, commentId?, commentUrl?, truncated, reason? }`.

## Fallbacks

The comment is not posted, and the full markdown is appended to the job summary instead (`mode: 'summary'`, or `'none'` when there is no `summaryPath`), when:

- there is no pull request context (not a `pull_request` event, or no token);
- the PR comes from a fork (read-only token); a deleted fork also counts;
- the API answers 401, 403 or 404, usually a missing `pull-requests: write` permission.

Other API errors are thrown. For the Action, grant the permission:

```yaml
permissions:
  pull-requests: write
```

## Truncation

Bodies over the limit are cut on a line boundary (when that keeps at least half the budget), an open `<details>` block is closed, and a notice is appended linking to the full report when `artifactUrl` is set. `buildBody` throws if `maxChars` cannot even hold the marker and notice.

## Redaction

`redact(text, { secrets?, paths? })` masks with `***`:

- literal `secrets` (4 characters or more);
- GitHub, GitLab, AWS, OpenAI/Anthropic-style, Slack, npm and Google API keys, JWTs and PEM private keys;
- `Bearer`, `token` and `Basic` credentials in header-like text;
- home directories (`/home/x`, `/Users/x`, `C:\Users\x`), replaced by `~` unless `paths: false`.

It is deliberately conservative: a false positive only hides some text. It is a safety net, not a guarantee; do not put secrets in reports.
