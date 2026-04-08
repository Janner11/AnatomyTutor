import { createProgressStore } from "./progressStore.js";

export const EXERCISE_TYPES = {
  VISUAL_IDENTIFICATION: "visual-identification",
  MATCHING: "matching",
  OPEN_RESPONSE: "open-response",
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickWeighted(items) {
  if (!items.length) return null;
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return items[0] || null;
  let threshold = Math.random() * total;
  for (const item of items) {
    threshold -= item.weight;
    if (threshold <= 0) return item;
  }
  return items[items.length - 1];
}

function accuracy(stats) {
  if (!stats || !stats.answered) return null;
  return stats.correct / stats.answered;
}

function difficultyFromConceptInfo(info) {
  const textLen = `${info.summary || ""} ${info.funcion || ""}`.length;
  if (textLen > 160) return "hard";
  if (textLen > 80) return "medium";
  return "easy";
}

function baseWeightForType(type, targetDifficulty) {
  if (targetDifficulty === "easy") {
    if (type === EXERCISE_TYPES.VISUAL_IDENTIFICATION) return 1.4;
    if (type === EXERCISE_TYPES.MATCHING) return 1.0;
    return 0.75;
  }
  if (targetDifficulty === "hard") {
    if (type === EXERCISE_TYPES.OPEN_RESPONSE) return 1.4;
    if (type === EXERCISE_TYPES.MATCHING) return 1.2;
    return 0.8;
  }
  if (type === EXERCISE_TYPES.MATCHING) return 1.25;
  return 1.0;
}

function chooseTargetDifficulty(systemProgress) {
  const acc = accuracy(systemProgress);
  if (acc == null || acc < 0.58) return "easy";
  if (acc > 0.82) return "hard";
  return "medium";
}

function explanationFor(info) {
  const summary = info.summary ? `Resumen: ${info.summary}` : "";
  const role = info.funcion ? `Funcion clave: ${info.funcion}` : "";
  return [summary, role].filter(Boolean).join(" ");
}

function conceptDisplay(info, conceptId) {
  return info.title || conceptId;
}

function makeChoiceOptions(targetConceptId, concepts) {
  const distractors = shuffle(concepts.filter((c) => c.conceptId !== targetConceptId)).slice(0, 3);
  return shuffle([
    targetConceptId,
    ...distractors.map((item) => item.conceptId),
  ]);
}

function acceptedAnswers(info, conceptId) {
  const values = new Set();
  values.add(normalizeText(conceptId));
  values.add(normalizeText(info.title));
  if (Array.isArray(info.aliases)) {
    info.aliases.forEach((alias) => values.add(normalizeText(alias)));
  }
  if (typeof info.alias === "string") values.add(normalizeText(info.alias));
  return values;
}

function openResponseContent(info, display, systemLabel) {
  const parts = [];
  if (info.summary) parts.push(`Descripción: ${info.summary}`);
  if (info.funcion) parts.push(`Función: ${info.funcion}`);

  if (parts.length) {
    return {
      prompt: "Respuesta abierta: escribe el nombre de la estructura descrita.",
      stem: parts.join(" "),
    };
  }

  // Si no hay descripción ni función, NO mostrar el nombre de la estructura como pista
  return {
    prompt: `Respuesta abierta: escribe el nombre de una estructura del sistema ${systemLabel}.`,
    stem: "",
  };
}

export function createAdaptiveAssessment({
  resolver,
  getSystemLabel,
  getHitboxEntries,
  storageKey,
}) {
  const progressStore = createProgressStore({ storageKey });

  let active = false;
  let currentSystemId = null;
  let systemReady = false;
  let currentExercise = null;
  let exercisePool = [];
  let previousExerciseKey = null;
  let liveScore = { correct: 0, total: 0 };

  function isActive() {
    return active;
  }

  function buildConcepts(systemId) {
    const entries = getHitboxEntries();
    const dedup = new Map();

    for (const entry of entries) {
      if (!entry || !entry.conceptId) continue;
      if (dedup.has(entry.conceptId)) continue;

      const info = resolver.getDescriptiveInfo(entry.conceptId) || {};
      dedup.set(entry.conceptId, {
        conceptId: entry.conceptId,
        label: entry.label,
        info,
        difficulty: difficultyFromConceptInfo(info),
      });
    }

    return [...dedup.values()].map((concept) => ({
      ...concept,
      systemId,
    }));
  }

  function createExercises(systemId) {
    const concepts = buildConcepts(systemId);
    if (!concepts.length) return [];

    const exercises = [];
    concepts.forEach((concept) => {
      const display = conceptDisplay(concept.info, concept.conceptId);
      const explain = explanationFor(concept.info);
      const openResponse = openResponseContent(concept.info, display, getSystemLabel());

      exercises.push({
        id: `${systemId}:${concept.conceptId}:${EXERCISE_TYPES.VISUAL_IDENTIFICATION}`,
        systemId,
        conceptId: concept.conceptId,
        type: EXERCISE_TYPES.VISUAL_IDENTIFICATION,
        difficulty: concept.difficulty,
        prompt: `Identifica visualmente: toca ${display}.`,
        explanation: explain || `Ubica ${display} dentro del sistema ${getSystemLabel()}.`,
      });

      const matchingStem = concept.info.funcion || concept.info.summary;
      if (matchingStem) {
        exercises.push({
          id: `${systemId}:${concept.conceptId}:${EXERCISE_TYPES.MATCHING}`,
          systemId,
          conceptId: concept.conceptId,
          type: EXERCISE_TYPES.MATCHING,
          difficulty: concept.difficulty,
          prompt: "Empareja la descripcion con la estructura correcta.",
          stem: matchingStem,
          options: makeChoiceOptions(concept.conceptId, concepts),
          explanation: explain || `La estructura correcta era ${display}.`,
        });
      }

      exercises.push({
        id: `${systemId}:${concept.conceptId}:${EXERCISE_TYPES.OPEN_RESPONSE}`,
        systemId,
        conceptId: concept.conceptId,
        type: EXERCISE_TYPES.OPEN_RESPONSE,
        difficulty: concept.difficulty,
        prompt: openResponse.prompt,
        stem: openResponse.stem,
        acceptedAnswers: [...acceptedAnswers(concept.info, concept.conceptId)],
        explanation: explain || `Respuesta esperada: ${display}.`,
      });
    });

    return exercises;
  }

  function computeReinforcement(systemId) {
    const sys = progressStore.getSystemProgress(systemId);
    const concepts = Object.entries(sys.byConcept || {});

    return concepts
      .map(([conceptId, stats]) => {
        const ratio = accuracy(stats);
        const score = ratio == null ? 0 : ratio;
        return {
          conceptId,
          attempts: stats.answered || 0,
          accuracy: score,
        };
      })
      .filter((item) => item.attempts >= 2)
      .sort((a, b) => {
        if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
        return b.attempts - a.attempts;
      })
      .slice(0, 3)
      .map((item) => {
        const info = resolver.getDescriptiveInfo(item.conceptId) || {};
        return {
          conceptId: item.conceptId,
          title: conceptDisplay(info, item.conceptId),
          accuracyPct: Math.round(item.accuracy * 100),
          attempts: item.attempts,
        };
      });
  }

  function toViewExercise(exercise) {
    if (!exercise) return null;
    const options = Array.isArray(exercise.options)
      ? exercise.options.map((conceptId) => {
          const info = resolver.getDescriptiveInfo(conceptId) || {};
          return {
            conceptId,
            label: conceptDisplay(info, conceptId),
          };
        })
      : null;

    return {
      id: exercise.id,
      conceptId: exercise.conceptId,
      type: exercise.type,
      prompt: exercise.prompt,
      stem: exercise.stem || "",
      difficulty: exercise.difficulty,
      options,
    };
  }

  function currentState() {
    const sys = progressStore.getSystemProgress(currentSystemId);
    return {
      active,
      prompt: currentExercise ? currentExercise.prompt : "-",
      score: liveScore.correct,
      total: liveScore.total,
      systemLabel: getSystemLabel(),
      currentExercise: toViewExercise(currentExercise),
      progress: {
        systemAccuracyPct: Math.round((accuracy(sys) || 0) * 100),
        reinforcement: computeReinforcement(currentSystemId),
      },
    };
  }

  function weightedCandidate(exercises, systemId) {
    const sys = progressStore.getSystemProgress(systemId);
    const targetDifficulty = chooseTargetDifficulty(sys);

    const weighted = exercises.map((exercise) => {
      const conceptStats = (sys.byConcept && sys.byConcept[exercise.conceptId]) || null;
      const conceptAcc = accuracy(conceptStats);
      const weaknessBonus = conceptAcc == null ? 1 : 1 + (1 - conceptAcc) * 0.85;
      const varietyPenalty = previousExerciseKey === `${exercise.conceptId}:${exercise.type}` ? 0.4 : 1;
      const typeWeight = baseWeightForType(exercise.type, targetDifficulty);
      const weight = typeWeight * weaknessBonus * varietyPenalty;

      return { exercise, weight };
    });

    const selected = pickWeighted(weighted);
    return selected ? selected.exercise : null;
  }

  function nextExercise() {
    if (!active || !currentSystemId) return currentState();
    if (!systemReady) {
      currentExercise = null;
      return currentState();
    }

    if (!exercisePool.length) {
      exercisePool = createExercises(currentSystemId);
    }

    currentExercise = weightedCandidate(exercisePool, currentSystemId);
    if (currentExercise) {
      previousExerciseKey = `${currentExercise.conceptId}:${currentExercise.type}`;
    }
    return currentState();
  }

  function evaluate({ ok, providedAnswer }) {
    if (!currentExercise) {
      return {
        ok: false,
        message: "No hay ejercicio activo.",
        explanation: "Avanza a la siguiente pregunta para continuar.",
      };
    }

    liveScore.total += 1;
    if (ok) liveScore.correct += 1;

    progressStore.updateAttempt({
      systemId: currentExercise.systemId,
      conceptId: currentExercise.conceptId,
      exerciseType: currentExercise.type,
      ok,
    });

    const expectedInfo = resolver.getDescriptiveInfo(currentExercise.conceptId) || {};
    const expected = conceptDisplay(expectedInfo, currentExercise.conceptId);

    const result = {
      ok,
      message: ok
        ? `Correcto. ${expected}`
        : `Respuesta incorrecta. Respuesta esperada: ${expected}`,
      explanation: currentExercise.explanation,
      expectedConceptId: currentExercise.conceptId,
      providedAnswer,
      exerciseType: currentExercise.type,
      progress: currentState().progress,
    };

    nextExercise();
    return result;
  }

  function validateHotspotSelection(hitboxEntry) {
    if (!active) return { consumed: false };
    if (!currentExercise) return { consumed: true, result: null };
    if (currentExercise.type !== EXERCISE_TYPES.VISUAL_IDENTIFICATION) {
      return {
        consumed: true,
        result: {
          ok: false,
          message: "Este ejercicio se responde en el panel (no con click sobre el modelo).",
          explanation: "Usa los botones o el campo de texto del panel para responder.",
          progress: currentState().progress,
        },
      };
    }

    const ok =
      hitboxEntry &&
      hitboxEntry.conceptId &&
      hitboxEntry.conceptId === currentExercise.conceptId;

    return {
      consumed: true,
      result: evaluate({
        ok: Boolean(ok),
        providedAnswer: hitboxEntry ? hitboxEntry.conceptId : null,
      }),
    };
  }

  function submitExerciseAnswer(answerPayload) {
    if (!active || !currentExercise) {
      return {
        ok: false,
        message: "No hay ejercicio activo.",
        explanation: "Activa el Modo Examen o avanza a la siguiente pregunta.",
        progress: currentState().progress,
      };
    }

    if (currentExercise.type === EXERCISE_TYPES.MATCHING) {
      const selectedConceptId = answerPayload ? answerPayload.conceptId : null;
      const ok = selectedConceptId === currentExercise.conceptId;
      return evaluate({ ok, providedAnswer: selectedConceptId });
    }

    if (currentExercise.type === EXERCISE_TYPES.OPEN_RESPONSE) {
      const text = answerPayload ? answerPayload.text : "";
      const normalized = normalizeText(text);
      const ok = currentExercise.acceptedAnswers.includes(normalized);
      return evaluate({ ok, providedAnswer: text });
    }

    return {
      ok: false,
      message: "Este ejercicio se responde tocando el modelo.",
      explanation: "Busca la estructura en el modelo 3D y selecciona su hotspot.",
      progress: currentState().progress,
    };
  }

  function setActiveSystem(systemId) {
    currentSystemId = systemId;
    systemReady = false;
    exercisePool = [];
    currentExercise = null;
    previousExerciseKey = null;
  }

  function onSystemReady(systemId) {
    currentSystemId = systemId;
    systemReady = true;
    exercisePool = createExercises(systemId);
    currentExercise = null;
    previousExerciseKey = null;
    liveScore = { correct: 0, total: 0 };
  }

  function start() {
    active = true;
    liveScore = { correct: 0, total: 0 };
    return nextExercise();
  }

  function stop() {
    active = false;
    currentExercise = null;
    return currentState();
  }

  return {
    isActive,
    setActiveSystem,
    onSystemReady,
    start,
    stop,
    nextExercise,
    currentState,
    validateHotspotSelection,
    submitExerciseAnswer,
  };
}

