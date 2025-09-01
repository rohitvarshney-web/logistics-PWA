'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Shell, { StatusPill } from '../../components/ui/Shell';

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

/* address cell */
function AddressCell({
  label,
  text,
  maxWidth = 280,
}: {
  label: string;
  text?: string;
  maxWidth?: number;
}) {
  const val = (text ?? '').trim();
  return (
    <td className="px-3 py-2 align-top">
      <div style={{ maxWidth }}>
        <div
          title={val || label}
          className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-gray-700"
          style={{ opacity: val ? 1 : 0.6 }}
        >
          {val || '—'}
        </div>
        {val && (
          <details className="mt-1">
            <summary className="text-xs text-blue-600 cursor-pointer">
              Expand
            </summary>
            <div className="mt-2 p-2 border rounded-md bg-gray-50 text-sm max-h-60 overflow-auto whitespace-pre-wrap break-words">
              {val}
            </div>
          </details>
        )}
      </div>
    </td>
  );
}

/* bulk statuses */
const BULK_STATUS_OPTIONS = [
  { value: 'DOCUMENTS_RECEIVED', label: 'Documents Received' },
  { value: 'APPLICATIONS_SUBMITTED', label: 'Applications Submitted' },
  { value: 'PASSPORT_RECEIVED', label: 'Passport Received' },
  { value: 'PASSPORT_COURIERED', label: 'Passport Couriered' },
];

/* regex + keys */
const PASSPORT_REGEX = /\b([A-Z0-9]{7,10})\b/i;
const PASSPORT_KEYS = ['passport', 'passport_number', 'passport no', 'passportno', 'pp_no', 'pp', 'ppnumber'];
const ORDER_KEYS = ['order', 'order_id', 'order id', 'smv_order_id', 'smv order id', 'reference', 'ref', 'ref_no'];

/* ---------- component ---------- */
export default function DashboardPage() {
  /* --- state (same as your code) --- */
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
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([]);
  const [bulkRows, setBulkRows] = useState<Record<string, any>[]>([]);
  const [bulkPassportCol, setBulkPassportCol] = useState<string>('');
  const [bulkOrderCol, setBulkOrderCol] = useState<string>('');
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, running: 0, failed: 0 });
  const [bulkFailures, setBulkFailures] = useState<Array<{ input: string; reason: string }>>([]);

  /* --- debounced values --- */
  const dPassport = useDebounced(passport, 500);
  const dOrderId = useDebounced(orderId, 500);
  const dLimit = useDebounced(limit, 300);
  const dSkip = useDebounced(skip, 300);
  const dStatusCsv = useDebounced(statusCsv, 500);
  const dTypeCsv = useDebounced(typeCsv, 500);
  const dCurrentTask = useDebounced(currentTask, 500);

  const optionalBody = useMemo(() => {
    const body: Record<string, any> = { limit: dLimit, skip: dSkip, sort: ['created_at#!#-1'] };
    const status = dStatusCsv.split(',').map((s) => s.trim()).filter(Boolean);
    const types = dTypeCsv.split(',').map((s) => s.trim()).filter(Boolean);
    if (status.length) body.status = status;
    if (types.length) body.type = types;
    if (dCurrentTask !== '') body.currentTask = dCurrentTask || null;
    return body;
  }, [dLimit, dSkip, dStatusCsv, dTypeCsv, dCurrentTask]);

  /* --- data extraction --- */
  const rows: any[] = result?.result?.data?.data || result?.rows || [];
  const total: number = result?.result?.data?.count ?? (Array.isArray(rows) ? rows.length : 0);
  const pageRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    if (rows.length > limit) return rows.slice(skip, skip + limit);
    return rows;
  }, [rows, limit, skip]);

  const showingFrom = pageRows.length ? skip + 1 : 0;
  const showingTo = pageRows.length ? skip + pageRows.length : 0;

  const visibleIds = pageRows.map((r) => String(r._id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  /* --- UI --- */
  return (
    <Shell title="Logistics Console" active="dashboard">
      {/* 🔹 Top Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <button className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200" onClick={() => setBulkOpen(true)}>
          Bulk Search
        </button>
        <button className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200" onClick={() => setScanOpen(true)}>
          Scan / Upload
        </button>
        <label className="flex items-center gap-1 text-sm ml-auto">
          <input type="checkbox" checked={autoSearch} onChange={(e) => setAutoSearch(e.target.checked)} />
          Auto-search
        </label>
        <button className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200">Logout</button>
      </div>

      {/* 🔹 Filters + Pagination */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border shadow-sm p-4">
          <h3 className="text-sm font-semibold mb-2">Search</h3>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded px-3 py-1.5 text-sm"
              placeholder="e.g. W1184034"
              value={passport}
              onChange={(e) => setPassport(e.target.value)}
            />
            <button className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white">Search</button>
          </div>
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-4">
          <h3 className="text-sm font-semibold mb-2">Filters (optional)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm">Status (CSV)</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={statusCsv} onChange={(e) => setStatusCsv(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm">Type (CSV)</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={typeCsv} onChange={(e) => setTypeCsv(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm">Current Task</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={currentTask} onChange={(e) => setCurrentTask(e.target.value)} />
            </div>
          </div>
        </section>
      </div>

      {/* 🔹 Results + Bulk Toolbar */}
      <section className="bg-white rounded-xl border shadow-sm p-4 mt-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold">Results</h3>
          <div className="flex gap-2 items-center">
            <span className="text-sm">{selectedIds.size} selected</span>
            <select className="border rounded px-2 py-1 text-sm" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              <option value="">Update logistics status…</option>
              {BULK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white">Apply</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">SMV Order</th>
                <th className="p-2">Passport</th>
                <th className="p-2">Type</th>
                <th className="p-2">Status</th>
                <th className="p-2">Logistics Status</th>
                <th className="p-2">Assigned For</th>
                <th className="p-2">Appointment</th>
                <th className="p-2">Travel End</th>
                <th className="p-2">Pickup</th>
                <th className="p-2">Drop</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r: any) => (
                <tr key={r._id} className="border-t hover:bg-gray-50">
                  <td className="p-2"><input type="checkbox" /></td>
                  <td className="p-2">{r.smv_order_id}</td>
                  <td className="p-2 font-semibold">{r.passport_number}</td>
                  <td className="p-2">{r.type}</td>
                  <td className="p-2"><StatusPill kind="blue">{r.status}</StatusPill></td>
                  <td className="p-2"><StatusPill kind="gray">{r.logistics_status}</StatusPill></td>
                  <td className="p-2">{r.assigned_for}</td>
                  <td className="p-2">{fmtDateTime(r.appointment_date)}</td>
                  <td className="p-2">{fmtDateOnly(r.travel_end_date)}</td>
                  <AddressCell label="Pickup Address" text={r.pickup_address} />
                  <AddressCell label="Drop Address" text={r.drop_address} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 🔹 Developer Tools */}
      <section className="bg-white rounded-xl border shadow-sm p-4 mt-6">
        <h3 className="text-sm font-semibold">Developer Tools</h3>
        {result && (
          <details className="mt-2">
            <summary className="cursor-pointer text-blue-600">Debug / Raw JSON</summary>
            <pre className="text-xs bg-gray-50 p-2 rounded mt-2">{JSON.stringify(result, null, 2)}</pre>
          </details>
        )}
      </section>
    </Shell>
  );
}
