'use strict';
function deepGet(obj, path) {
  if (!path || obj === null || typeof obj !== 'object') return { ok: false, value: undefined };
  const raw = String(path);
  if (raw.startsWith('$context.')) {
    const key = raw.slice('$context.'.length);
    const ctx = obj.__context;
    if (!ctx || typeof ctx !== 'object' || !Object.prototype.hasOwnProperty.call(ctx, key)) return { ok: false, value: undefined };
    return { ok: true, value: ctx[key] };
  }
  return Object.prototype.hasOwnProperty.call(obj, raw) ? { ok: true, value: obj[raw] } : { ok: false, value: undefined };
}
function isEmptyValue(v) { return v === null || v === undefined || v === ''; }
function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
}
function parseStrictYMD(s) {
  if (typeof s !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
function toComparable(value) {
  const n = toNumber(value); if (n !== null) return { kind: 'number', value: n };
  const d = parseStrictYMD(value); if (d) return { kind: 'date', value: d.getTime() };
  return null;
}
module.exports={ deepGet, isEmptyValue, toComparable };
