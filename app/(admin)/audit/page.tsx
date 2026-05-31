'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type AuditRow = {
  id: string;
  tool_name: string;
  source_app: string | null;
  action: string;
  target_file: string | null;
  created_at: string;
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [offset, setOffset] = useState(0);

  const load = async (nextOffset = offset) => {
    const response = await fetch(`/api/admin/audit?limit=50&offset=${nextOffset}`);
    const data = await response.json();
    setRows(data.audit ?? []);
    setOffset(nextOffset);
  };

  useEffect(() => {
    void load(0);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit</h1>
        <p className="text-sm text-slate-600">Recent admin and MCP write activity.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>Showing 50 rows per page.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Time</TH>
                <TH>Tool</TH>
                <TH>Action</TH>
                <TH>Source</TH>
                <TH>Target</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap text-xs">{row.created_at}</TD>
                  <TD className="font-medium">{row.tool_name}</TD>
                  <TD>{row.action}</TD>
                  <TD>{row.source_app ?? '-'}</TD>
                  <TD className="font-mono text-xs">{row.target_file ?? '-'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" disabled={offset === 0} onClick={() => load(Math.max(offset - 50, 0))}>Previous</Button>
            <Button variant="outline" disabled={rows.length < 50} onClick={() => load(offset + 50)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

