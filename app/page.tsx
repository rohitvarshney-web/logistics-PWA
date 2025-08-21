'use client';
import { useEffect, useRef, useState } from 'react';
import { extractPassportNumberFromOCR } from './lib/mrz';
import type { LogisticsOrder, LogisticsStatus } from './types';

const loadTesseract = () => import('tesseract.js').then(m => m);

export default function Home() {
  const [tab, setTab] = useState<'scan'|'search'>('scan');
  const [busy, setBusy] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [orderId, setOrderId] = useState('');
  const [results, setResults] = useState<LogisticsOrder[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dropRef.current; if (!el) return;
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const onDrop = async (e: DragEvent) => { prevent(e); const f=e.dataTransfer?.files?.[0]; if (f) await handleImage(f); };
    ['dragenter','dragover','dragleave','drop'].forEach(n=>el.addEventListener(n, prevent as any));
    el.addEventListener('drop', onDrop as any);
    return () => { ['dragenter','dragover','dragleave','drop'].forEach(n=>el.removeEventListener(n, prevent as any)); el.removeEventListener('drop', onDrop as any); };
  }, []);

  async function handleImage(file: File) {
    setBusy(true); setOcrText('');
    try {
      const T = await loadTesseract();
      const { data } = await T.recognize(file, 'eng');
      setOcrText(data.text||'');
      const p = extractPassportNumberFromOCR(data.text||'');
      if (p) { setPassportNumber(p); await searchByPassport(p); setTab('search'); }
      else alert('Could not detect passport number. Try manual search.');
    } finally { setBusy(false); }
  }

  async function searchByPassport(passport: string) {
    if (!passport) return; setBusy(true);
    try {
      const r = await fetch('/api/smv/search-passport', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ passportNumber: passport }) });
      const js = await r.json();
      setResults(normalizeResults(js));
    } finally { setBusy(false); }
  }

  async function searchByOrder(id: string) {
    if (!id) return; setBusy(true);
    try {
      const r = await fetch('/api/smv/search-order', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ orderId: id }) });
      const js = await r.json();
      setResults(normalizeResults(js));
    } finally { setBusy(false); }
  }

  function normalizeResults(js: any): LogisticsOrder[] {
    const arr = Array.isArray(js?.data) ? js.data : (js?.data ? [js.data] : Array.isArray(js) ? js : [js]);
    return arr.map((x:any):LogisticsOrder => ({
      orderId: String(x.orderId || x.id || x.order_id || 'UNKNOWN'),
      passportNumber: x.passportNumber || x.passport_no || x.passport || undefined,
      applicantName: x.applicantName || x.name || x.applicant_name || undefined,
      country: x.country || x.destination || undefined,
      currentStatus: x.currentStatus || x.status || undefined,
      statusHistory: x.statusHistory || x.timeline || [],
      raw: x,
    }));
  }

  async function onUpdateStatus(orderId: string, status: LogisticsStatus) {
    const note = prompt(`Add a note for ${status} (optional):`) || '';
    setBusy(true);
    try {
      const r = await fetch('/api/smv/status-update', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ orderId, status, note }) });
      const js = await r.json();
      if (!r.ok) { alert(js?.error || 'Failed to update status'); return; }
      if (passportNumber) await searchByPassport(passportNumber);
      else if (orderId) await searchByOrder(orderId);
      alert('Status updated');
    } finally { setBusy(false); }
  }

  const statuses: LogisticsStatus[] = ['documents_received','order_submitted','visa_received','passports_dispatched'];

  return (
    <main className="container">
      <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
        <div><h1>SMV Logistics Console</h1><p className="label">Scan passports, search orders, and update statuses</p></div>
        <form action="/api/auth/logout" method="post"><button className="btn">Logout</button></form>
      </div>

      <div className="row" style={{margin:'16px 0'}}>
        <button className={"btn " + (tab==='scan'?'primary':'')} onClick={()=>setTab('scan')}>Scan / Upload</button>
        <button className={"btn " + (tab==='search'?'primary':'')} onClick={()=>setTab('search')}>Search</button>
      </div>

      {tab==='scan' && (
        <section className="card">
          <h3>Mobile camera / Upload</h3>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={e=>{const f=e.target.files?.[0]; if (f) handleImage(f);}} />
          {ocrText && (<><div className="label" style={{marginTop:12}}>OCR text (debug)</div><pre style={{maxHeight:180}}>{ocrText}</pre></>)}
        </section>
      )}

      {tab==='search' && (
        <section className="card">
          <div className="row">
            <div style={{flex:1}}>
              <label className="label">Passport Number</label>
              <input className="input" value={passportNumber} onChange={e=>setPassportNumber(e.target.value.toUpperCase())} placeholder="Enter passport no." />
            </div>
            <button className="btn primary" onClick={()=>searchByPassport(passportNumber)} disabled={!passportNumber || busy}>Search</button>
          </div>
          <div style={{height:12}}></div>
          <div className="row">
            <div style={{flex:1}}>
              <label className="label">Order ID</label>
              <input className="input" value={orderId} onChange={e=>setOrderId(e.target.value)} placeholder="Enter order ID" />
            </div>
            <button className="btn" onClick={()=>searchByOrder(orderId)} disabled={!orderId || busy}>Search</button>
          </div>
          <div style={{height:16}}></div>
          <h3>Results</h3>
          {results.length===0 && <p className="label">No results yet.</p>}
          {results.map(r => (
            <div key={r.orderId} className="card" style={{marginTop:12}}>
              <div className="row" style={{justifyContent:'space-between'}}>
                <div><div><strong>Order:</strong> {r.orderId}</div><div className="label">Applicant: {r.applicantName || '—'} • Passport: {r.passportNumber || '—'} • {r.country || ''}</div></div>
                <div className="label">{r.currentStatus || 'unknown'}</div>
              </div>
              <div className="row" style={{marginTop:8}}>
                {statuses.map(s => (<button key={s} className="btn" onClick={()=>onUpdateStatus(r.orderId, s)}>{s.replace('_',' ')}</button>))}
              </div>
              <details style={{marginTop:8}}><summary className="label">Raw</summary><pre>{JSON.stringify(r.raw ?? {}, null, 2)}</pre></details>
            </div>
          ))}
        </section>
      )}

      {busy && <p className="label" style={{marginTop:12}}>Working…</p>}
    </main>
  );
}
