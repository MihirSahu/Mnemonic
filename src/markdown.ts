import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { MemoryType } from './types';
import { ensureDir, ensureFile, firstHeadingOrFileName, relativeTo, safeJoin, slugify } from './util';

export type ParsedMemoryFile = {
  filePath: string;
  relativePath: string;
  title: string;
  content: string;
  type: MemoryType;
  project?: string;
  tags: string[];
  status: 'canonical' | 'pending' | 'archived';
};

export const initializeVault = (vaultPath: string): void => {
  ensureDir(vaultPath);
  for (const dir of ['preferences', 'projects', 'decisions', 'people', 'inbox', 'archive']) {
    ensureDir(path.join(vaultPath, dir));
  }

  ensureFile(
    path.join(vaultPath, 'MEMORY.md'),
    `# Memory\n\nStable, high-level memory that should be useful across AI clients.\n`
  );
  ensureFile(
    path.join(vaultPath, 'profile.md'),
    `# Profile\n\nStable profile context that the user explicitly wants available to assistants.\n`
  );
  ensureFile(
    path.join(vaultPath, 'inbox', 'pending.md'),
    `# Pending Memory Updates\n\nCandidate memories awaiting review.\n`
  );
};

export const walkMarkdownFiles = (root: string): string[] => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath);
    }
  };
  walk(root);
  return files.sort();
};

export const inferTypeFromRelativePath = (relativePath: string): MemoryType => {
  if (relativePath === 'profile.md') return 'profile';
  if (relativePath.startsWith('preferences/')) return 'preference';
  if (relativePath.startsWith('projects/')) return 'project_context';
  if (relativePath.startsWith('decisions/')) return 'decision';
  if (relativePath.startsWith('people/')) return 'person';
  return 'general';
};

export const inferStatusFromRelativePath = (relativePath: string): 'canonical' | 'pending' | 'archived' => {
  if (relativePath.startsWith('inbox/')) return 'pending';
  if (relativePath.startsWith('archive/')) return 'archived';
  return 'canonical';
};

export const inferProjectFromRelativePath = (relativePath: string): string | undefined => {
  if (!relativePath.startsWith('projects/')) return undefined;
  return path.basename(relativePath, '.md');
};

export const parseMemoryFile = (vaultPath: string, filePath: string): ParsedMemoryFile => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = matter(raw);
  const relativePath = relativeTo(vaultPath, filePath);
  const tags = Array.isArray(parsed.data.tags)
    ? parsed.data.tags.map(String)
    : typeof parsed.data.tags === 'string'
      ? parsed.data.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      : [];

  return {
    filePath,
    relativePath,
    title: typeof parsed.data.title === 'string' ? parsed.data.title : firstHeadingOrFileName(parsed.content, filePath),
    content: parsed.content.trim(),
    type: (parsed.data.type as MemoryType | undefined) ?? inferTypeFromRelativePath(relativePath),
    project: typeof parsed.data.project === 'string' ? parsed.data.project : inferProjectFromRelativePath(relativePath),
    tags,
    status: inferStatusFromRelativePath(relativePath)
  };
};

export const chunkMarkdown = (content: string, maxChars = 1800): string[] => {
  const sections = content
    .split(/\n(?=#{1,3}\s+)/g)
    .map((section) => section.trim())
    .filter(Boolean);

  const base = sections.length > 0 ? sections : [content.trim()].filter(Boolean);
  const chunks: string[] = [];

  for (const section of base) {
    if (section.length <= maxChars) {
      chunks.push(section);
      continue;
    }

    let cursor = 0;
    while (cursor < section.length) {
      chunks.push(section.slice(cursor, cursor + maxChars).trim());
      cursor += maxChars;
    }
  }

  return chunks.length ? chunks : [''];
};

export const destinationPathForType = (vaultPath: string, input: { type: MemoryType; title: string; project?: string }): string => {
  switch (input.type) {
    case 'preference':
      return safeJoin(vaultPath, `preferences/${slugify(input.title)}.md`);
    case 'project_context':
      return safeJoin(vaultPath, `projects/${slugify(input.project ?? input.title)}.md`);
    case 'decision': {
      const date = new Date().toISOString().slice(0, 10);
      return safeJoin(vaultPath, `decisions/${date}-${slugify(input.title)}.md`);
    }
    case 'person':
      return safeJoin(vaultPath, `people/${slugify(input.title)}.md`);
    case 'profile':
      return safeJoin(vaultPath, 'profile.md');
    case 'general':
    default:
      return safeJoin(vaultPath, 'MEMORY.md');
  }
};

export const appendSection = (filePath: string, title: string, body: string): void => {
  ensureDir(path.dirname(filePath));
  const prefix = fs.existsSync(filePath) ? '\n\n' : `# ${title}\n\n`;
  const block = `${prefix}## ${title}\n\n${body.trim()}\n`;
  fs.appendFileSync(filePath, block, 'utf8');
};

export const writeDecisionFile = (
  filePath: string,
  input: { title: string; decision: string; rationale: string; project?: string; consequences?: string[]; sourceApp: string }
): void => {
  ensureDir(path.dirname(filePath));
  const consequences = input.consequences?.length
    ? input.consequences.map((item) => `- ${item}`).join('\n')
    : '- None recorded.';
  const content = `# ${input.title}\n\n` +
    `## Decision\n\n${input.decision.trim()}\n\n` +
    `## Rationale\n\n${input.rationale.trim()}\n\n` +
    `## Consequences\n\n${consequences}\n\n` +
    `## Metadata\n\n- Date: ${new Date().toISOString()}\n- Source app: ${input.sourceApp}\n${input.project ? `- Project: ${input.project}\n` : ''}`;
  fs.writeFileSync(filePath, content, 'utf8');
};
