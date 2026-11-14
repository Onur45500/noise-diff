/** GitHub rejects comment bodies longer than this many characters. */
export const GITHUB_COMMENT_LIMIT = 65_536;

export function markerFor(tool: string): string {
  if (!/^[a-z0-9][a-z0-9:._-]*$/i.test(tool)) {
    throw new Error(`Invalid sticky-pr tool name "${tool}" (letters, digits, ":", ".", "_", "-")`);
  }
  return `<!-- ${tool} -->`;
}

export interface BuildBodyOptions {
  tool: string;
  markdown: string;
  maxChars?: number;
  /** Link to the full report, used in the truncation notice. */
  artifactUrl?: string;
}

export interface BuiltBody {
  body: string;
  truncated: boolean;
}

/**
 * Prefix the marker and truncate to the limit. Truncation cuts on a line
 * boundary, closes an open <details> block and appends a link to the full report.
 */
export function buildBody({ tool, markdown, maxChars = GITHUB_COMMENT_LIMIT, artifactUrl }: BuildBodyOptions): BuiltBody {
  const marker = markerFor(tool);
  const full = `${marker}\n${markdown.trimEnd()}\n`;
  if (full.length <= maxChars) return { body: full, truncated: false };

  const notice = artifactUrl
    ? `\n\n> ⚠️ Report truncated to fit GitHub's comment limit. [Full report](${artifactUrl})\n`
    : `\n\n> ⚠️ Report truncated to fit GitHub's comment limit. The full report is in the job summary and artifacts.\n`;
  const closing = '\n</details>';
  const budget = maxChars - marker.length - 1 - notice.length - closing.length;
  if (budget <= 0) throw new Error('maxChars too small to hold the marker and notice');

  let cut = markdown.slice(0, budget);
  const lastNewline = cut.lastIndexOf('\n');
  if (lastNewline > budget * 0.5) cut = cut.slice(0, lastNewline);

  const opened = (cut.match(/<details\b/g) ?? []).length;
  const closed = (cut.match(/<\/details>/g) ?? []).length;
  const tail = opened > closed ? closing : '';
  return { body: `${marker}\n${cut}${tail}${notice}`, truncated: true };
}
