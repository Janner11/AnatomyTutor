import * as THREE from "three";
import gsap from "gsap";
import {
  createAdaptiveAssessment,
  EXERCISE_TYPES,
} from "./assessment/adaptiveAssessment";

/**
 * QuizManager
 *
 * Encapsulates an opt-in “Modo Examen” that listens to hotspot selections.
 * It never modifies raycasting / hand tracking; it only validates the selected
 * hotspot and provides feedback (score + hint highlight).
 */
export function createQuizManager({
  clickTargetsManager,
  resolver,
  ui,
  getSystemLabel,
  highlightQuizSelection, // nueva función para resaltar
  clearQuizHighlight,     // nueva función para limpiar resalte
}) {
  let currentSystemId = null;
  let hitboxesReadyForSystemId = null;

  const assessment = createAdaptiveAssessment({
    resolver,
    getSystemLabel,
    getHitboxEntries: () => {
      const meshes = clickTargetsManager.getHitboxMeshes();
      const entries = [];
      for (const mesh of meshes) {
        const entry = clickTargetsManager.getEntryByUuid(mesh.uuid);
        if (entry) entries.push(entry);
      }
      return entries;
    },
  });

  /** @type {THREE.Mesh|null} */
  let hintMesh = null;
  let hintPrevColor = null;
  let hintPrevOpacity = null;
  let hintPrevVisible = null;
  let hintTween = null;

  function isActive() {
    return assessment.isActive();
  }

  function clearHint() {
    if (hintTween) {
      hintTween.kill();
      hintTween = null;
    }
    if (hintMesh && hintMesh.material) {
      if (hintPrevColor != null && hintMesh.material.color) {
        hintMesh.material.color.setHex(hintPrevColor);
      }
      if (hintPrevOpacity != null && hintMesh.material.opacity != null) {
        hintMesh.material.opacity = hintPrevOpacity;
      }

      if (hintPrevVisible != null) {
        hintMesh.visible = hintPrevVisible;
      }
    }
    hintMesh = null;
    hintPrevColor = null;
    hintPrevOpacity = null;
    hintPrevVisible = null;
  }

  function renderQuizState(stateOverride) {
    const state = stateOverride || assessment.currentState();
    ui.setQuizState({
      active: state.active,
      prompt: state.prompt,
      score: state.score,
      total: state.total,
      systemLabel: state.systemLabel,
      currentExercise: state.currentExercise,
      progress: state.progress,
    });
  }

  function renderResultFeedback(result) {
    if (!result) return;
    ui.showQuizFeedback({
      ok: result.ok,
      message: result.message,
      explanation: result.explanation,
      progress: result.progress,
    });
  }

  function setActiveSystem(systemId) {
    currentSystemId = systemId;

    // Changing systems invalidates any previously built hitbox pool.
    hitboxesReadyForSystemId = null;

    // Always drop any existing hint mesh/tween; hitboxes will be rebuilt.
    clearHint();
    assessment.setActiveSystem(systemId);

    if (!assessment.isActive()) return;

    renderQuizState({
      active: true,
      prompt: "Cargando preguntas del sistema...",
      score: 0,
      total: 0,
      systemLabel: getSystemLabel(),
      currentExercise: null,
      progress: { systemAccuracyPct: 0, reinforcement: [] },
    });
  }

  /**
   * Must be called by the app right after clickTargetsManager.buildHitboxes(systemId,...)
   * so the quiz can safely build a per-system question pool.
   */
  function onHitboxesRebuilt(systemId) {
    hitboxesReadyForSystemId = systemId;
    clearHint();
    if (systemId !== currentSystemId) currentSystemId = systemId;
    assessment.onSystemReady(systemId);

    if (!assessment.isActive()) return;
    const state = assessment.nextExercise();
    renderQuizState(state);
  }

  function start() {
    if (assessment.isActive()) return;
    clearHint();
    const state = assessment.start();
    renderQuizState(state);
  }

  function stop() {
    if (!assessment.isActive()) return;
    clearHint();
    const state = assessment.stop();
    renderQuizState({
      ...state,
      active: false,
      prompt: "Modo Examen desactivado.",
      currentExercise: null,
    });
  }

  function toggle() {
    if (assessment.isActive()) stop();
    else start();
  }

  function nextQuestion() {
    clearHint();
    if (clearQuizHighlight) clearQuizHighlight();

    // If hitboxes aren't ready for the current system, don't advance.
    if (hitboxesReadyForSystemId !== currentSystemId) {
      renderQuizState({
        active: true,
        prompt: "Cargando preguntas del sistema...",
        score: 0,
        total: 0,
        systemLabel: getSystemLabel(),
        currentExercise: null,
        progress: { systemAccuracyPct: 0, reinforcement: [] },
      });
      return;
    }

    const state = assessment.nextExercise();
    renderQuizState(state);
  }

  function findMeshByConceptId(conceptId) {
    const meshes = clickTargetsManager.getHitboxMeshes();
    for (const mesh of meshes) {
      const entry = clickTargetsManager.getEntryByUuid(mesh.uuid);
      if (entry && entry.conceptId === conceptId) return mesh;
    }
    return null;
  }

  function showHintForCurrentQuestion() {
    const state = assessment.currentState();
    const currentExercise = state.currentExercise;
    if (!currentExercise) return;
    clearHint();

    // Never show hints unless we are sure hitboxes belong to the active system.
    if (hitboxesReadyForSystemId !== currentSystemId) return;

    const conceptId = currentExercise.conceptId || currentExercise.id.split(":")[1];
    const mesh = findMeshByConceptId(conceptId);
    if (!mesh || !mesh.material) return;

    hintMesh = mesh;
    hintPrevColor = hintMesh.material.color ? hintMesh.material.color.getHex() : null;
    hintPrevOpacity =
      hintMesh.material.opacity != null ? hintMesh.material.opacity : null;

    // Important: hitboxes are invisible unless debug is enabled.
    // For the exam hint we force it visible temporarily so the user can see it.
    hintPrevVisible = typeof hintMesh.visible === "boolean" ? hintMesh.visible : null;
    hintMesh.visible = true;

    if (hintMesh.material.color) hintMesh.material.color.setHex(0x00d4ff);

    // soft pulse
    const baseOpacity = hintMesh.material.opacity ?? 0.45;
    hintTween = gsap.to(hintMesh.material, {
      opacity: Math.min(0.9, baseOpacity + 0.35),
      duration: 0.4,
      yoyo: true,
      repeat: 5,
      ease: "sine.inOut",
      onComplete: () => {
        if (hintMesh && hintMesh.material) hintMesh.material.opacity = baseOpacity;
      },
    });
  }

  /**
   * Hook called from app.js when a hotspot is selected (mouse or hand).
   * Returns true if the quiz consumed the event (i.e., app should not run the
   * normal selection UI).
   */
  function validateSelection(hitboxEntry) {
    if (!assessment.isActive()) return false;
    if (!hitboxEntry || !hitboxEntry.conceptId) return true;

    // Block validation while system is switching / hitboxes not ready.
    if (hitboxesReadyForSystemId !== currentSystemId) {
      ui.showQuizFeedback({
        ok: false,
        message:
          "El sistema está cambiando o aún no cargan los hotspots. Espera un momento y vuelve a intentar.",
        explanation:
          "Cuando cambias de sistema, el banco de ejercicios se vuelve a crear con los hotspots nuevos.",
      });
      return true;
    }

    const evaluation = assessment.validateHotspotSelection(hitboxEntry);
    if (evaluation.consumed && evaluation.result) {
      if (evaluation.result.ok && highlightQuizSelection) {
        highlightQuizSelection(hitboxEntry.conceptId);
      }

      if (!evaluation.result.ok) {
        const state = assessment.currentState();
        if (
          state.currentExercise &&
          state.currentExercise.type === EXERCISE_TYPES.VISUAL_IDENTIFICATION
        ) {
          showHintForCurrentQuestion();
        }
      }

      renderResultFeedback(evaluation.result);
      renderQuizState();
    }

    return true;
  }

  function submitPanelAnswer(answerPayload) {
    if (!assessment.isActive()) return;
    const result = assessment.submitExerciseAnswer(answerPayload);
    renderResultFeedback(result);
    renderQuizState();
  }

  return {
    isActive,
    start,
    stop,
    toggle,
    nextQuestion,
    setActiveSystem,
    onHitboxesRebuilt,
    validateSelection,
    submitPanelAnswer,
  };
}

