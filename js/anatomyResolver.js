import { normalizeName, uniqueNonEmpty } from "./utils";

const DEFAULT_FALLBACKS = {
  circulatory: "heart",
  digestive: "stomach",
  lymphatic: null,
  "male-reproductive": null,
  muscular: null,
  nervous: "brain",
  respiratory: "lungs",
  skeletal: "skeleton",
  urinary: "kidney",
};

function createEntryMap(rawMap) {
  const direct = new Map();
  const normalized = new Map();

  Object.entries(rawMap || {}).forEach(([key, conceptId]) => {
    if (!key || key.startsWith("__")) return;
    direct.set(key, conceptId);
    normalized.set(normalizeName(key), conceptId);
  });

  return { direct, normalized };
}

function extractAliases(entry) {
  const aliases = [];
  if (!entry || typeof entry !== "object") return aliases;
  if (Array.isArray(entry.aliases)) aliases.push(...entry.aliases);
  if (typeof entry.alias === "string") aliases.push(entry.alias);
  return uniqueNonEmpty(aliases.map(String));
}

function createAliasMap(anatomyInfo) {
  const aliasMap = new Map();
  Object.entries(anatomyInfo).forEach(([conceptId, entry]) => {
    extractAliases(entry).forEach((alias) => {
      aliasMap.set(normalizeName(alias), conceptId);
    });
  });
  return aliasMap;
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error cargando JSON: ${url}`);
  }
  return response.json();
}

export function createAnatomyResolver({ dataBaseUrl, systems }) {
  let anatomyInfo = null;
  let aliasMap = new Map();
  const indexCache = new Map();

  async function ensureMasterData() {
    if (anatomyInfo) return;
    const url = `${dataBaseUrl}anatomyInfo.json`;
    anatomyInfo = await loadJson(url);
    aliasMap = createAliasMap(anatomyInfo);
  }

  async function ensureSystemIndex(system) {
    if (indexCache.has(system.id)) return;
    const raw = await loadJson(`${dataBaseUrl}${system.indexFile}`);
    indexCache.set(system.id, { raw, ...createEntryMap(raw) });
  }

  function findExactMatch(index, names) {
    for (const name of names) {
      if (index.direct.has(name)) {
        return {
          conceptId: index.direct.get(name),
          confidence: "exact",
          matchedBy: name,
        };
      }
    }
    for (const name of names) {
      const normalized = normalizeName(name);
      if (index.normalized.has(normalized)) {
        return {
          conceptId: index.normalized.get(normalized),
          confidence: "alias",
          matchedBy: name,
        };
      }
    }
    return null;
  }

  function findApproximateMatch(index, names) {
    const normalizedEntries = [...index.normalized.entries()];
    for (const name of names) {
      const query = normalizeName(name);
      if (!query) continue;
      for (const [indexName, conceptId] of normalizedEntries) {
        if (!indexName) continue;
        if (indexName.includes(query) || query.includes(indexName)) {
          return { conceptId, confidence: "approximate", matchedBy: name };
        }
      }
    }
    return null;
  }

  function getInfo(conceptId) {
    if (!conceptId) return null;
    return anatomyInfo[conceptId] || null;
  }

  async function resolve(system, selection) {
    await ensureMasterData();
    await ensureSystemIndex(system);
    const index = indexCache.get(system.id);

    const primaryNames = uniqueNonEmpty([
      selection.meshName,
      selection.nodeName,
      selection.hierarchy.join(" > "),
    ]);
    const ancestorNames = uniqueNonEmpty(selection.ancestorNames);

    let match = findExactMatch(index, primaryNames);

    if (!match) {
      for (const name of primaryNames) {
        const conceptId = aliasMap.get(normalizeName(name));
        if (conceptId) {
          match = { conceptId, confidence: "alias", matchedBy: name };
          break;
        }
      }
    }

    if (!match) {
      const ancestorMatch = findExactMatch(index, ancestorNames);
      if (ancestorMatch) {
        match = { ...ancestorMatch, confidence: "ancestor" };
      }
    }

    if (!match) {
      match = findApproximateMatch(index, [...primaryNames, ...ancestorNames]);
    }

    if (!match) {
      const fallback = DEFAULT_FALLBACKS[system.id];
      if (fallback && anatomyInfo[fallback]) {
        match = {
          conceptId: fallback,
          confidence: "approximate",
          matchedBy: "(fallback de sistema)",
        };
      }
    }

    const info = match ? getInfo(match.conceptId) : null;
    const matchCount = index.direct.has(selection.meshName)
      ? 1
      : [...index.normalized.values()].filter(
          (conceptId) => conceptId === (match && match.conceptId),
        ).length;

    return {
      conceptId: match ? match.conceptId : null,
      confidence: match ? match.confidence : "approximate",
      matchedBy: match ? match.matchedBy : null,
      info,
      isApproximateStructural: !match || match.confidence === "approximate",
      ambiguousMesh: matchCount > 1,
      dataSource: info
        ? `${system.indexFile} + anatomyInfo.json`
        : `${system.indexFile}`,
    };
  }

  return {
    ensureReadyForSystem: async (system) => {
      await ensureMasterData();
      await ensureSystemIndex(system);
    },
    resolve,
    /**
     * Returns the raw JSON object for the given system's nameIndex.
     * Used by modelSpatialIndex.buildSpatialIndex to build per-mesh spatial entries
     * without duplicating the fetch logic.
     */
    getRawIndex: (systemId) => {
      const entry = indexCache.get(systemId);
      return entry ? entry.raw : {};
    },
    /**
     * Returns the descriptive entry from anatomyInfo.json for a given conceptId.
     * Only provides human-readable metadata (title, summary, funcion).
     * It does NOT provide position data — that comes from modelSpatialIndex.
     */
    getDescriptiveInfo: (conceptId) => {
      if (!conceptId || !anatomyInfo) return null;
      return anatomyInfo[conceptId] || null;
    },
  };
}
