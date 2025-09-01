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

/* bulk statuses */
const BULK_STATUS_OPTIONS = [
  { value: 'DOCUMENTS_RECEIVED', label: 'Documents Received' },
  { value: 'APPLICATIONS_SUBMITTED', label: 'Applications Submitted' },
  { value: 'PASSPORT_RECEIVED', label: 'Passport Received' },
  { value: 'PASSPORT_COURIERED', label: 'Passport Couriered' },
];

/* passport regex */
const PASSPORT_REGEX = /\b([A-Z0-9]{7,10})\b/i;
const PASSPORT_KEYS = ['passport', 'passport_number', 'passport no', 'passportno', 'pp_no', 'pp', 'ppnumber'];
const ORDER_KEYS = ['order', 'order_id', 'order id', 'smv_order_id', 'smv order id', 'reference', 'ref', 'ref_no'];

/* ---------- component ---------- */
export default function DashboardPage() {
  /* inputs */
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

  /* selection */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  /* logistics state */
  const [localStatus, setLocalStatus] = useState<Map<string, string>>(new Map());
  const lastChangeRef = useRef<{ prev: Map<string, string | undefined>; ids: Set<string> } | null>(null);
  const [bulkStatus, setBulkStatus] = useState<string>('');

  /* scan/upload */
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* bulk file */
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([]);
  const [bulkRows, setBulkRows] = useState<Record<string, any>[]>([]);
  const [bulkPassportCol, setBulkPassportCol] = useState<string>('');
  const [bulkOrderCol, setBulkOrderCol] = useState<string>('');
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, running: 0, failed: 0 });
  const [bulkFailures, setBulkFailures] = useState<Array<{ input: string; reason: string }>>([]);

  /* debounced */
  const dPassport = useDebounced(passport, 500);
  const dOrderId = useDebounced(orderId, 500);
  const dLimit = useDebounced(limit, 300);
  const dSkip = useDebounced(skip, 300);
  const dStatusCsv = useDebounced(statusCsv, 500);
  const dTypeCsv = useDebounced(typeCsv, 500);
  const dCurrentTask = useDebounced(currentTask, 500);

  /* data extraction */
  const rows: any[] = result?.result?.data?.data || result?.rows || [];
  const total: number = result?.result?.data?.count ?? (Array.isArray(rows) ? rows.length : 0);
  const pageRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    if (rows.length > limit) return rows.slice(skip, skip + limit);
    return rows;
  }, [rows, limit, skip]);

  const visibleIds = pageRows.map((r) => String(r._id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

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

  /* ----------------- UI ----------------- */
  return (
    <Shell
      title="Logistics Console"
      active="dashboard"
      rightActions={
        <div className="flex items-center gap-3">
          <button className="px-3 py-1.5 text-sm border rounded-lg bg-white hover:bg-gray-50" onClick={() => setBulkOpen(true)}>
            Bulk Search
          </button>
          <button className="px-3 py-1.5 text-sm border rounded-lg bg-white hover:bg-gray-50" onClick={() => setScanOpen(true)}>
            Scan / Upload
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={autoSearch} onChange={(e) => setAutoSearch(e.target.checked)} /> Auto-search
          </label>
          <button className="px-3 py-1.5 text-sm border rounded-lg text-red-600">Logout</button>
        </div>
      }
    >
      {/* Top summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <span>🇺🇸</span> United States of America
              </h3>
              <p className="text-sm text-gray-600">Order ID: SMV-USA-00633</p>
              <p className="text-sm text-gray-600">Travel Dates: Oct 09 – Oct 16</p>
              <p className="text-sm text-gray-600">Travellers: 1</p>
            </div>
            <button className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
              Classify Documents
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-base font-semibold">Tourist Visa</h3>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 mt-2">
                Ready to Submit
              </span>
            </div>
            <button className="px-3 py-1.5 text-sm border rounded-lg bg-gray-100 hover:bg-gray-200">
              Upload Documents
            </button>
          </div>
          <div className="mt-3 text-sm text-gray-600 space-y-1">
            <p><strong>Travel Agency:</strong> ORGO.travel</p>
            <p><strong>Estimate:</strong> EST-USA-00633</p>
            <p><strong>Assignee:</strong> Sunder Upreti</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="flex gap-6 text-sm">
          <button className="pb-2 border-b-2 border-blue-600 text-blue-600 font-medium">
            Application
          </button>
          <button className="pb-2 text-gray-600 hover:text-gray-800">Documents</button>
          <button className="pb-2 text-gray-600 hover:text-gray-800">Comms</button>
        </nav>
      </div>

      {/* Traveller Table */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="flex justify-between items-center px-4 py-2 border-b">
          <h3 className="text-sm font-medium">Travellers</h3>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 text-sm border rounded-lg">+ Add Traveller</button>
            <button className="px-3 py-1.5 text-sm border rounded-lg">Wallet Details</button>
            <button className="px-3 py-1.5 text-sm border rounded-lg bg-blue-600 text-white">Complete Order</button>
          </div>
        </div>
        <table className="w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">
                <input
                  type="checkbox"
                  ref={headerCheckboxRef}
                  checked={allVisibleSelected}
                  onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                />
              </th>
              <th className="p-2">Traveller</th>
              <th className="p-2">Application Status</th>
              <th className="p-2">Visa Fee Category</th>
              <th className="p-2">Jurisdiction</th>
              <th className="p-2">Embassy Ref ID</th>
              <th className="p-2">Appointment</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r: any) => {
              const id = String(r._id);
              return (
                <tr key={id} className="hover:bg-gray-50">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(id)}
                      onChange={(e) => toggleRow(id, e.target.checked)}
                    />
                  </td>
                  <td className="p-2 font-medium">{r.passport_number}</td>
                  <td className="p-2">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                      Ready to Submit
                    </span>
                  </td>
                  <td className="p-2 text-blue-600 cursor-pointer">+ Add</td>
                  <td className="p-2">---</td>
                  <td className="p-2">
                    <button className="px-2 py-1 text-xs border rounded">Add Embassy Ref ID</button>
                  </td>
                  <td className="p-2 text-gray-500">Select Date</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
