'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const scopes = ['memory:read', 'memory:write', 'memory:propose', 'memory:admin'];

type Client = {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const response = await fetch('/api/admin/clients');
    const data = await response.json();
    setClients(data.clients ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const sorted = useMemo(() => clients, [clients]);

  const remove = async (client: Client) => {
    if (!confirm(`Delete ${client.name}?`)) return;
    const response = await fetch(`/api/admin/clients/${encodeURIComponent(client.id)}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? 'Delete failed.');
      return;
    }
    await load();
  };

  const rotate = async (client: Client) => {
    const response = await fetch(`/api/admin/clients/${encodeURIComponent(client.id)}/rotate`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? 'Rotate failed.');
      return;
    }
    setToken(data.token);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-sm text-slate-600">Manage MCP clients, scopes, and token rotation.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New client
        </Button>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      <Card>
        <CardHeader>
          <CardTitle>Client tokens</CardTitle>
          <CardDescription>Token hashes are stored. Plaintext tokens are only shown when created or rotated.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>ID</TH>
                <TH>Scopes</TH>
                <TH>Last used</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.map((client) => (
                <TR key={client.id}>
                  <TD className="font-medium">{client.name}</TD>
                  <TD className="font-mono text-xs">{client.id}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {client.scopes.map((scope) => <Badge key={scope} variant="outline">{scope}</Badge>)}
                    </div>
                  </TD>
                  <TD className="text-xs text-slate-600">{client.last_used_at ?? 'Never'}</TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(client)}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => rotate(client)}>
                        <RotateCcw className="h-4 w-4" />
                        Rotate
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => remove(client)}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <ClientForm
        open={creating || editing !== null}
        client={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onToken={setToken}
        onSaved={load}
      />
      <Dialog
        open={Boolean(token)}
        title="Client token"
        onClose={() => setToken('')}
        footer={<Button onClick={() => setToken('')}>Done</Button>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Store this token now. It will not be shown again.</p>
          <div className="flex gap-2">
            <Input value={token} readOnly />
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(token)} type="button">
              <Copy className="h-4 w-4" />
              Copy
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function ClientForm({
  open,
  client,
  onClose,
  onSaved,
  onToken
}: {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onToken: (token: string) => void;
}) {
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['memory:read', 'memory:propose']);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(client?.name ?? '');
    setSelectedScopes(client?.scopes ?? ['memory:read', 'memory:propose']);
    setError('');
  }, [client, open]);

  const toggle = (scope: string) => {
    setSelectedScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const response = await fetch(client ? `/api/admin/clients/${encodeURIComponent(client.id)}` : '/api/admin/clients', {
      method: client ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scopes: selectedScopes })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? 'Save failed.');
      return;
    }
    if (data.token) onToken(data.token);
    await onSaved();
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={client ? 'Edit client' : 'Create client'}
      onClose={onClose}
      footer={<Button form="client-form">{client ? 'Save changes' : 'Create client'}</Button>}
    >
      <form id="client-form" className="space-y-4" onSubmit={submit}>
        <div className="space-y-1">
          <label className="text-sm font-medium">Name</label>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Claude Desktop" />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Scopes</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {scopes.map((scope) => (
              <label key={scope} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <input type="checkbox" checked={selectedScopes.includes(scope)} onChange={() => toggle(scope)} />
                {scope}
              </label>
            ))}
          </div>
        </div>
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      </form>
    </Dialog>
  );
}

