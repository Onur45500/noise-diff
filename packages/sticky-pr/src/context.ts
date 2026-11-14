import { readFileSync } from 'node:fs';
import type { GitHubTarget } from './publish.js';

interface PullRequestPayload {
  pull_request?: {
    number: number;
    head?: { repo?: { full_name?: string } | null; sha?: string };
    base?: { repo?: { full_name?: string }; sha?: string };
  };
}

/**
 * Build the comment target from the GitHub Actions environment.
 * Returns undefined outside a pull_request event.
 */
export function githubTargetFromEnv(
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): GitHubTarget | undefined {
  if (!token || !env.GITHUB_EVENT_PATH || !env.GITHUB_REPOSITORY) return undefined;
  let payload: PullRequestPayload;
  try {
    payload = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) as PullRequestPayload;
  } catch {
    return undefined;
  }
  const pr = payload.pull_request;
  if (!pr) return undefined;
  const [owner, repo] = env.GITHUB_REPOSITORY.split('/');
  if (!owner || !repo) return undefined;
  const headRepo = pr.head?.repo?.full_name;
  const baseRepo = pr.base?.repo?.full_name ?? env.GITHUB_REPOSITORY;
  return {
    token,
    owner,
    repo,
    issueNumber: pr.number,
    // A deleted fork has head.repo = null: treat it as a fork too.
    isFork: headRepo !== baseRepo,
    apiUrl: env.GITHUB_API_URL,
  };
}
