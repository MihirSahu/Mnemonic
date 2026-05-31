import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import type { MemoryType } from './types';
import {
  appendSection,
  destinationPathForType,
  initializeVault,
  writeDecisionFile
} from './markdown';
import {
  getMemoryByIdOrPath,
  indexFile,
  listMemoryFiles,
  reindexVault,
  searchMemory
} from './indexer';
import {
  escapeMarkdown,
  nowIso,
  randomId,
  relativeTo,
  safeJoin,
  slugify,
  tagsToString
} from './util';

export type MemoryServiceOptions = {
  vaultPath: string;
  gitEnabled: boolean;
  defaultSearchLimit: number;
};

export class MemoryService {
  constructor(private readonly db: Db, private readonly options: MemoryServiceOptions) {}

  init(): void {
    initializeVault(this.options.vaultPath);
    if (this.options.gitEnabled) this.ensureGitRepo();
    reindexVault(this.db, this.options.vaultPath);
  }

  search(input: { query: string; scope?: string; project?: string; limit?: number; include_pending?: boolean }) {
    return searchMemory(this.db, { ...input, defaultLimit: this.options.defaultSearchLimit });
  }

  get(input: { id?: string; file_path?: string }) {
    return getMemoryByIdOrPath(this.db, this.options.vaultPath, input);
  }

  listFiles(scope?: string) {
    return listMemoryFiles(this.db, scope);
  }

  reindex() {
    const result = reindexVault(this.db, this.options.vaultPath);
    this.audit('reindex_memory', 'system', 'reindex', undefined, {}, result);
    return result;
  }

  saveMemory(input: {
    type: MemoryType;
    title: string;
    content: string;
    project?: string;
    tags?: string[];
    source_app: string;
    reason: string;
  }) {
    const destination = destinationPathForType(this.options.vaultPath, input);
    const body = this.memoryBlock({
      content: input.content,
      tags: input.tags,
      sourceApp: input.source_app,
      reason: input.reason,
      status: 'canonical'
    });

    if (input.type === 'decision') {
      writeDecisionFile(destination, {
        title: input.title,
        decision: input.content,
        rationale: input.reason,
        project: input.project,
        sourceApp: input.source_app
      });
    } else {
      appendSection(destination, input.title, body);
    }

    indexFile(this.db, this.options.vaultPath, destination);
    const relativePath = relativeTo(this.options.vaultPath, destination);
    this.audit('save_memory', input.source_app, 'write', relativePath, input, { file_path: relativePath });
    this.gitCommit(`memory: save ${input.type} ${slugify(input.title)}`);
    return { file_path: relativePath, status: 'saved' as const };
  }

  proposeMemoryUpdate(input: {
    type: MemoryType;
    title: string;
    content: string;
    project?: string;
    tags?: string[];
    source_app: string;
    reason: string;
    confidence?: number;
  }) {
    const destination = safeJoin(this.options.vaultPath, 'inbox/pending.md');
    const suggestedDestination = relativeTo(
      this.options.vaultPath,
      destinationPathForType(this.options.vaultPath, input)
    );
    const body = [
      `- Type: ${input.type}`,
      input.project ? `- Project: ${input.project}` : undefined,
      `- Source app: ${input.source_app}`,
      `- Confidence: ${input.confidence ?? 0}`,
      `- Suggested destination: ${suggestedDestination}`,
      input.tags?.length ? `- Tags: ${input.tags.join(', ')}` : undefined,
      `- Reason: ${input.reason}`,
      '',
      escapeMarkdown(input.content)
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    appendSection(destination, input.title, body);
    indexFile(this.db, this.options.vaultPath, destination);
    const relativePath = relativeTo(this.options.vaultPath, destination);
    this.audit('propose_memory_update', input.source_app, 'propose', relativePath, input, { file_path: relativePath });
    this.gitCommit(`memory: propose ${slugify(input.title)}`);
    return { file_path: relativePath, status: 'proposed' as const, suggested_destination: suggestedDestination };
  }

  appendProjectContext(input: {
    project: string;
    content: string;
    section?: string;
    source_app: string;
    reason: string;
  }) {
    const filePath = safeJoin(this.options.vaultPath, `projects/${slugify(input.project)}.md`);
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `# ${input.project}\n\n`, 'utf8');
    }

