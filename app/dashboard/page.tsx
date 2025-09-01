'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Shell, { StatusPill } from '../../components/ui/Shell';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

type LoadingKind = 'passport' | 'order' | 'bulk' | null;

declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

/* ---------- utils ---------- */
function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
function fmtDateTime(x: any) {
  if (!x) return '';
  const d = new Date(x);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString();
}
function fmtDateOnly(x: any) {
  if (!x) return '';
  const d = new Date(x);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}
function csvEscape(s: string) {
  if (s == null) return '';
  const t = String(s);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/* bulk statuses */
const BULK_STATUS_OPTIONS = [
  { value: 'DOCUMENTS_RECEIVED', label: 'Documents Received' },
  { value: 'APPLICATIONS_SUBMITTED', label: 'Applications Submitted' },
  { value: 'PASSPORT_RECEIVED', label: 'Passport Received' },
  { value: 'PASSPORT_COURIERED', label: 'Passport Couriered' },
];

/* passport detection heuristic */
const PASSPORT_REGEX = /\b([A-Z0-9]{7,10})\b/i;

/* ----- column heuristics for bulk import ----- */
const PASSPORT_KEYS = ['passport', 'passport_number', 'passport no', 'passportno', 'pp_no', 'pp', 'ppnumber'];
const ORDER_KEYS = ['order', 'order_id', 'order id', 'smv_order_id', 'smv order id', 'reference', 'ref', 'ref_no'];

/* ---------- component ---------- */
export default function DashboardPage() {
  /* --- state (kept unchanged) --- */
  const [passport, setPassport] = useState('');
  const [orderId, setOrderId] = useState('');
  const [limit, setLimit] = useState(10);
  const [skip, setSkip] = useState(0);
  const [statusCsv, setStatusCsv] = useState('');
  const [typeCsv, setTypeCsv] = useState('');
  const [currentTask, setCurrentTask] = useState('');
  const [autoSearch, setAutoSearch] = useState(false);
  const [loading, setLoading] = useState<LoadingKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const [localStatus, setLocalStatus] = useState<Map<string, string>>(new Map());
  const lastChangeRef = useRef<{ prev: Map<string, string | undefined>; ids: Set<string> } | null>(null);
  const [bulkStatus, setBulkStatus] = useState<string>('');

  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([]);
  const [bulkRows, setBulkRows] = useState<Record<string, any>[]>([]);
  const [bulkPassportCol, setBulkPassportCol] = useState<string>('');
  const [bulkOrderCol, setBulkOrderCol] = useState<string>('');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; running: number; failed: number }>({
    done: 0,
    total: 0,
    running: 0,
    failed: 0,
  });
  const [bulkFailures, setBulkFailures] = useState<Array<{ input: string; reason: string }>>([]);

  /* --- debounced values (kept unchanged) --- */
  const dPassport = useDebounced(passport, 500);
  const dOrderId = useDebounced(orderId, 500);
  const dLimit = useDebounced(limit, 300);
  const dSkip = useDebounced(skip, 300);
  const dStatusCsv = useDebounced(statusCsv, 500);
  const dTypeCsv = useDebounced(typeCsv, 500);
  const dCurrentTask = useDebounced(currentTask, 500);

  /* --- search + api logic (unchanged) --- */
  const optionalBody = useMemo(() => {
    const body: Record<string, any> = { limit: dLimit, skip: dSkip, sort: ['created_at#!#-1'] };
    const status = dStatusCsv.split(',').map((s) => s.trim()).filter(Boolean);
    const types = dTypeCsv.split(',').map((s) => s.trim()).filter(Boolean);
    if (status.length) body.status = status;
    if (types.length) body.type = types;
    if (dCurrentTask !== '') body.currentTask = dCurrentTask || null;
    return body;
  }, [dLimit, dSkip, dStatusCsv, dTypeCsv, dCurrentTask]);

  async function callSearch(body: Record<string, any>, kind: LoadingKind) {
    setLoading(kind);
    if (kind !== 'bulk') {
      setError(null);
      setResult(null);
    }
    try {
      const r = await fetch('/api/smv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Search failed");
      const js = await r.json();
      if (kind !== 'bulk') setResult(js);
      return { ok: true, data: js };
    } catch (e: any) {
      if (kind !== 'bulk') setError(`Network error: ${String(e)}`);
      return { ok: false, reason: String(e) };
    } finally {
      if (kind !== 'bulk') setLoading(null);
    }
  }

  /* --- rows, pagination, selection --- */
  const rows: any[] = result?.result?.data?.data || result?.rows || [];
  const total: number = result?.result?.data?.count ?? (Array.isArray(rows) ? rows.length : 0);
  const pageRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    if (rows.length > limit) return rows.slice(skip, skip + limit);
    return rows;
  }, [rows, limit, skip]);

  const visibleIds = pageRows.map((r) => String(r._id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id)) && !allVisibleSelected;
  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleSelectAllVisible(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) visibleIds.forEach((id) => next.add(id));
      else visibleIds.forEach((id) => next.delete(id));
      return next;
    });
  }

  /* ------------- UI (refactored to screenshot style) ------------- */
  return (
    <Shell title="Logistics Console" active="dashboard">
      {/* Top Cards (Order + Visa) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="shadow-sm">
          <CardHeader className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">🇺🇸 United States of America</h3>
              <p className="text-sm text-gray-500">Order ID: SMV-USA-00633</p>
              <p className="text-sm text-gray-500">Travel Dates: Oct 09 – Oct 16</p>
              <p className="text-sm text-gray-500">Travellers: 1</p>
            </div>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              Classify Documents
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-gray-600 space-y-1">
            <p><strong>Note from TA:</strong> Questionnaire link</p>
            <p><strong>Remarks:</strong> Add new / View all</p>
            <p><strong>Created By:</strong> Hardik, Jul 10 04:52 PM</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold">Tourist Visa</h3>
              <Badge variant="outline" className="bg-blue-50 text-blue-600 mt-2">Ready to Submit</Badge>
            </div>
            <Button size="sm" variant="outline">Upload Documents</Button>
          </CardHeader>
          <CardContent className="text-sm text-gray-600 space-y-1">
            <p><strong>Travel Agency:</strong> ORGO.travel</p>
            <p><strong>Estimate:</strong> EST-USA-00633</p>
            <p><strong>Assignee:</strong> Sunder Upreti</p>
            <p className="text-blue-600 cursor-pointer">+ Add-ons</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="application" className="w-full">
        <TabsList className="bg-gray-100 rounded-lg p-1">
          <TabsTrigger value="application">Application</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="comms">Comms</TabsTrigger>
        </TabsList>

        <TabsContent value="application" className="mt-4">
          <Card>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left">
                  <tr>
                    <th className="p-2"><Checkbox ref={headerCheckboxRef} checked={allVisibleSelected} onCheckedChange={(val) => toggleSelectAllVisible(!!val)} /></th>
                    <th className="p-2">Traveller</th>
                    <th className="p-2">Application Status</th>
                    <th className="p-2">Visa Fee Category</th>
                    <th className="p-2">Jurisdiction</th>
                    <th className="p-2">Embassy Ref ID</th>
                    <th className="p-2">Appointment</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r: any) => (
                    <tr key={r._id} className="border-b hover:bg-gray-50">
                      <td className="p-2"><Checkbox checked={selectedIds.has(String(r._id))} onCheckedChange={(val) => toggleRow(String(r._id), !!val)} /></td>
                      <td className="p-2 font-medium">{r.passport_number}</td>
                      <td className="p-2"><Badge variant="secondary" className="bg-yellow-100 text-yellow-700">{r.status || "—"}</Badge></td>
                      <td className="p-2 text-blue-600 cursor-pointer">+ Add</td>
                      <td className="p-2">{r.jurisdiction || "---"}</td>
                      <td className="p-2"><Button size="sm" variant="outline">Add Embassy Ref ID</Button></td>
                      <td className="p-2">{fmtDateTime(r.appointment_date) || "Select Date"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card><CardContent>No documents uploaded yet.</CardContent></Card>
        </TabsContent>
        <TabsContent value="comms" className="mt-4">
          <Card><CardContent>Communication log here.</CardContent></Card>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
