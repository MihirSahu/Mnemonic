'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Proposal = {
  id: string;
  title: string;
  type?: string;
  project?: string;
  sourceApp?: string;
  confidence?: string;
  suggestedDestination?: string;
  tags: string[];
  reason?: string;
  content: string;
};

export default function PendingPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState('');

  const load = async () => {
    const response = await fetch('/api/admin/pending');
    const data = await response.json();
    setProposals(data.proposals ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const act = async (proposal: Proposal, action: 'approve' | 'dismiss') => {
    setMessage('');
    const response = await fetch(`/api/admin/pending/${proposal.id}/${action}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? `${action} failed.`);
      return;
    }
    setMessage(`${proposal.title} ${action === 'approve' ? 'approved' : 'dismissed'}.`);
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Pending</h1>
        <p className="text-sm text-slate-600">Review proposed memory updates from lower-trust clients.</p>
      </div>
      {message ? <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">{message}</div> : null}
      {proposals.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-slate-600">No pending proposals.</CardContent></Card>
      ) : null}
      <div className="grid gap-4">
        {proposals.map((proposal) => (
          <Card key={proposal.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{proposal.title}</CardTitle>
                  <CardDescription>{proposal.reason ?? 'No reason recorded.'}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => act(proposal, 'approve')}>
                    <Check className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act(proposal, 'dismiss')}>
                    <X className="h-4 w-4" />
                    Dismiss
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {proposal.type ? <Badge>{proposal.type}</Badge> : null}
                {proposal.project ? <Badge variant="secondary">{proposal.project}</Badge> : null}
                {proposal.sourceApp ? <Badge variant="outline">{proposal.sourceApp}</Badge> : null}
                {proposal.confidence ? <Badge variant="outline">confidence {proposal.confidence}</Badge> : null}
                {proposal.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
              </div>
              {proposal.suggestedDestination ? (
                <div className="rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{proposal.suggestedDestination}</div>
              ) : null}
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6">
                {proposal.content}
              </pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

