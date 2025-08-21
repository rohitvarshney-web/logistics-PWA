// inside your component
const [passport, setPassport] = useState('');
const [orderId, setOrderId]   = useState('');
const [resJson, setResJson]   = useState<any>(null);
const [err, setErr]           = useState<string|null>(null);

async function searchByPassport() {
  setErr(null); setResJson(null);
  const r = await fetch('/api/smv/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passport }), // or { searchText: passport }
  });
  const js = await r.json().catch(()=>({}));
  if (!r.ok) setErr(js.error || js?.upstreamBody?.message || 'Search failed');
  setResJson(js);
}

async function searchByOrder() {
  setErr(null); setResJson(null);
  const r = await fetch('/api/smv/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }), // or { searchText: orderId }
  });
  const js = await r.json().catch(()=>({}));
  if (!r.ok) setErr(js.error || js?.upstreamBody?.message || 'Search failed');
  setResJson(js);
}
