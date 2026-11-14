import { appendFile } from 'node:fs/promises';
import { buildBody, GITHUB_COMMENT_LIMIT, markerFor } from './body.js';
import { redact } from './redact.js';

export interface GitHubTarget {
  token: string;
  owner: string;
  repo: string;
  issueNumber: number;
  /** True when the PR comes from a fork: the token is read-only there. */
  isFork?: boolean;
  apiUrl?: string;
}

export interface Logger {
  info(message: string): void;
  warning(message: string): void;
}

export interface PublishOptions {
  /** Marker name, e.g. "noise-diff:report" → `<!-- noise-diff:report -->`. */
  tool: string;
  markdown: string;
  github?: GitHubTarget;
  /** Print the Markdown to stdout, no network call. */
  dryRun?: boolean;
  /** Path of GITHUB_STEP_SUMMARY, used as fallback (and always appended when `alsoSummary`). */
  summaryPath?: string;
  alsoSummary?: boolean;
  artifactUrl?: string;
  /** Extra secret values to mask. The GitHub token is always masked. */
  secrets?: readonly string[];
  maxChars?: number;
  fetch?: typeof fetch;
  stdout?: (text: string) => void;
  logger?: Logger;
}

export type PublishMode = 'dry-run' | 'created' | 'updated' | 'summary' | 'none';

export interface PublishResult {
  mode: PublishMode;
  commentId?: number;
  commentUrl?: string;
  truncated: boolean;
  /** Why the comment was not posted, when it was not. */
  reason?: string;
}

interface IssueComment {
  id: number;
  body?: string | null;
  html_url: string;
  user?: { login: string } | null;
}

export class GitHubHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubHttpError';
  }
}

const silentLogger: Logger = { info: () => {}, warning: () => {} };

export async function publish(options: PublishOptions): Promise<PublishResult> {
  const logger = options.logger ?? silentLogger;
  const secrets = [...(options.secrets ?? []), ...(options.github?.token ? [options.github.token] : [])];
  const markdown = redact(options.markdown, { secrets });
  const built = buildBody({
    tool: options.tool,
    markdown,
    maxChars: options.maxChars ?? GITHUB_COMMENT_LIMIT,
    artifactUrl: options.artifactUrl,
  });

  if (options.dryRun) {
    (options.stdout ?? ((t: string) => process.stdout.write(t)))(built.body);
    return { mode: 'dry-run', truncated: built.truncated };
  }

  const writeSummary = async () => {
    if (!options.summaryPath) return false;
    // The job summary has a 1 MiB limit; the full markdown fits in practice, keep it untruncated.
    await appendFile(options.summaryPath, `${markdown.trimEnd()}\n`, 'utf8');
    return true;
  };

  const fallback = async (reason: string): Promise<PublishResult> => {
    const wrote = await writeSummary();
    logger.warning(`sticky-pr: ${reason}; ${wrote ? 'wrote the job summary instead' : 'no job summary available'}`);
    return { mode: wrote ? 'summary' : 'none', truncated: built.truncated, reason };
  };

  if (!options.github) return fallback('no GitHub pull request context');
  if (options.github.isFork) return fallback('pull request from a fork (read-only token)');

  try {
    const result = await upsertComment(options.github, options.tool, built.body, options.fetch ?? fetch, logger);
    if (options.alsoSummary) await writeSummary();
    return { ...result, truncated: built.truncated };
  } catch (error) {
    if (error instanceof GitHubHttpError && (error.status === 403 || error.status === 404 || error.status === 401)) {
      return fallback(
        `GitHub API returned ${error.status} (missing "pull-requests: write" permission or read-only token)`,
      );
    }
    throw error;
  }
}

async function upsertComment(
  target: GitHubTarget,
  tool: string,
  body: string,
  fetchImpl: typeof fetch,
  logger: Logger,
): Promise<Pick<PublishResult, 'mode' | 'commentId' | 'commentUrl'>> {
  const api = (target.apiUrl ?? 'https://api.github.com').replace(/\/$/, '');
  const base = `${api}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
  const request = async <T>(method: string, url: string, payload?: unknown): Promise<T> => {
    const response = await fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${target.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
        'user-agent': 'sticky-pr',
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new GitHubHttpError(response.status, `GitHub API ${method} ${url} failed: ${response.status}`);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  };

  const marker = markerFor(tool);
  const matching: IssueComment[] = [];
  for (let page = 1; page <= 50; page++) {
    const comments = await request<IssueComment[]>(
      'GET',
      `${base}/issues/${target.issueNumber}/comments?per_page=100&page=${page}`,
    );
    for (const comment of comments) if (comment.body?.startsWith(marker)) matching.push(comment);
    if (comments.length < 100) break;
  }

  const [existing, ...duplicates] = matching;
  if (!existing) {
    const created = await request<IssueComment>('POST', `${base}/issues/${target.issueNumber}/comments`, { body });
    logger.info(`sticky-pr: created comment ${created.html_url}`);
    return { mode: 'created', commentId: created.id, commentUrl: created.html_url };
  }

  const updated = await request<IssueComment>('PATCH', `${base}/issues/comments/${existing.id}`, { body });
  // A concurrent run may have created a second comment: remove our own duplicates.
  for (const duplicate of duplicates) {
    if (duplicate.user?.login && duplicate.user.login === existing.user?.login) {
      await request('DELETE', `${base}/issues/comments/${duplicate.id}`).catch(() => undefined);
    }
  }
  logger.info(`sticky-pr: updated comment ${updated.html_url}`);
  return { mode: 'updated', commentId: updated.id, commentUrl: updated.html_url };
}
