/**
 * Mask secrets and personal paths before anything is published.
 * Conservative by design: a false positive only hides a bit of text.
 */

const TOKEN_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g, // GitLab
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, // AWS access key id
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g, // OpenAI / Anthropic style
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, // Slack
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API key
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

const AUTH_HEADER = /\b(Bearer|token|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/gi;

const HOME_PATTERNS: Array<[RegExp, string]> = [
  [/\/home\/[^/\s'"`]+/g, '~'],
  [/\/Users\/[^/\s'"`]+/g, '~'],
  [/[A-Za-z]:\\Users\\[^\\\s'"`]+/g, '~'],
  [/[A-Za-z]:\/Users\/[^/\s'"`]+/g, '~'],
];

export const REDACTED = '***';

export interface RedactOptions {
  /** Extra literal values to mask (e.g. the GITHUB_TOKEN in use). */
  secrets?: readonly string[];
  /** Replace home directories by `~` (default true). */
  paths?: boolean;
}

export function redact(text: string, options: RedactOptions = {}): string {
  let out = text;
  for (const secret of options.secrets ?? []) {
    if (secret && secret.length >= 4) out = out.split(secret).join(REDACTED);
  }
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, REDACTED);
  out = out.replace(AUTH_HEADER, (_m, scheme: string) => `${scheme} ${REDACTED}`);
  if (options.paths !== false) {
    for (const [pattern, replacement] of HOME_PATTERNS) out = out.replace(pattern, replacement);
  }
  return out;
}