    const title = input.section ?? `Update — ${new Date().toISOString().slice(0, 10)}`;
    const body = this.memoryBlock({
      content: input.content,
      tags: ['project-context'],
      sourceApp: input.source_app,
      reason: input.reason,
      status: 'canonical'
    });
    appendSection(filePath, title, body);
    indexFile(this.db, this.options.vaultPath, filePath);
    const relativePath = relativeTo(this.options.vaultPath, filePath);
    this.audit('append_project_context', input.source_app, 'write', relativePath, input, { file_path: relativePath });
    this.gitCommit(`memory: append project context ${slugify(input.project)}`);
    return { file_path: relativePath, status: 'saved' as const };
  }

  recordDecision(input: {
    title: string;
    decision: string;
    rationale: string;
    project?: string;
    consequences?: string[];
    source_app: string;
  }) {
    const date = new Date().toISOString().slice(0, 10);
    const filePath = safeJoin(this.options.vaultPath, `decisions/${date}-${slugify(input.title)}.md`);
    writeDecisionFile(filePath, {
      title: input.title,
      decision: input.decision,
      rationale: input.rationale,
      project: input.project,
      consequences: input.consequences,
      sourceApp: input.source_app
    });
    indexFile(this.db, this.options.vaultPath, filePath);
    const relativePath = relativeTo(this.options.vaultPath, filePath);
    this.audit('record_decision', input.source_app, 'write', relativePath, input, { file_path: relativePath });
    this.gitCommit(`memory: record decision ${slugify(input.title)}`);
    return { file_path: relativePath, status: 'saved' as const };
  }

  private memoryBlock(input: {
    content: string;
    tags?: string[];
    sourceApp: string;
    reason: string;
    status: 'canonical' | 'pending';
  }): string {
    const metadata = [
      `- Saved at: ${nowIso()}`,
      `- Source app: ${input.sourceApp}`,
      `- Status: ${input.status}`,
      input.tags?.length ? `- Tags: ${input.tags.join(', ')}` : undefined,
      `- Reason: ${input.reason}`
    ]
      .filter((line) => line !== undefined)
      .join('\n');
    return `${metadata}\n\n${escapeMarkdown(input.content)}`;
  }

  recordAudit(toolName: string, sourceApp: string | undefined, action: string, targetFile: string | undefined, input: unknown, result: unknown): void {
    this.audit(toolName, sourceApp, action, targetFile, input, result);
  }

  commitVaultChange(message: string): void {
    this.gitCommit(message);
  }

  private audit(toolName: string, sourceApp: string | undefined, action: string, targetFile: string | undefined, input: unknown, result: unknown): void {
    this.db
      .prepare(
        `INSERT INTO audit_log (id, tool_name, source_app, action, target_file, input_json, result_json, created_at)
         VALUES (@id, @tool_name, @source_app, @action, @target_file, @input_json, @result_json, @created_at)`
      )
      .run({
        id: randomId('audit'),
        tool_name: toolName,
        source_app: sourceApp ?? null,
        action,
        target_file: targetFile ?? null,
        input_json: JSON.stringify(input),
        result_json: JSON.stringify(result),
        created_at: nowIso()
      });
  }

  private ensureGitRepo(): void {
    if (fs.existsSync(path.join(this.options.vaultPath, '.git'))) return;
    try {
      execFileSync('git', ['init'], { cwd: this.options.vaultPath, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 'memory-mcp@local'], { cwd: this.options.vaultPath, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.name', 'Memory MCP'], { cwd: this.options.vaultPath, stdio: 'ignore' });
    } catch {
      // Git is optional. If it is unavailable, the server still works.
    }
  }

  private gitCommit(message: string): void {
    if (!this.options.gitEnabled) return;
    try {
      execFileSync('git', ['add', '.'], { cwd: this.options.vaultPath, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', message], { cwd: this.options.vaultPath, stdio: 'ignore' });
    } catch {
      // No-op when there are no changes or git is unavailable.
    }
  }
}
