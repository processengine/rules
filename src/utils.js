"use strict";

const DANGEROUS_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function assertSafeKey(key, path) {
  if (DANGEROUS_SEGMENTS.has(String(key))) {
    const error = new Error(`Dangerous key is not allowed at ${path}: ${key}`);
    error.code = "DANGEROUS_KEY";
    error.path = path;
    throw error;
  }
}

function assertSafePath(path) {
  const value = String(path || "");
  const cleaned = value.replace(/\[(\d+)\]/g, ".$1");
  for (const segment of cleaned.split(".")) {
    if (segment === "") continue;
    assertSafeKey(segment, `$path.${value}`);
  }
}

function isFlatPayloadCandidate(obj) {
  if (!isObject(obj)) return false;
  const keys = Object.keys(obj);
  return keys.some((key) => key.includes(".") || key.includes("[") || key === "__context");
}

function deepGet(obj, path) {
  if (!path || obj === null || typeof obj !== "object") return { ok: false, value: undefined };
  const raw = String(path);
  if (raw.startsWith("$context.")) {
    const contextKey = raw.slice("$context.".length);
    const ctx = obj.__context;
    if (!isObject(ctx) || !hasOwn(ctx, contextKey)) return { ok: false, value: undefined };
    return { ok: true, value: ctx[contextKey] };
  }
  return hasOwn(obj, raw) ? { ok: true, value: obj[raw] } : { ok: false, value: undefined };
}

function isEmptyValue(v) {
  return v === null || v === undefined || v === "";
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function parseStrictYMD(s) {
  if (typeof s !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toComparable(value) {
  const n = toNumber(value);
  if (n !== null) return { kind: "number", value: n };
  const d = parseStrictYMD(value);
  if (d) return { kind: "date", value: d.getTime() };
  return null;
}

function normalizeWhenExpr(when) {
  if (typeof when === "string") return { mode: "single", pred: when };
  if (isObject(when) && Array.isArray(when.all)) {
    if (when.all.length === 0) throw new Error("Invalid condition.when: all[] must be non-empty");
    return { mode: "all", items: when.all.map(normalizeWhenExpr) };
  }
  if (isObject(when) && Array.isArray(when.any)) {
    if (when.any.length === 0) throw new Error("Invalid condition.when: any[] must be non-empty");
    return { mode: "any", items: when.any.map(normalizeWhenExpr) };
  }
  throw new Error("Invalid condition.when: expected string or nested {all:[..]} or {any:[..]}");
}

function stepKind(step) {
  const keys = Object.keys(step);
  const present = ["rule", "pipeline", "condition"].filter((k) => keys.includes(k));
  assert(present.length === 1, `Step must contain exactly one of rule|pipeline|condition. Got keys: ${keys.join(",")}`);
  return present[0];
}

function makeTrace(traceArr, scope) {
  return function trace(message, data) {
    traceArr.push({ kind: "TRACE", message, data: Object.assign({ scope }, data || {}), ts: new Date().toISOString() });
  };
}

function isLibraryRef(ref) {
  return typeof ref === "string" && ref.startsWith("library.");
}

function scopeKeyFor(pipelineId, localName) {
  return `${pipelineId}.${localName}`;
}

function isWildcardField(field) {
  return typeof field === "string" && field.includes("[*]");
}

function escapeRegexLiteral(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wildcardPatternToRegex(pattern) {
  const parts = String(pattern).split("[*]");
  const regexBody = parts.map(escapeRegexLiteral).join("\\[(\\d+)\\]");
  return new RegExp(`^${regexBody}$`);
}

function expandWildcardKeys(pattern, payloadKeys) {
  const re = wildcardPatternToRegex(pattern);
  const matches = [];
  for (const k of payloadKeys) {
    const m = re.exec(k);
    if (m) matches.push({ key: k, indexes: m.slice(1).map(Number) });
  }
  matches.sort((a, b) => {
    for (let i = 0; i < Math.max(a.indexes.length, b.indexes.length); i += 1) {
      const diff = (a.indexes[i] || 0) - (b.indexes[i] || 0);
      if (diff !== 0) return diff;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return matches.map((x) => x.key);
}

function deepCloneJsonSafe(value, path = "$", seen = new WeakSet()) {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      const error = new Error(`Non-JSON-safe number at ${path}`);
      error.code = "NON_JSON_SAFE";
      error.path = path;
      throw error;
    }
    return value;
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol" || typeof value === "undefined") {
    const error = new Error(`Non-JSON-safe value at ${path}`);
    error.code = "NON_JSON_SAFE";
    error.path = path;
    throw error;
  }
  if (value instanceof Date || value instanceof Map || value instanceof Set || value instanceof RegExp) {
    const error = new Error(`Unsupported runtime value at ${path}`);
    error.code = "NON_JSON_SAFE";
    error.path = path;
    throw error;
  }
  if (seen.has(value)) {
    const error = new Error(`Cycle detected at ${path}`);
    error.code = "CYCLE_DETECTED";
    error.path = path;
    throw error;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item, index) => deepCloneJsonSafe(item, `${path}[${index}]`, seen));
  }
  if (typeof value === "object") {
    const out = Object.create(null);
    for (const key of Object.keys(value)) {
      assertSafeKey(key, `${path}.${key}`);
      out[key] = deepCloneJsonSafe(value[key], `${path}.${key}`, seen);
    }
    return out;
  }
  return value;
}

function flattenPayload(obj, prefix = "", result = Object.create(null)) {
  if (prefix === "") {
    obj = deepCloneJsonSafe(obj || {}, "$payload");
  }

  if (prefix === "" && isObject(obj) && hasOwn(obj, "__context")) {
    result.__context = deepCloneJsonSafe(obj.__context, "$payload.__context");
  }

  if (obj === null || typeof obj !== "object") {
    if (prefix !== "") result[prefix] = obj;
    return result;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0 && prefix !== "") {
      result[prefix] = [];
      return result;
    }
    obj.forEach((item, index) => {
      const key = prefix ? `${prefix}[${index}]` : `[${index}]`;
      flattenPayload(item, key, result);
    });
    return result;
  }

  for (const key of Object.keys(obj)) {
    if (prefix === "" && key === "__context") continue;
    assertSafeKey(key, prefix ? `${prefix}.${key}` : `$payload.${key}`);
    const next = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val === null || typeof val !== "object") {
      result[next] = val;
    } else {
      flattenPayload(val, next, result);
    }
  }

  return result;
}

function detectFlatNestedConflict(payload) {
  const keys = Object.keys(payload);
  const set = new Set(keys.filter((key) => key !== "__context"));
  for (const key of set) {
    assertSafePath(key);
    const normalized = key.replace(/\[(\d+)\]/g, ".$1");
    const parts = normalized.split(".");
    let current = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      current = current ? `${current}.${parts[i]}` : parts[i];
      if (set.has(current)) return key;
    }
  }
  return null;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    value.forEach((item) => deepFreeze(item));
    return value;
  }
  for (const inner of Object.values(value)) deepFreeze(inner);
  return value;
}

module.exports = {
  DANGEROUS_SEGMENTS,
  assert,
  isObject,
  hasOwn,
  deepGet,
  isEmptyValue,
  toComparable,
  normalizeWhenExpr,
  stepKind,
  makeTrace,
  isLibraryRef,
  scopeKeyFor,
  isWildcardField,
  expandWildcardKeys,
  flattenPayload,
  deepCloneJsonSafe,
  detectFlatNestedConflict,
  deepFreeze,
  assertSafeKey,
  assertSafePath,
  isFlatPayloadCandidate,
};
