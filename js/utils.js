// ============================================================
// Utilities — shared across the app
// ============================================================
// Every dataset (foods, nutrients, meals/ingredients) is keyed the
// same way so a value typed into any input, or read from any CSV
// column header, resolves to the same identity:
//   trim -> collapse whitespace -> lower case -> spaces become "_"
const Utils = (() => {
  function normalizeKey(raw) {
    if (raw === null || raw === undefined) return "";
    return String(raw)
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/ /g, "_")
      .replace(/[^a-z0-9_]/g, "");
  }

  // Turn a normalized key back into a friendly label for display,
  // e.g. "vitamin_c" -> "Vitamin C". Only used when we don't already
  // have a stored "display" form for that key.
  function prettify(key) {
    return String(key)
      .split("_")
      .filter(Boolean)
      .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
      .join(" ");
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // Basic set helpers used throughout the Venn / matching logic.
  function union(...sets) {
    const out = new Set();
    for (const s of sets) for (const v of s) out.add(v);
    return out;
  }
  function intersect(...sets) {
    if (sets.length === 0) return new Set();
    const [first, ...rest] = sets;
    const out = new Set();
    outer: for (const v of first) {
      for (const s of rest) if (!s.has(v)) continue outer;
      out.add(v);
    }
    return out;
  }
  function subtract(a, b) {
    const out = new Set();
    for (const v of a) if (!b.has(v)) out.add(v);
    return out;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  return { normalizeKey, prettify, debounce, uid, union, intersect, subtract, escapeHtml };
})();
