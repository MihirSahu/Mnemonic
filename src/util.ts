import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const nowIso = (): string => new Date().toISOString();

export const sha256 = (input: string): string => crypto.createHash('sha256').update(input).digest('hex');

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'memory';

export const randomId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

export const ensureDir = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true });
};

export const ensureFile = (filePath: string, initialContent: string): void => {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, initialContent, 'utf8');
};

export const safeJoin = (root: string, relativePath: string): string => {
  const normalized = relativePath.replace(/^\/+/, '');
  const fullPath = path.resolve(root, normalized);
  const resolvedRoot = path.resolve(root);
  if (fullPath !== resolvedRoot && !fullPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe path outside memory vault: ${relativePath}`);
  }
  return fullPath;
};

export const relativeTo = (root: string, fullPath: string): string => path.relative(root, fullPath).split(path.sep).join('/');

export const parseCsv = (value: string | null | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const tagsToString = (tags: string[] | undefined): string => (tags ?? []).map((tag) => tag.trim()).filter(Boolean).join(',');

export const escapeMarkdown = (value: string): string => value.replace(/\r\n/g, '\n').trim();

export const firstHeadingOrFileName = (content: string, filePath: string): string => {
  const heading = content.split('\n').find((line) => /^#\s+/.test(line));
  if (heading) return heading.replace(/^#\s+/, '').trim();
  return path.basename(filePath, '.md');
};
