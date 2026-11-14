import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBody, githubTargetFromEnv, markerFor, publish, redact } from '../src/index.js';

interface Call {
  method: string;
  url: string;
  body?: { body: string };
}

function fakeGitHub(initial: Array<{ id: number; body: string; login?: string }> = [], failWith?: number) {
  const comments = initial.map((c) => ({
    id: c.id,
    body: c.body,
    html_url: `https://github.com/o/r/pull/1#issuecomment-${c.id}`,
    user: { login: c.login ?? 'github-actions[bot]' },
  }));
  const calls: Call[] = [];
  let nextId = 1000;
  const impl = (async (url: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    const body = init.body ? (JSON.parse(String(init.body)) as { body: string }) : undefined;
    calls.push({ method, url, body });
    const json = (data: unknown, status = 200) =>
      new Response(status === 204 ? null : JSON.stringify(data), { status });
    if (failWith && method !== 'GET') return json({ message: 'nope' }, failWith);
    if (method === 'GET') {
      const page = Number(new URL(url).searchParams.get('page'));
      return json(comments.slice((page - 1) * 100, page * 100));
    }
    if (method === 'POST') {
      const created = {
        id: nextId++,
        body: body!.body,
        html_url: `https://github.com/o/r/pull/1#issuecomment-${nextId}`,
        user: { login: 'github-actions[bot]' },
      };
      comments.push(created);
      return json(created, 201);
    }
    const id = Number(url.split('/').pop());
    const index = comments.findIndex((c) => c.id === id);
    if (method === 'DELETE') {
      comments.splice(index, 1);
      return json(null, 204);
    }
    comments[index]!.body = body!.body;
    return json(comments[index]);
  }) as unknown as typeof fetch;
  return { impl, calls, comments };
}

const target = { token: 'ghs_abcdefghijklmnopqrstuvwxyz0123456789', owner: 'o', repo: 'r', issueNumber: 1 };

describe('redact', () => {
  it('masks tokens, keys and home paths', () => {
    const input = [
      'token ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aws AKIAABCDEFGHIJKLMNOP',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      'path /home/alice/project/a.png and C:\\Users\\bob\\repo\\b.png and /Users/carol/x',
      'custom s3cr3t-value',
    ].join('\n');
    const out = redact(input, { secrets: ['s3cr3t-value'] });
    expect(out).not.toContain('ghp_');
    expect(out).not.toContain('AKIA');
    expect(out).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(out).not.toMatch(/alice|bob|carol/);
    expect(out).not.toContain('s3cr3t-value');
    expect(out).toMatchSnapshot();
  });

  it('leaves ordinary text alone', () => {
    expect(redact('14 binary files touched: 11 noise, 3 changed')).toBe(
      '14 binary files touched: 11 noise, 3 changed',
    );
  });
});

describe('buildBody', () => {
  it('prefixes the marker', () => {
    expect(buildBody({ tool: 'noise-diff:report', markdown: 'hello' }).body).toBe(
      '<!-- noise-diff:report -->\nhello\n',
    );
  });

  it('truncates on a line boundary, closes details and links the artifact', () => {
    const markdown = `<details><summary>x</summary>\n\n${'line of text\n'.repeat(1000)}</details>`;
    const { body, truncated } = buildBody({
      tool: 't',
      markdown,
      maxChars: 2000,
      artifactUrl: 'https://example.com/a',
    });
    expect(truncated).toBe(true);
    expect(body.length).toBeLessThanOrEqual(2000);
    expect(body).toContain('</details>');
    expect(body).toContain('[Full report](https://example.com/a)');
    expect(body.split('\n').filter((l) => l.startsWith('line')).every((l) => l === 'line of text')).toBe(true);
  });

  it('rejects invalid tool names', () => {
    expect(() => markerFor('bad name -->')).toThrow(/Invalid/);
  });
});

