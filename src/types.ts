export type Scope = 'memory:read' | 'memory:write' | 'memory:propose' | 'memory:admin';

export type AuthContext = {
  clientId: string;
  clientName: string;
  scopes: Scope[];
};

export type MemoryStatus = 'canonical' | 'pending' | 'archived';

export type MemoryType =
  | 'preference'
  | 'project_context'
  | 'decision'
  | 'person'
  | 'profile'
  | 'general';

export type MemoryRecord = {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  file_path: string;
  section?: string | null;
  project?: string | null;
  tags?: string | null;
  status: MemoryStatus;
  source_app?: string | null;
  reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type MemoryChunk = {
  id: string;
  memory_id: string;
  chunk_text: string;
  chunk_index: number;
  file_path: string;
  created_at: string;
  updated_at: string;
};

export type SearchFilters = {
  query: string;
  scope?: string;
  project?: string;
  limit?: number;
  include_pending?: boolean;
};
