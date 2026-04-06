const DANGEROUS_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

export function assertSafeKey(key, path) {
  if (DANGEROUS_SEGMENTS.has(String(key))) {
    const error = new Error(`Dangerous key is not allowed at ${path}: ${key}`);
    error.code = 'DANGEROUS_KEY';
    error.path = path;
    throw error;
  }
}

export function assertSafePath(path) {
  const value = String(path || '');
  const cleaned = value.replace(/\[(\d+)\]/g, '.$1');
  for (const segment of cleaned.split('.')) {
    if (!segment) continue;
    assertSafeKey(segment, `$path.${value}`);
  }
}

export function deepCloneJsonSafe(value, path = '$', seen = new WeakSet()) {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      const error = new Error(`Non-JSON-safe number at ${path}`);
      error.code = 'NON_JSON_SAFE';
      error.path = path;
      throw error;
    }
    return value;
  }
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') {
    const error = new Error(`Non-JSON-safe value at ${path}`);
    error.code = 'NON_JSON_SAFE';
    error.path = path;
    throw error;
  }
  if (value instanceof Date || value instanceof Map || value instanceof Set || value instanceof RegExp) {
    const error = new Error(`Unsupported runtime value at ${path}`);
    error.code = 'NON_JSON_SAFE';
    error.path = path;
    throw error;
  }
  if (seen.has(value)) {
    const error = new Error(`Cycle detected at ${path}`);
    error.code = 'CYCLE_DETECTED';
    error.path = path;
    throw error;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item, index) => deepCloneJsonSafe(item, `${path}[${index}]`, seen));
  }
  const output = Object.create(null);
  for (const key of Object.keys(value)) {
    assertSafeKey(key, `${path}.${key}`);
    output[key] = deepCloneJsonSafe(value[key], `${path}.${key}`, seen);
  }
  return output;
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  if (Array.isArray(value)) value.forEach((item) => deepFreeze(item));
  else Object.values(value).forEach((item) => deepFreeze(item));
  return value;
}

export function deepGet(target, path) {
  if (!path || target === null || typeof target !== 'object') return { ok: false, value: undefined };
  const raw = String(path);
  if (raw.startsWith('$context.')) {
    const key = raw.slice('$context.'.length);
    const ctx = target.__context;
    if (!isObject(ctx) || !hasOwn(ctx, key)) return { ok: false, value: undefined };
    return { ok: true, value: ctx[key] };
  }
  return hasOwn(target, raw) ? { ok: true, value: target[raw] } : { ok: false, value: undefined };
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function parseStrictYMD(value) {
  if (typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function makeComparable(value) {
  const number = toNumber(value);
  if (number !== null) return { kind: 'number', value: number };
  const date = parseStrictYMD(value);
  if (date) return { kind: 'date', value: date.getTime() };
  return null;
}

export function normalizeWhenExpr(when) {
  if (typeof when === 'string') return { mode: 'single', pred: when };
  if (isObject(when) && Array.isArray(when.all)) {
    if (when.all.length === 0) throw new Error('Invalid condition.when: all[] must be non-empty');
    return { mode: 'all', items: when.all.map(normalizeWhenExpr) };
  }
  if (isObject(when) && Array.isArray(when.any)) {
    if (when.any.length === 0) throw new Error('Invalid condition.when: any[] must be non-empty');
    return { mode: 'any', items: when.any.map(normalizeWhenExpr) };
  }
  throw new Error('Invalid condition.when: expected string or nested {all:[..]} or {any:[..]}');
}

export function stepKind(step) {
  const keys = Object.keys(step);
  const present = ['rule', 'pipeline', 'condition'].filter((key) => keys.includes(key));
  assert(present.length === 1, `Step must contain exactly one of rule|pipeline|condition. Got keys: ${keys.join(',')}`);
  return present[0];
}

export function isLibraryRef(ref) {
  return typeof ref === 'string' && ref.startsWith('library.');
}

export function scopeKeyFor(pipelineId, localName) {
  return `${pipelineId}.${localName}`;
}

export function isWildcardField(field) {
  return typeof field === 'string' && field.includes('[*]');
}

function escapeRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\$&');
}

function wildcardPatternToRegex(pattern) {
  const parts = String(pattern).split('[*]');
  const body = parts.map(escapeRegexLiteral).join('\[(\d+)\]');
  return new RegExp(`^${body}$`);
}

export function expandWildcardKeys(pattern, payloadKeys) {
  const regex = wildcardPatternToRegex(pattern);
  const matches = [];
  for (const key of payloadKeys) {
    const match = regex.exec(key);
    if (match) matches.push({ key, indexes: match.slice(1).map(Number) });
  }
  matches.sort((left, right) => {
    for (let index = 0; index < Math.max(left.indexes.length, right.indexes.length); index += 1) {
      const diff = (left.indexes[index] || 0) - (right.indexes[index] || 0);
      if (diff !== 0) return diff;
    }
    return left.key.localeCompare(right.key);
  });
  return matches.map((item) => item.key);
}

export function flattenPayload(value, prefix = '', result = Object.create(null)) {
  if (prefix === '') value = deepCloneJsonSafe(value || {}, '$payload');
  if (prefix === '' && isObject(value) && hasOwn(value, '__context')) result.__context = deepCloneJsonSafe(value.__context, '$payload.__context');
  if (value === null || typeof value !== 'object') {
    if (prefix) result[prefix] = value;
    return result;
  }
  if (Array.isArray(value)) {
    if (value.length === 0 && prefix) {
      result[prefix] = [];
      return result;
    }
    value.forEach((item, index) => {
      const key = prefix ? `${prefix}[${index}]` : `[${index}]`;
      flattenPayload(item, key, result);
    });
    return result;
  }
  for (const key of Object.keys(value)) {
    if (prefix === '' && key === '__context') continue;
    assertSafeKey(key, prefix ? `${prefix}.${key}` : `$payload.${key}`);
    const next = prefix ? `${prefix}.${key}` : key;
    const item = value[key];
    if (item === null || typeof item !== 'object') result[next] = item;
    else flattenPayload(item, next, result);
  }
  return result;
}

export function detectFlatNestedConflict(payload) {
  const keys = Object.keys(payload);
  const set = new Set(keys.filter((key) => key !== '__context'));
  for (const key of set) {
    assertSafePath(key);
    const normalized = key.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalized.split('.');
    let current = '';
    for (let index = 0; index < parts.length - 1; index += 1) {
      current = current ? `${current}.${parts[index]}` : parts[index];
      if (set.has(current)) return key;
    }
  }
  return null;
}
