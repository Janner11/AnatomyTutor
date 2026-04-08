import {
  createAdaptiveAssessment,
  EXERCISE_TYPES,
} from "./adaptiveAssessment.js";

const anatomyInfo = {
  heart: {
    title: "Corazon",
    summary: "Bomba muscular central del sistema circulatorio.",
    funcion: "Impulsa la sangre oxigenada a todo el cuerpo.",
  },
  lungs: {
    title: "Pulmones",
    summary: "Organos principales de la respiracion.",
    funcion: "Intercambio de gases en el torax.",
  },
  liver: {
    title: "Higado",
    summary: "Glandula metabolica.",
    funcion: "Desintoxica la sangre y produce bilis.",
  },
};

const hitboxes = [
  { conceptId: "heart", label: "Corazon" },
  { conceptId: "lungs", label: "Pulmones" },
  { conceptId: "liver", label: "Higado" },
];

const resolver = {
  getDescriptiveInfo: (conceptId) => anatomyInfo[conceptId] || {},
};

const assessment = createAdaptiveAssessment({
  resolver,
  getSystemLabel: () => "Sistema de prueba",
  getHitboxEntries: () => hitboxes,
  storageKey: "anatomytutor.assessment.harness.v1",
});

assessment.setActiveSystem("demo");
assessment.onSystemReady("demo");
assessment.start();

function pickAnswer(exercise) {
  if (!exercise) return null;

  if (exercise.type === EXERCISE_TYPES.VISUAL_IDENTIFICATION) {
    // Simula 70% de acierto en identificacion visual.
    const ok = Math.random() < 0.7;
    const choice = ok
      ? exercise.conceptId
      : hitboxes.find((item) => item.conceptId !== exercise.conceptId).conceptId;
    return { kind: "visual", payload: { conceptId: choice } };
  }

  if (exercise.type === EXERCISE_TYPES.MATCHING) {
    const ok = Math.random() < 0.6;
    const picked = ok
      ? exercise.conceptId
      : (exercise.options || []).find((item) => item.conceptId !== exercise.conceptId)
          .conceptId;
    return { kind: "panel", payload: { conceptId: picked } };
  }

  const openCorrect = Math.random() < 0.55;
  const openText = openCorrect
    ? anatomyInfo[exercise.conceptId].title
    : "respuesta incorrecta";
  return { kind: "panel", payload: { text: openText } };
}

for (let i = 0; i < 15; i += 1) {
  const state = assessment.currentState();
  const exercise = state.currentExercise;
  const answer = pickAnswer(exercise);
  if (!answer) {
    assessment.nextExercise();
    continue;
  }

  let result;
  if (answer.kind === "visual") {
    result = assessment.validateHotspotSelection(answer.payload);
    if (result && result.result) {
      // eslint-disable-next-line no-console
      console.log(`[${i + 1}] ${exercise.type} -> ${result.result.ok ? "OK" : "FAIL"}`);
      continue;
    }
  }

  result = assessment.submitExerciseAnswer(answer.payload);
  // eslint-disable-next-line no-console
  console.log(`[${i + 1}] ${exercise.type} -> ${result.ok ? "OK" : "FAIL"}`);
}

const finalState = assessment.currentState();
// eslint-disable-next-line no-console
console.log("Score final:", `${finalState.score}/${finalState.total}`);
// eslint-disable-next-line no-console
console.log("Precision sistema:", `${finalState.progress.systemAccuracyPct}%`);
// eslint-disable-next-line no-console
console.log("Refuerzo:", finalState.progress.reinforcement);

