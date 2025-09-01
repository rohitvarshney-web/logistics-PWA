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

/* bulk statuses */
const BULK_STATUS_OPTIONS = [
  { value: 'DOCUMENTS_RECEIVED', label: 'Documents Received' },
  { value: 'APPLICATIONS_SUBMITTED', label: 'Applications Submitted' },
  { value: 'PASSPORT_RECEIVED', label: 'Passport Received' },
  { value: 'PASSPORT_COURIERED', label: 'Passport Couriered' },
];

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

  /* --- rows, pagination --- */
  const rows: any[] = result?.result?.data?.data || result?.rows || [];
  const total: number = result?.result?.data?.count ?? (Array.isArray(rows) ? rows.length : 0);
  const pageRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    if (rows.length > limit) return rows.slice(skip, skip + limit);
    return rows;
  }, [rows, limit, skip]);

  /* selection */
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

  /* ------------- UI (tailwind only, no shadcn) ------------- */
  return (
    <Shell title="Logistics Console" active="dashboard">
      {/* Top Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow p-4 border">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold">🇺🇸 United States of America</h3>
              <p className="text-sm text-gray-500">Order ID: SMV-USA-00633</p>
              <p className="text-sm text-gray-500">Travel Dates: Oct 09 – Oct 16</p>
              <p className="text-sm text-gray-500">Travellers: 1</p>
            </div>
            <button className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700">
              Classify Documents
            </button>
          </div>
          <div className="mt-3 text-sm text-gray-600 space-y-1">
            <p><strong>Note from TA:</strong> Questionnaire link</p>
            <p><strong>Remarks:</strong> Add new / View all</p>
            <p><strong>Created By:</strong> Hardik, Jul 10 04:52 PM</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-4 border">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold">Tourist Visa</h3>
              <span className="inline-block text-xs px-2 py-1 rounded bg-blue-100 text-blue-600 mt-2">
                Ready to Submit
              </span>
            </div>
            <button className="px-3 py-1 text-sm rounded border">Upload Documents</button>
          </div>
          <div className="mt-3 text-sm text-gray-600 space-y-1">
            <p><strong>Travel Agency:</strong> ORGO.travel</p>
            <p><strong>Estimate:</strong> EST-USA-00633</p>
            <p><strong>Assignee:</strong> Sunder Upreti</p>
            <p className="text-blue-600 cursor-pointer">+ Add-ons</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-2 bg-gray-100 rounded-lg p-1 w-fit">
          <button className="px-4 py-2 rounded bg-white shadow-sm text-sm font-medium">Application</button>
          <button className="px-4 py-2 rounded text-sm font-medium text-gray-600 hover:bg-white">Documents</button>
          <button className="px-4 py-2 rounded text-sm font-medium text-gray-600 hover:bg-white">Comms</button>
        </div>

        {/* Application Tab Content */}
        <div className="mt-4 bg-white rounded-xl shadow border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-left">
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
                {pageRows.map((r: any) => (
                  <tr key={r._id} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(String(r._id))}
                        onChange={(e) => toggleRow(String(r._id), e.target.checked)}
                      />
                    </td>
                    <td className="p-2 font-medium">{r.passport_number}</td>
                    <td className="p-2">
                      <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-700">
                        {r.status || '—'}
                      </span>
                    </td>
                    <td className="p-2 text-blue-600 cursor-pointer">+ Add</td>
                    <td className="p-2">{r.jurisdiction || '---'}</td>
                    <td className="p-2">
                      <button className="px-2 py-1 text-xs border rounded">Add Embassy Ref ID</button>
                    </td>
                    <td className="p-2">{fmtDateTime(r.appointment_date) || 'Select Date'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
