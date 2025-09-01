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

      {/* ------------------ Results + Bulk Toolbar ------------------ */}
      <section className="bg-white rounded-xl border shadow-sm p-4 mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Results</h3>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">{selectedIds.size} selected</span>

            <select
              className="border rounded-lg px-2 py-1 text-sm"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
            >
              <option value="">Update logistics status…</option>
              {BULK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <button
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={() => applyBulkStatus()}
              disabled={!bulkStatus || selectedIds.size === 0}
            >
              Apply to selected
            </button>

            <button
              className="px-3 py-1.5 text-sm border rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              onClick={() => resetToPrevious()}
              disabled={!lastChangeRef.current}
            >
              Reset to previous
            </button>

            {selectedIds.size > 0 && (
              <button
                className="px-3 py-1.5 text-sm border rounded-lg text-red-600 hover:bg-red-50"
                onClick={() => clearSelection()}
              >
                Clear selection
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 mt-2">{error}</p>
        )}

        {pageRows && pageRows.length > 0 ? (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm border-collapse divide-y divide-gray-200">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-2">
                    <input
                      type="checkbox"
                      ref={headerCheckboxRef}
                      checked={allVisibleSelected}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (checked) visibleIds.forEach((id) => next.add(id));
                          else visibleIds.forEach((id) => next.delete(id));
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th className="p-2">SMV Order</th>
                  <th className="p-2">Passport</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Logistics Status</th>
                  <th className="p-2">Assigned For</th>
                  <th className="p-2">Appointment</th>
                  <th className="p-2">Travel End</th>
                  <th className="p-2">Pickup Address</th>
                  <th className="p-2">Drop Address</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r: any) => {
                  const id = String(r._id);
                  const isSelected = selectedIds.has(id);
                  const apiStatus = (r.status ?? '').toString();

                  return (
                    <tr
                      key={id}
                      className={`border-t ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(id);
                              else next.delete(id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="p-2">{r.smv_order_id || ''}</td>
                      <td className="p-2 font-medium">{r.passport_number || ''}</td>
                      <td className="p-2">{r.type || ''}</td>
                      <td className="p-2">
                        <StatusPill kind={apiStatusKind(apiStatus)}>
                          {apiStatus || '—'}
                        </StatusPill>
                      </td>
                      <td className="p-2">
                        <StatusPill kind={logisticsKind(r)}>
                          {displayLogisticsStatus(r)}
                        </StatusPill>
                      </td>
                      <td className="p-2">{r.assigned_for || ''}</td>
                      <td className="p-2">{fmtDateTime(r.appointment_date)}</td>
                      <td className="p-2">{fmtDateOnly(r.travel_end_date)}</td>
                      <AddressCell label="Pickup Address" text={r.pickup_address} />
                      <AddressCell label="Drop Address" text={r.drop_address} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 mt-4">No results yet</p>
        )}
      </section>



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
      {/* ------------------ Top summary cards ------------------ */}
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

      {/* ------------------ Tabs ------------------ */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="flex gap-6 text-sm">
          <button className="pb-2 border-b-2 border-blue-600 text-blue-600 font-medium">
            Application
          </button>
          <button className="pb-2 text-gray-600 hover:text-gray-800">Documents</button>
          <button className="pb-2 text-gray-600 hover:text-gray-800">Comms</button>
        </nav>
      </div>

      {/* ------------------ Travellers Table ------------------ */}
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
                <input type="checkbox" ref={headerCheckboxRef} checked={allVisibleSelected} />
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
      {/* ------------------ Bulk Search ------------------ */}
      {bulkOpen && (
        <section className="bg-white rounded-xl border shadow-sm p-4 mt-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold">Bulk Search (CSV / XLSX)</h3>
            <button
              className="px-3 py-1.5 text-sm border rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={() => setBulkOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Upload file</label>
              <input
                type="file"
                accept=".csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setBulkHeaders([]);
                    setBulkRows([]);
                    setBulkPassportCol('');
                    setBulkOrderCol('');
                    setBulkFailures([]);
                    setBulkProgress({ done: 0, total: 0, running: 0, failed: 0 });
                    f.text().then(() => setBulkFile(f));
                  }
                }}
                className="mt-1 block w-full text-sm border rounded-lg px-2 py-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Auto-detects a <em>Passport</em> or <em>Order ID</em> column. You can override below.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={!bulkRows.length || loading === 'bulk'}
                onClick={() => runBulkSearch()}
              >
                {loading === 'bulk' ? 'Searching…' : 'Run Bulk Search'}
              </button>
              {bulkFailures.length > 0 && (
                <button
                  className="px-3 py-1.5 text-sm border rounded-lg bg-gray-100 hover:bg-gray-200"
                  onClick={() => downloadFailuresCsv()}
                >
                  Download failures
                </button>
              )}
            </div>
          </div>

          {bulkHeaders.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Passport column</label>
                <select
                  className="mt-1 block w-full border rounded-lg px-2 py-1 text-sm"
                  value={bulkPassportCol}
                  onChange={(e) => setBulkPassportCol(e.target.value)}
                >
                  <option value="">— none —</option>
                  {bulkHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Order ID column</label>
                <select
                  className="mt-1 block w-full border rounded-lg px-2 py-1 text-sm"
                  value={bulkOrderCol}
                  onChange={(e) => setBulkOrderCol(e.target.value)}
                >
                  <option value="">— none —</option>
                  {bulkHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ------------------ Scan / Upload ------------------ */}
      {scanOpen && (
        <section className="bg-white rounded-xl border shadow-sm p-4 mt-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold">Scan / Upload Passport</h3>
            <button
              className="px-3 py-1.5 text-sm border rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={() => setScanOpen(false)}
            >
              Close
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Take a clear photo of the passport page with the MRZ lines, or upload an existing image/PDF.
          </p>

          <div className="flex flex-wrap gap-6 mt-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setScanFile(f);
                  setScanPreview(f ? URL.createObjectURL(f) : null);
                }}
                className="block w-full text-sm border rounded-lg px-2 py-1"
              />
              <p className="text-xs text-gray-500 mt-1">On mobile, this opens the camera for a fresh capture.</p>
              <div className="flex gap-2 mt-3">
                <button
                  className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => extractAndSearch()}
                  disabled={!scanFile || scanBusy}
                >
                  {scanBusy ? 'Reading…' : 'Extract & Search'}
                </button>
                <button
                  className="px-3 py-1.5 text-sm border rounded-lg bg-gray-100 hover:bg-gray-200"
                  onClick={() => {
                    setScanFile(null);
                    setScanPreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

            {scanPreview && (
              <div className="border rounded-lg p-2 max-w-[280px]">
                <p className="text-xs text-gray-600 mb-2">Preview</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={scanPreview} alt="preview" className="rounded-md max-w-full h-auto" />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ------------------ Filters & Pagination ------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <section className="bg-white rounded-xl border shadow-sm p-4">
          <h3 className="text-sm font-semibold mb-2">Search</h3>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
              placeholder="e.g. W1184034"
              value={passport}
              onChange={(e) => setPassport(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchByPassport()}
            />
            <button
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={!passport.trim() || loading === 'passport'}
              onClick={() => searchByPassport()}
            >
              {loading === 'passport' ? 'Searching…' : 'Search'}
            </button>
          </div>
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-4">
          <h3 className="text-sm font-semibold mb-2">Filters (optional)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Status (CSV)</label>
              <input
                className="mt-1 w-full border rounded-lg px-2 py-1 text-sm"
                placeholder="e.g. UNASSIGNED,PENDING"
                value={statusCsv}
                onChange={(e) => setStatusCsv(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Type (CSV)</label>
              <input
                className="mt-1 w-full border rounded-lg px-2 py-1 text-sm"
                placeholder="e.g. SUBMISSION,PICKUP"
                value={typeCsv}
                onChange={(e) => setTypeCsv(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Current Task</label>
              <input
                className="mt-1 w-full border rounded-lg px-2 py-1 text-sm"
                placeholder="leave empty to omit"
                value={currentTask}
                onChange={(e) => setCurrentTask(e.target.value)}
              />
            </div>
          </div>

          <h3 className="text-sm font-semibold mt-4">Pagination</h3>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <label className="text-sm">Limit</label>
            <input
              type="number"
              min={1}
              className="w-20 border rounded-lg px-2 py-1 text-sm"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 10))}
            />
            <label className="text-sm">Skip</label>
            <input
              type="number"
              min={0}
              className="w-24 border rounded-lg px-2 py-1 text-sm"
              value={skip}
              onChange={(e) => setSkip(Math.max(0, Number(e.target.value) || 0))}
            />
            <button
              className="px-2 py-1 text-sm border rounded-lg"
              onClick={() => setSkip((s) => Math.max(0, s - limit))}
              disabled={skip === 0}
            >
              ◀ Prev
            </button>
            <button
              className="px-2 py-1 text-sm border rounded-lg"
              onClick={() => setSkip((s) => s + limit)}
              disabled={(total && skip + limit >= total) || (!total && rows.length < limit)}
            >
              Next ▶
            </button>
            <span className="text-sm text-gray-600 ml-2">
              {total
                ? `Showing ${showingFrom}-${showingTo} of ${total}`
                : rows.length
                ? `Showing ${rows.length}`
                : 'No results yet'}
            </span>
          </div>
        </section>
      </div>

      {/* ------------------ Developer Tools ------------------ */}
      <section className="bg-white rounded-xl border shadow-sm p-4 mt-6">
        <h3 className="text-sm font-semibold">Developer Tools</h3>
        {result && (
          <details className="mt-2">
            <summary className="text-sm text-blue-600 cursor-pointer">Debug / Raw JSON (proxy response)</summary>
            <pre className="mt-2 text-xs bg-gray-50 p-2 rounded-lg overflow-auto max-h-64">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        )}
      </section>

     
      {/* keep your existing code here, just add Tailwind classes like above */}
    </Shell>
  );
}