describe('publish', () => {
  it('dry-run prints and makes no call', async () => {
    let printed = '';
    const gh = fakeGitHub();
    const result = await publish({
      tool: 'nd',
      markdown: '# hi',
      dryRun: true,
      github: target,
      fetch: gh.impl,
      stdout: (t) => {
        printed += t;
      },
    });
    expect(result.mode).toBe('dry-run');
    expect(printed).toBe('<!-- nd -->\n# hi\n');
    expect(gh.calls).toHaveLength(0);
  });

  it('creates once then updates in place, never duplicates (10 pushes)', async () => {
    const gh = fakeGitHub([{ id: 1, body: 'unrelated comment' }]);
    const first = await publish({ tool: 'nd', markdown: 'run 0', github: target, fetch: gh.impl });
    expect(first.mode).toBe('created');
    for (let i = 1; i < 10; i++) {
      const r = await publish({ tool: 'nd', markdown: `run ${i}`, github: target, fetch: gh.impl });
      expect(r.mode).toBe('updated');
      expect(r.commentId).toBe(first.commentId);
    }
    const ours = gh.comments.filter((c) => c.body.startsWith('<!-- nd -->'));
    expect(ours).toHaveLength(1);
    expect(ours[0]!.body).toContain('run 9');
  });

  it('removes duplicates left by concurrent runs', async () => {
    const gh = fakeGitHub([
      { id: 1, body: '<!-- nd -->\nold' },
      { id: 2, body: '<!-- nd -->\nolder dup' },
      { id: 3, body: '<!-- nd -->\nsomeone else', login: 'human' },
    ]);
    await publish({ tool: 'nd', markdown: 'new', github: target, fetch: gh.impl });
    expect(gh.comments.map((c) => c.id)).toEqual([1, 3]);
  });

  it('paginates through comments', async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, body: `c${i}` }));
    many.push({ id: 999, body: '<!-- nd -->\nold' });
    const gh = fakeGitHub(many);
    const r = await publish({ tool: 'nd', markdown: 'x', github: target, fetch: gh.impl });
    expect(r.mode).toBe('updated');
    expect(r.commentId).toBe(999);
  });

  it('masks the token in the published body', async () => {
    const gh = fakeGitHub();
    await publish({ tool: 'nd', markdown: `leak ${target.token}`, github: target, fetch: gh.impl });
    expect(gh.comments[0]!.body).not.toContain(target.token);
  });

  it('falls back to the job summary on forks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sticky-'));
    const summaryPath = join(dir, 'summary.md');
    writeFileSync(summaryPath, '');
    const gh = fakeGitHub();
    const warnings: string[] = [];
    const r = await publish({
      tool: 'nd',
      markdown: 'fork report',
      github: { ...target, isFork: true },
      summaryPath,
      fetch: gh.impl,
      logger: { info: () => {}, warning: (m) => warnings.push(m) },
    });
    expect(r.mode).toBe('summary');
    expect(readFileSync(summaryPath, 'utf8')).toBe('fork report\n');
    expect(gh.calls).toHaveLength(0);
    expect(warnings[0]).toMatch(/fork/);
  });

  it('degrades when the token lacks write permission', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sticky-'));
    const summaryPath = join(dir, 'summary.md');
    const gh = fakeGitHub([], 403);
    const r = await publish({ tool: 'nd', markdown: 'r', github: target, summaryPath, fetch: gh.impl });
    expect(r.mode).toBe('summary');
    expect(r.reason).toMatch(/403/);
  });

  it('returns none without context or summary', async () => {
    const r = await publish({ tool: 'nd', markdown: 'r' });
    expect(r.mode).toBe('none');
  });

  it('rethrows unexpected server errors', async () => {
    const gh = fakeGitHub([], 500);
    await expect(publish({ tool: 'nd', markdown: 'r', github: target, fetch: gh.impl })).rejects.toThrow(/500/);
  });

  it('also writes the summary when asked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sticky-'));
    const summaryPath = join(dir, 'summary.md');
    const gh = fakeGitHub();
    const r = await publish({
      tool: 'nd',
      markdown: 'both',
      github: target,
      summaryPath,
      alsoSummary: true,
      fetch: gh.impl,
    });
    expect(r.mode).toBe('created');
    expect(readFileSync(summaryPath, 'utf8')).toBe('both\n');
  });
});

describe('githubTargetFromEnv', () => {
  const write = (payload: unknown) => {
    const dir = mkdtempSync(join(tmpdir(), 'sticky-'));
    const path = join(dir, 'event.json');
    writeFileSync(path, JSON.stringify(payload));
    return path;
  };

  it('reads PR number and detects forks', () => {
    const env = {
      GITHUB_REPOSITORY: 'o/r',
      GITHUB_EVENT_PATH: write({
        pull_request: { number: 7, head: { repo: { full_name: 'fork/r' } }, base: { repo: { full_name: 'o/r' } } },
      }),
    };
    expect(githubTargetFromEnv('tok', env)).toMatchObject({ owner: 'o', repo: 'r', issueNumber: 7, isFork: true });
  });

  it('same-repo PR is not a fork', () => {
    const env = {
      GITHUB_REPOSITORY: 'o/r',
      GITHUB_EVENT_PATH: write({
        pull_request: { number: 7, head: { repo: { full_name: 'o/r' } }, base: { repo: { full_name: 'o/r' } } },
      }),
    };
    expect(githubTargetFromEnv('tok', env)?.isFork).toBe(false);
  });

  it('returns undefined outside a PR', () => {
    expect(githubTargetFromEnv('tok', { GITHUB_REPOSITORY: 'o/r', GITHUB_EVENT_PATH: write({}) })).toBeUndefined();
    expect(githubTargetFromEnv(undefined, {})).toBeUndefined();
    expect(githubTargetFromEnv('tok', { GITHUB_REPOSITORY: 'o/r', GITHUB_EVENT_PATH: '/nope' })).toBeUndefined();
  });
});
