'use client';

import { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Status = {
  publicUrl: string;
  vaultPath: string;
  databasePath: string;
  gitEnabled: boolean;
  defaultSearchLimit: number;
  memoryCount: number;
  chunkCount: number;
  clientCount: number;
  pendingFileCount: number;
};

export default function SystemPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const response = await fetch('/api/admin/system');
    const data = await response.json();
    setStatus(data.status);
  };

  useEffect(() => {
    void load();
  }, []);

  const reindex = async () => {
    setLoading(true);
    setMessage('');
    const response = await fetch('/api/admin/system/reindex', { method: 'POST' });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(data.error ?? 'Reindex failed.');
      return;
    }
    setMessage(`Indexed ${data.filesIndexed} files and ${data.chunksIndexed} chunks.`);
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">System</h1>
          <p className="text-sm text-slate-600">Runtime state and index controls.</p>
        </div>
        <Button onClick={reindex} disabled={loading}>
          <RefreshCcw className="h-4 w-4" />
          {loading ? 'Reindexing...' : 'Reindex'}
        </Button>
      </div>
      {message ? <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">{message}</div> : null}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Memory files', status?.memoryCount],
          ['Chunks', status?.chunkCount],
          ['Clients', status?.clientCount],
          ['Pending files', status?.pendingFileCount]
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="text-sm text-slate-500">{label}</div>
              <div className="mt-2 text-2xl font-semibold">{value ?? '-'}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Environment-backed settings are display-only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <Info label="Public URL" value={status?.publicUrl} />
          <Info label="Default search limit" value={status?.defaultSearchLimit?.toString()} />
          <Info label="Vault path" value={status?.vaultPath} />
          <Info label="Database path" value={status?.databasePath} />
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Git</div>
            <Badge variant={status?.gitEnabled ? 'default' : 'secondary'}>{status?.gitEnabled ? 'Enabled' : 'Disabled'}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 break-all rounded-md bg-slate-50 px-2 py-1 font-mono text-xs text-slate-800">{value ?? '-'}</div>
    </div>
  );
}

