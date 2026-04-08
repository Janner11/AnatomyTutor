export function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function toFixedArray(vec3, digits = 4) {
  if (!vec3) return null;
  return [
    Number(vec3.x.toFixed(digits)),
    Number(vec3.y.toFixed(digits)),
    Number(vec3.z.toFixed(digits)),
  ];
}

export function toFixedArray2(vec2, digits = 4) {
  if (!vec2) return null;
  return [Number(vec2.x.toFixed(digits)), Number(vec2.y.toFixed(digits))];
}

export function buildNodePath(node) {
  const parts = [];
  let current = node;
  while (current) {
    parts.push(current.name || current.type || "unnamed");
    current = current.parent;
  }
  return parts.reverse();
}

export function getAncestors(node) {
  const ancestors = [];
  let current = node ? node.parent : null;
  while (current) {
    ancestors.push(current);
    current = current.parent;
  }
  return ancestors;
}

export function uniqueNonEmpty(items) {
  const out = [];
  const seen = new Set();
  items.forEach((item) => {
    if (!item) return;
    const key = String(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  });
  return out;
}

export function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
