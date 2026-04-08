function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch (_err) {
    return fallback;
  }
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return createMemoryStorage();
}

function createEmptyProgress() {
  return {
    version: 1,
    totals: {
      answered: 0,
      correct: 0,
    },
    bySystem: {},
    updatedAt: new Date().toISOString(),
  };
}

function createEmptySystemProgress() {
  return {
    answered: 0,
    correct: 0,
    byConcept: {},
    byType: {},
  };
}

function createEmptyConceptProgress() {
  return {
    answered: 0,
    correct: 0,
    byType: {},
    lastSeenAt: null,
  };
}

export function createProgressStore({ storageKey = "anatomytutor.assessment.progress.v1" } = {}) {
  const storage = getStorage();

  function read() {
    const raw = storage.getItem(storageKey);
    if (!raw) return createEmptyProgress();
    const parsed = safeParse(raw, createEmptyProgress());
    return parsed && typeof parsed === "object" ? parsed : createEmptyProgress();
  }

  function write(progress) {
    const data = {
      ...progress,
      updatedAt: new Date().toISOString(),
    };
    storage.setItem(storageKey, JSON.stringify(data));
  }

  function ensureSystem(progress, systemId) {
    if (!progress.bySystem[systemId]) {
      progress.bySystem[systemId] = createEmptySystemProgress();
    }
    return progress.bySystem[systemId];
  }

  function ensureConcept(systemProgress, conceptId) {
    if (!systemProgress.byConcept[conceptId]) {
      systemProgress.byConcept[conceptId] = createEmptyConceptProgress();
    }
    return systemProgress.byConcept[conceptId];
  }

  function updateAttempt({ systemId, conceptId, exerciseType, ok }) {
    const progress = read();

    progress.totals.answered += 1;
    if (ok) progress.totals.correct += 1;

    const sys = ensureSystem(progress, systemId);
    sys.answered += 1;
    if (ok) sys.correct += 1;

    if (!sys.byType[exerciseType]) {
      sys.byType[exerciseType] = { answered: 0, correct: 0 };
    }
    sys.byType[exerciseType].answered += 1;
    if (ok) sys.byType[exerciseType].correct += 1;

    const concept = ensureConcept(sys, conceptId);
    concept.answered += 1;
    if (ok) concept.correct += 1;
    concept.lastSeenAt = new Date().toISOString();

    if (!concept.byType[exerciseType]) {
      concept.byType[exerciseType] = { answered: 0, correct: 0 };
    }
    concept.byType[exerciseType].answered += 1;
    if (ok) concept.byType[exerciseType].correct += 1;

    write(progress);
    return progress;
  }

  function getSystemProgress(systemId) {
    const progress = read();
    return progress.bySystem[systemId] || createEmptySystemProgress();
  }

  return {
    read,
    updateAttempt,
    getSystemProgress,
  };
}

