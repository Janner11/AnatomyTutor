function formatArray(arr) {
  if (!arr || !Array.isArray(arr)) return "N/A";
  return `[${arr.join(", ")}]`;
}

export function createUIPanel(systems) {
  const container = document.createElement("aside");
  container.className = "atlas-panel";
  container.innerHTML = `
    <header class="atlas-topbar">
      <div class="atlas-topbar-brand">
        <h2 class="atlas-title">Anatomy Tutor 3D</h2>
        <p class="atlas-subtitle">Seleccion anatomica precisa por raycasting</p>
      </div>

      <div class="atlas-topbar-system">
        <label class="atlas-label" for="systemSelect">Sistema corporal</label>
        <select id="systemSelect" class="atlas-select"></select>
      </div>

      <div class="atlas-topbar-modes" aria-label="Modos">
        <span class="atlas-mode-tab atlas-mode-tab-active">Explorar</span>
        <button id="openGuidedBtn" type="button" class="atlas-btn atlas-btn-secondary">Aprendizaje Guiado</button>
        <button id="toggleQuizBtn" type="button" class="atlas-btn atlas-btn-secondary">📝 Modo Examen</button>
      </div>
    </header>

    <div class="atlas-layout">
      <nav class="atlas-left-rail" aria-label="Navegacion principal">
        <button id="toggleLabelsBtn" type="button" class="atlas-btn">Mostrar etiquetas</button>
        <button id="toggleHitboxesBtn" type="button" class="atlas-btn atlas-btn-secondary">Hotspots debug</button>
        <button id="clearSelectionBtn" type="button" class="atlas-btn atlas-btn-secondary">Limpiar seleccion</button>
        <button id="toggleHandsBtn" type="button" class="atlas-btn atlas-btn-secondary atlas-btn-hands">Manos</button>
        <div id="statusBox" class="atlas-status">Cargando...</div>
      </nav>

      <main class="atlas-main-canvas" aria-label="Espacio principal 3D"></main>

      <aside class="atlas-right-context" aria-label="Panel de detalle y acciones">
        <section class="atlas-card" id="quizPanel">
          <h3>Modo Examen</h3>
          <div class="atlas-actions" style="margin-top: 8px;">
            <button id="nextQuizBtn" type="button" class="atlas-btn atlas-btn-secondary">Siguiente</button>
          </div>
          <div style="margin-top: 10px; line-height: 1.25;">
            <div><strong>Pregunta:</strong> <span id="quizPrompt">-</span></div>
            <div><strong>Tipo:</strong> <span id="quizMeta">-</span></div>
            <div id="quizStem" class="atlas-quiz-stem" style="display:none;"></div>
            <div id="quizInteraction" class="atlas-quiz-interaction" style="display:none;"></div>
            <div><strong>Puntaje:</strong> <span id="quizScore">0 / 0</span></div>
            <div id="quizProgress" class="atlas-quiz-progress" style="display:none;"></div>
            <div id="quizSuggestions" class="atlas-quiz-suggestions" style="display:none;"></div>
            <div id="quizFeedback" class="atlas-status" style="margin-top: 8px; display:none;"></div>
          </div>
        </section>

        <section class="atlas-card" id="editorPanel" style="display: none;">
          <h3>Editor de Hotspot</h3>
          <div>
            <label class="atlas-label">X: <span id="sliderValueX">0.000</span></label>
            <input type="range" id="sliderX" min="-0.5" max="0.5" step="0.001" value="0">
          </div>
          <div>
            <label class="atlas-label">Y: <span id="sliderValueY">1.000</span></label>
            <input type="range" id="sliderY" min="0.1" max="2" step="0.001" value="1">
          </div>
          <div>
            <label class="atlas-label">Z: <span id="sliderValueZ">0.000</span></label>
            <input type="range" id="sliderZ" min="-0.3" max="0.2" step="0.001" value="0">
          </div>
          <div>
            <label class="atlas-label">Radio: <span id="sliderValueRadius">0.050</span></label>
            <input type="range" id="sliderRadius" min="0.02" max="0.3" step="0.001" value="0.05">
          </div>
          <button id="downloadJsonBtn" type="button" class="atlas-btn">Descargar clickTargets.json</button>
        </section>

        <section class="atlas-card">
          <h3>Identificacion anatomica</h3>
          <div><strong>Nombre anatomico:</strong> <span data-field="anatomicalName">-</span></div>
          <div><strong>Anatomy ID:</strong> <span data-field="anatomyId">-</span></div>
          <div><strong>Categoria:</strong> <span data-field="category">-</span></div>
          <div><strong>Sistema:</strong> <span data-field="system">-</span></div>
          <div><strong>Descripcion:</strong> <span data-field="description">-</span></div>
          <div><strong>Confianza:</strong> <span data-field="confidence">-</span></div>
          <div><strong>Origen del dato:</strong> <span data-field="sourceType">-</span></div>
          <div><strong>Fuente:</strong> <span data-field="dataSource">-</span></div>
        </section>

        <section class="atlas-card">
          <h3>Datos espaciales del mesh (GLB real)</h3>
          <div><strong>Mesh nombre:</strong> <span data-field="meshName">-</span></div>
          <div><strong>Jerarquia:</strong> <span data-field="hierarchy">-</span></div>
          <div><strong>Centroide world:</strong> <span data-field="centroidWorld">-</span></div>
          <div><strong>BSphere world:</strong> <span data-field="bsphere">-</span></div>
          <div><strong>Point world (click):</strong> <span data-field="pointWorld">-</span></div>
          <div><strong>Point local:</strong> <span data-field="pointLocal">-</span></div>
          <div><strong>Normal world:</strong> <span data-field="normalWorld">-</span></div>
          <div><strong>UV:</strong> <span data-field="uv">-</span></div>
          <div><strong>Face index:</strong> <span data-field="faceIndex">-</span></div>
          <div><strong>Distancia:</strong> <span data-field="distance">-</span></div>
          <div class="atlas-warning" data-field="warning"></div>
        </section>
      </aside>
    </div>

    <section class="atlas-card atlas-bottom-tray" id="guidedPanel" style="display: none;">
      <h3>Aprendizaje Guiado</h3>
      <div id="guidedContent">
        <div><strong>Paso:</strong> <span id="guidedStep">-</span> / <span id="guidedTotal">-</span></div>
        <div><strong>Nombre:</strong> <span id="guidedName">-</span></div>
        <div><strong>Descripción:</strong> <span id="guidedDesc">-</span></div>
        <div><strong>Función:</strong> <span id="guidedFunc">-</span></div>
      </div>
      <div class="atlas-actions" style="margin-top: 8px;">
        <button id="toggleGuidedInsideBtn" type="button" class="atlas-btn atlas-btn-secondary">Pausar/Salir</button>
        <button id="prevGuidedBtn" type="button" class="atlas-btn atlas-btn-secondary">Anterior</button>
        <button id="nextGuidedBtn" type="button" class="atlas-btn atlas-btn-secondary">Siguiente</button>
        <button id="stopGuidedBtn" type="button" class="atlas-btn atlas-btn-secondary">Salir</button>
      </div>
    </section>
  `;

  const select = container.querySelector("#systemSelect");
  systems.forEach((system) => {
    const option = document.createElement("option");
    option.value = system.id;
    option.textContent = system.label;
    select.appendChild(option);
  });

  // ── Toggle Panel Button ───────────────────────────────────────────────────
  const togglePanelBtn = document.createElement("button");
  togglePanelBtn.className = "atlas-panel-toggle";
  togglePanelBtn.type = "button";
  togglePanelBtn.setAttribute("aria-label", "Mostrar u ocultar panel");
  togglePanelBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  `;
  document.body.appendChild(togglePanelBtn);

  const syncPanelState = () => {
    const isOpen = !container.classList.contains("atlas-panel-hidden");
    document.body.classList.toggle("atlas-panel-open", isOpen);
    togglePanelBtn.classList.toggle("atlas-panel-toggle-active", isOpen);
    togglePanelBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  syncPanelState();

  togglePanelBtn.addEventListener("click", () => {
    container.classList.toggle("atlas-panel-hidden");
    syncPanelState();
  });

  // ── Webcam overlay (bottom-right, separate from the main panel) ────────────
  const webcamOverlay = document.createElement("div");
  webcamOverlay.id = "webcam-overlay";
  webcamOverlay.innerHTML = `<div id="hand-status-bar">Sin manos detectadas</div>`;
  webcamOverlay.style.display = "none";
  document.body.appendChild(webcamOverlay);

  let _skeletonCanvas = null;
  let quizSubmitHandler = null;

  const fields = {};
  container.querySelectorAll("[data-field]").forEach((node) => {
    fields[node.dataset.field] = node;
  });

  function setStatus(text, isError = false) {
    const status = container.querySelector("#statusBox");
    status.textContent = text;
    status.classList.toggle("atlas-status-error", Boolean(isError));
  }

  function setLabelsButtonState(visible) {
    const button = container.querySelector("#toggleLabelsBtn");
    button.textContent = visible ? "Ocultar etiquetas" : "Mostrar etiquetas";
    button.classList.toggle("atlas-btn-active", visible);
  }

  function setHitboxesButtonState(visible) {
    const button = container.querySelector("#toggleHitboxesBtn");
    button.textContent = visible ? "Ocultar hotspots" : "Hotspots debug";
    button.classList.toggle("atlas-btn-active", visible);
  }

  function setHandsButtonState(active, label) {
    const button = container.querySelector("#toggleHandsBtn");
    button.textContent = label;
    button.classList.toggle("atlas-btn-active", active);
  }

  function setHandStatus(text) {
    const bar = webcamOverlay.querySelector("#hand-status-bar");
    if (bar) bar.textContent = text;
  }

  function setWebcamPreview(videoEl) {
    videoEl.id = "webcam-preview";

    // Wrapper gives us a relative-positioned container so the canvas
    // can sit exactly on top of the video via position: absolute
    const wrapper = document.createElement("div");
    wrapper.id = "webcam-video-wrapper";

    const canvas = document.createElement("canvas");
    canvas.id = "hand-skeleton-canvas";
    _skeletonCanvas = canvas;

    wrapper.appendChild(videoEl);
    wrapper.appendChild(canvas);
    // Insert wrapper before the status bar
    webcamOverlay.insertBefore(wrapper, webcamOverlay.firstChild);
  }

  function getSkeletonCanvas() {
    return _skeletonCanvas;
  }

  function setWebcamOverlayVisible(visible) {
    webcamOverlay.style.display = visible ? "block" : "none";
  }

  function resetSelectionCard() {
    Object.keys(fields).forEach((key) => {
      fields[key].textContent = key === "warning" ? "" : "-";
    });
  }

  function formatExerciseMeta(exercise) {
    if (!exercise) return "-";
    const typeLabel =
      exercise.type === "visual-identification"
        ? "Identificacion visual"
        : exercise.type === "matching"
          ? "Emparejamiento"
          : "Respuesta abierta";
    const difficulty = exercise.difficulty || "medium";
    return `${typeLabel} | Dificultad: ${difficulty}`;
  }

  function renderQuizInteraction(exercise) {
    const interactionEl = container.querySelector("#quizInteraction");
    if (!interactionEl) return;

    if (!exercise) {
      interactionEl.style.display = "none";
      interactionEl.innerHTML = "";
      return;
    }

    if (exercise.type === "visual-identification") {
      interactionEl.style.display = "block";
      interactionEl.innerHTML =
        '<div class="atlas-quiz-helper">Selecciona la estructura directamente en el modelo 3D.</div>';
      return;
    }

    if (exercise.type === "matching") {
      interactionEl.style.display = "block";
      interactionEl.innerHTML = "";
      const list = document.createElement("div");
      list.className = "atlas-quiz-options";

      (exercise.options || []).forEach((option) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "atlas-btn atlas-btn-secondary atlas-quiz-option-btn";
        btn.textContent = option.label;
        btn.addEventListener("click", () => {
          if (!quizSubmitHandler) return;
          quizSubmitHandler({ conceptId: option.conceptId });
        });
        list.appendChild(btn);
      });

      interactionEl.appendChild(list);
      return;
    }

    if (exercise.type === "open-response") {
      interactionEl.style.display = "block";
      interactionEl.innerHTML = `
        <div class="atlas-quiz-open-row">
          <input id="quizOpenInput" class="atlas-select" type="text" placeholder="Escribe tu respuesta..." />
          <button id="quizOpenSubmit" type="button" class="atlas-btn atlas-btn-secondary">Enviar</button>
        </div>
      `;

      const input = interactionEl.querySelector("#quizOpenInput");
      const button = interactionEl.querySelector("#quizOpenSubmit");

      const submit = () => {
        if (!quizSubmitHandler) return;
        quizSubmitHandler({ text: input ? input.value : "" });
      };

      if (button) button.addEventListener("click", submit);
      if (input) {
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") submit();
        });
      }
      return;
    }

    interactionEl.style.display = "none";
    interactionEl.innerHTML = "";
  }

  function renderReinforcement(progress) {
    const progressEl = container.querySelector("#quizProgress");
    const suggestionsEl = container.querySelector("#quizSuggestions");
    if (!progressEl || !suggestionsEl) return;

    if (!progress) {
      progressEl.style.display = "none";
      suggestionsEl.style.display = "none";
      progressEl.textContent = "";
      suggestionsEl.textContent = "";
      return;
    }

    progressEl.style.display = "block";
    progressEl.textContent = `Precision del sistema: ${progress.systemAccuracyPct || 0}%`;

    const items = Array.isArray(progress.reinforcement)
      ? progress.reinforcement
      : [];
    if (!items.length) {
      suggestionsEl.style.display = "none";
      suggestionsEl.textContent = "";
      return;
    }

    suggestionsEl.style.display = "block";
    const formatted = items
      .map((item) => `${item.title} (${item.accuracyPct}% en ${item.attempts} intentos)`)
      .join(" | ");
    suggestionsEl.textContent = `Refuerzo sugerido: ${formatted}`;
  }

  function setQuizState({ active, prompt, score, total, currentExercise, progress }) {
    const promptEl = container.querySelector("#quizPrompt");
    const scoreEl = container.querySelector("#quizScore");
    const metaEl = container.querySelector("#quizMeta");
    const stemEl = container.querySelector("#quizStem");
    const toggleBtn = container.querySelector("#toggleQuizBtn");

    if (promptEl) promptEl.textContent = prompt || "-";
    if (scoreEl) scoreEl.textContent = `${score ?? 0} / ${total ?? 0}`;
    if (metaEl) metaEl.textContent = formatExerciseMeta(currentExercise);

    if (stemEl) {
      const stem = currentExercise && currentExercise.stem ? currentExercise.stem : "";
      stemEl.textContent = stem;
      stemEl.style.display = stem ? "block" : "none";
    }

    renderQuizInteraction(currentExercise);
    renderReinforcement(progress);

    if (toggleBtn) {
      toggleBtn.classList.toggle("atlas-btn-active", Boolean(active));
      toggleBtn.textContent = active ? "📝 Examen activo" : "📝 Modo Examen";
    }
  }

  function showQuizFeedback({ ok, message, explanation, progress }) {
    const el = container.querySelector("#quizFeedback");
    if (!el) return;
    el.style.display = "block";
    el.textContent = explanation
      ? `${message || ""} ${explanation}`
      : message || "";
    el.classList.toggle("atlas-status-error", !ok);
    renderReinforcement(progress);
  }

  function clearQuizFeedback() {
    const el = container.querySelector("#quizFeedback");
    if (!el) return;
    el.style.display = "none";
    el.textContent = "";
    el.classList.remove("atlas-status-error");
  }

  function setQuizSubmitHandler(handler) {
    quizSubmitHandler = typeof handler === "function" ? handler : null;
  }

  /**
   * @param {object} selection   - Hit data from raycastSelection.pickSelection()
   * @param {object|null} spatialEntry - Entry from modelSpatialIndex (real geometry data)
   * @param {object|null} descriptiveInfo - Entry from anatomyInfo.json (title/summary/funcion)
   * @param {string} systemLabel  - Display name of the active system
   */
  function renderSelection(
    selection,
    spatialEntry,
    descriptiveInfo,
    systemLabel,
  ) {
    const info = descriptiveInfo || {};
    const anatomyId = spatialEntry ? spatialEntry.anatomyId : null;
    const confidence = spatialEntry ? spatialEntry.confidence : "low";
    const sourceType = spatialEntry ? spatialEntry.sourceType : "unresolved";

    // ── Anatomical identification ─────────────────────────────────────────────
    fields.anatomicalName.textContent =
      info.title || anatomyId || "No identificado";
    fields.anatomyId.textContent = anatomyId || "No resuelto";
    fields.category.textContent = info.category || "No definida";
    fields.system.textContent = systemLabel;
    fields.description.textContent =
      info.summary || info.funcion || "Sin descripcion en anatomyInfo.json";
    fields.confidence.textContent = confidence;
    fields.sourceType.textContent = sourceType;
    fields.dataSource.textContent =
      sourceType === "mesh-derived"
        ? "nameIndex del sistema + anatomyInfo.json"
        : sourceType === "approximate"
          ? "aproximacion por substring del nameIndex"
          : "sin mapeo en el nameIndex del sistema activo";

    // ── Spatial data (all from real GLB geometry) ─────────────────────────────
    fields.meshName.textContent = selection.meshName || "-";
    const nodePath = spatialEntry ? spatialEntry.nodePath : selection.hierarchy;
    fields.hierarchy.textContent = Array.isArray(nodePath)
      ? nodePath.join(" > ")
      : "-";
    fields.centroidWorld.textContent = spatialEntry
      ? formatArray(spatialEntry.centroidWorld)
      : "N/A";
    fields.bsphere.textContent =
      spatialEntry && spatialEntry.boundingSphereWorld
        ? `c=${formatArray(spatialEntry.boundingSphereWorld.center)}  r=${spatialEntry.boundingSphereWorld.radius}`
        : "N/A";
    fields.pointWorld.textContent = formatArray(selection.pointWorldArray);
    fields.pointLocal.textContent = formatArray(selection.pointLocalArray);
    fields.normalWorld.textContent = formatArray(selection.normalWorldArray);
    fields.uv.textContent = formatArray(selection.uvArray);
    fields.faceIndex.textContent =
      selection.faceIndex == null ? "N/A" : String(selection.faceIndex);
    fields.distance.textContent =
      selection.distance == null ? "N/A" : String(selection.distance);

    // ── Warnings ──────────────────────────────────────────────────────────────
    const bsRadius =
      spatialEntry && spatialEntry.boundingSphereWorld
        ? spatialEntry.boundingSphereWorld.radius
        : null;
    // Radius > 0.35 m in a ~1.7 m model suggests the mesh represents the whole
    // system rather than an individual organ.
    const isCompositeMesh = bsRadius !== null && bsRadius > 0.35;

    if (spatialEntry && spatialEntry.notes) {
      fields.warning.textContent = spatialEntry.notes;
    } else if (isCompositeMesh) {
      fields.warning.textContent = `Advertencia: BSphere radio=${bsRadius.toFixed(3)} m — el mesh posiblemente representa el sistema completo, no un organo individual. Granularidad insuficiente para seleccion precisa.`;
    } else {
      fields.warning.textContent = "";
    }
  }

  let currentEditingUuid = null;
  let onSliderChange = null;
  let onDownloadJson = null;

  function showEditor(entry, uuid, onUpdateCb, onDownloadCb) {
    currentEditingUuid = uuid;
    onSliderChange = onUpdateCb;
    onDownloadJson = onDownloadCb;

    const panel = container.querySelector("#editorPanel");
    const sliderX = container.querySelector("#sliderX");
    const sliderY = container.querySelector("#sliderY");
    const sliderZ = container.querySelector("#sliderZ");
    const sliderRadius = container.querySelector("#sliderRadius");

    sliderX.value = entry.position[0];
    sliderY.value = entry.position[1];
    sliderZ.value = entry.position[2];
    sliderRadius.value = entry.radius;

    container.querySelector("#sliderValueX").textContent =
      entry.position[0].toFixed(3);
    container.querySelector("#sliderValueY").textContent =
      entry.position[1].toFixed(3);
    container.querySelector("#sliderValueZ").textContent =
      entry.position[2].toFixed(3);
    container.querySelector("#sliderValueRadius").textContent =
      entry.radius.toFixed(3);

    panel.style.display = "block";
  }

  function hideEditor() {
    const panel = container.querySelector("#editorPanel");
    panel.style.display = "none";
    currentEditingUuid = null;
    onSliderChange = null;
    onDownloadJson = null;
  }

  function setupEditorCallbacks() {
    const sliderX = container.querySelector("#sliderX");
    const sliderY = container.querySelector("#sliderY");
    const sliderZ = container.querySelector("#sliderZ");
    const sliderRadius = container.querySelector("#sliderRadius");
    const downloadBtn = container.querySelector("#downloadJsonBtn");

    const updateValues = () => {
      container.querySelector("#sliderValueX").textContent = parseFloat(
        sliderX.value,
      ).toFixed(3);
      container.querySelector("#sliderValueY").textContent = parseFloat(
        sliderY.value,
      ).toFixed(3);
      container.querySelector("#sliderValueZ").textContent = parseFloat(
        sliderZ.value,
      ).toFixed(3);
      container.querySelector("#sliderValueRadius").textContent = parseFloat(
        sliderRadius.value,
      ).toFixed(3);

      if (onSliderChange && currentEditingUuid) {
        onSliderChange(
          currentEditingUuid,
          {
            x: parseFloat(sliderX.value),
            y: parseFloat(sliderY.value),
            z: parseFloat(sliderZ.value),
          },
          parseFloat(sliderRadius.value),
        );
      }
    };

    sliderX.addEventListener("input", updateValues);
    sliderY.addEventListener("input", updateValues);
    sliderZ.addEventListener("input", updateValues);
    sliderRadius.addEventListener("input", updateValues);

    downloadBtn.addEventListener("click", () => {
      if (onDownloadJson) onDownloadJson();
    });
  }

  const guidedPanel = container.querySelector("#guidedPanel");

  function setGuidedState(part) {
    guidedPanel.style.display = part ? "block" : "none";
    const stepEl = guidedPanel.querySelector("#guidedStep");
    const totalEl = guidedPanel.querySelector("#guidedTotal");
    const nameEl = guidedPanel.querySelector("#guidedName");
    const descEl = guidedPanel.querySelector("#guidedDesc");
    const funcEl = guidedPanel.querySelector("#guidedFunc");
    if (!part) {
      stepEl.textContent = totalEl.textContent = nameEl.textContent = descEl.textContent = funcEl.textContent = "-";
      return;
    }
    if (part.error) {
      stepEl.textContent = totalEl.textContent = nameEl.textContent = descEl.textContent = funcEl.textContent = "-";
      descEl.textContent = part.error;
      guidedPanel.style.display = "block";
      return;
    }
    stepEl.textContent = part.step;
    totalEl.textContent = part.total;
    nameEl.textContent = part.info?.title || part.conceptId || "-";
    descEl.textContent = part.info?.summary || "-";
    funcEl.textContent = part.info?.funcion || "-";
  }

  return {
    container,
    systemSelect: select,
    toggleLabelsBtn: container.querySelector("#toggleLabelsBtn"),
    toggleHitboxesBtn: container.querySelector("#toggleHitboxesBtn"),
    clearSelectionBtn: container.querySelector("#clearSelectionBtn"),
    toggleHandsBtn: container.querySelector("#toggleHandsBtn"),
    openGuidedBtn: container.querySelector("#openGuidedBtn"),
    toggleGuidedInsideBtn: container.querySelector("#toggleGuidedInsideBtn"),
    prevGuidedBtn: container.querySelector("#prevGuidedBtn"),
    nextGuidedBtn: container.querySelector("#nextGuidedBtn"),
    stopGuidedBtn: container.querySelector("#stopGuidedBtn"),
    toggleQuizBtn: container.querySelector("#toggleQuizBtn"),
    nextQuizBtn: container.querySelector("#nextQuizBtn"),
    setStatus,
    setLabelsButtonState,
    setHitboxesButtonState,
    setHandsButtonState,
    setHandStatus,
    setWebcamPreview,
    getSkeletonCanvas,
    setWebcamOverlayVisible,
    resetSelectionCard,
    setQuizState,
    showQuizFeedback,
    clearQuizFeedback,
    setQuizSubmitHandler,
    renderSelection,
    showEditor,
    hideEditor,
    setupEditorCallbacks,
    setGuidedState,
    guidedPanel,
  };
}
