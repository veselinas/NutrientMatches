// ============================================================
// Minimal CSV parser / writer (handles quoted fields with commas)
// ============================================================
const CSV = (() => {
  function parse(text) {
    if (!text || !text.trim()) return { header: [], rows: [] };
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const pushField = () => { row.push(field); field = ""; };
    const pushRow = () => { rows.push(row); row = []; };

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") pushField();
        else if (c === "\n") { pushField(); pushRow(); }
        else if (c === "\r") { /* skip, \n handles it */ }
        else field += c;
      }
    }
    // flush trailing field/row
    if (field.length || row.length) { pushField(); pushRow(); }
    // drop fully-empty trailing rows
    while (rows.length && rows[rows.length - 1].every((v) => v === "")) rows.pop();

    const header = rows.shift() || [];
    return { header, rows };
  }

  function escapeField(v) {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function stringify(header, rows) {
    const lines = [header.map(escapeField).join(",")];
    for (const r of rows) lines.push(r.map(escapeField).join(","));
    return lines.join("\n") + "\n";
  }

  return { parse, stringify };
})();
