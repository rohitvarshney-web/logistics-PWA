export function extractPassportNumberFromOCR(text: string): string | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i], b = lines[i+1];
    if (a.length>=40 && a.length<=46 && b.length>=40 && b.length<=46) {
      const ltA=(a.match(/</g)||[]).length, ltB=(b.match(/</g)||[]).length;
      if (ltA>5 && ltB>5) {
        const candidate = b.slice(0,10).replace(/</g,'').toUpperCase();
        if (/^[A-Z0-9]{7,10}$/.test(candidate)) return candidate.slice(0,9);
      }
    }
  }
  const tokens = text.toUpperCase().match(/[A-Z0-9]{7,9}/g) || [];
  if (tokens.length) {
    const freq: Record<string, number> = {};
    tokens.forEach(t => freq[t]=(freq[t]||0)+1);
    return tokens.sort((a,b)=>(freq[b]-freq[a])||(b.length-a.length))[0];
  }
  return null;
}
