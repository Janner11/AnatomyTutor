import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import gsap from "gsap";
import { createAnatomyResolver } from "./anatomyResolver";
import { SYSTEMS, getSystemById, loadSystemModel } from "./modelLoader";
import { pickSelection } from "./raycastSelection";
import { createUIPanel } from "./uiPanel";
import { buildSpatialIndex, lookupSpatialEntry } from "./modelSpatialIndex";
import { createClickTargetsManager } from "./clickTargetsManager";
import { createQuizManager } from "./quizManager";
import { HandTracker } from "./handTracking";
import {
  HandGestureRecognizer,
  getIndexTipNdc,
  getPalmCenter,
  getPalmCenter3D,
} from "./handGestureRecognizer";
import { HandLaserController } from "./handLaserController";
import { HandCameraController } from "./handCameraController";
import { HandOverlayRenderer } from "./handOverlayRenderer";
import { drawHands } from "./handSkeletonRenderer";
import { createGuidedLearningManager } from "./guidedLearning/guidedLearningManager";

const appRoot = document.getElementById("app");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9eef6);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.05,
  2000,
);
camera.position.set(0, 1.5, 4.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
appRoot.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1, 0);

// Órbita con flechas (manejado en animate): estable y coherente con el botón del ratón.
const _orbitKeys = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
};
const _kbOrbitSpherical = new THREE.Spherical();
const _kbOrbitOffset = new THREE.Vector3();

/** GSAP timeline mientras animamos zoom en aprendizaje guiado (null si inactivo). */
let guidedCameraTween = null;

function isKeyboardFocusElement(el) {
  if (!el || !el.tagName) return false;
  const t = el.tagName.toLowerCase();
  if (t === "input" || t === "textarea" || t === "select") return true;
  return el.isContentEditable === true;
}

window.addEventListener(
  "keydown",
  (e) => {
    if (isKeyboardFocusElement(document.activeElement)) return;
    if (
      e.code === "ArrowLeft" ||
      e.code === "ArrowRight" ||
      e.code === "ArrowUp" ||
      e.code === "ArrowDown"
    ) {
      e.preventDefault();
      _orbitKeys[e.code] = true;
    }
  },
  { passive: false },
);

window.addEventListener("keyup", (e) => {
  if (e.code in _orbitKeys) _orbitKeys[e.code] = false;
});

function applyKeyboardOrbit(dt) {
  if (!controls.enabled || handTrackingActive) return;

  const left = _orbitKeys.ArrowLeft;
  const right = _orbitKeys.ArrowRight;
  const up = _orbitKeys.ArrowUp;
  const down = _orbitKeys.ArrowDown;

  if (guidedCameraTween?.isActive?.()) {
    if (left || right || up || down) cancelGuidedCameraTween();
    else return;
  }

  if (!left && !right && !up && !down) return;

  const rotateSpeed = 2.2;
  let dTheta = 0;
  let dPhi = 0;
  if (left) dTheta += rotateSpeed * dt;
  if (right) dTheta -= rotateSpeed * dt;
  if (up) dPhi -= rotateSpeed * dt;
  if (down) dPhi += rotateSpeed * dt;

  _kbOrbitOffset.copy(camera.position).sub(controls.target);
  _kbOrbitSpherical.setFromVector3(_kbOrbitOffset);

  _kbOrbitSpherical.theta += dTheta;
  _kbOrbitSpherical.phi += dPhi;
  _kbOrbitSpherical.phi = Math.max(
    controls.minPolarAngle + 1e-5,
    Math.min(controls.maxPolarAngle - 1e-5, _kbOrbitSpherical.phi),
  );

  _kbOrbitOffset.setFromSpherical(_kbOrbitSpherical);
  camera.position.copy(controls.target).add(_kbOrbitOffset);
}

// Durante zoom guiado los controles se desactivan; rueda/clic cortan la animación y devuelven el control.
(function setupGuidedViewInterrupt() {
  const el = renderer.domElement;
  const interrupt = () => {
    if (guidedCameraTween?.isActive?.()) cancelGuidedCameraTween();
  };
  el.addEventListener("pointerdown", interrupt, true);
  el.addEventListener("wheel", interrupt, { capture: true, passive: true });
})();

scene.add(new THREE.AmbientLight(0xffffff, 0.95));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(5, 8, 6);
scene.add(keyLight);

const ui = createUIPanel(SYSTEMS);
document.body.appendChild(ui.container);
ui.setupEditorCallbacks();

const dataBaseUrl = "/data/";
const modelBaseUrl = "/model/";
const resolver = createAnatomyResolver({ dataBaseUrl, systems: SYSTEMS });

// Spatial index built from real GLB geometry after each model load.
// Key: mesh.uuid  Value: SpatialEntry (centroid, bbox, bsphere, anatomyId, confidence)
let currentSpatialIndex = new Map();

const clickTargetsManager = createClickTargetsManager();
let hitboxesVisible = false;
let currentSystem = SYSTEMS[0];
let currentRoot = null;
let modelMeshes = [];
let labelMeshes = [];
let labelsVisible = false;
let selectedObject = null;
let previousEmissive = null;
let previousEmissiveIntensity = null;

const quizManager = createQuizManager({
  clickTargetsManager,
  resolver,
  ui,
  getSystemLabel: () => currentSystem.label,
  highlightQuizSelection: (conceptId) => {
    const mappedMesh = findBestModelMeshByConceptId(conceptId);
    if (mappedMesh) {
      highlightObject(mappedMesh);
      const spatialEntry = lookupSpatialEntry(currentSpatialIndex, mappedMesh.uuid);
      if (spatialEntry) {
        showZoneFromMesh(spatialEntry);
        if (
          Array.isArray(spatialEntry.centroidWorld) &&
          spatialEntry.centroidWorld.length === 3
        ) {
          pickMarker.position.set(
            spatialEntry.centroidWorld[0],
            spatialEntry.centroidWorld[1],
            spatialEntry.centroidWorld[2],
          );
          pickMarker.visible = true;
        }
      }
      return;
    }

    // Fallback when concept->mesh mapping is unavailable.
    const hotspots = clickTargetsManager.getHitboxMeshes();
    for (const hotspot of hotspots) {
      const entry = clickTargetsManager.getEntryByUuid(hotspot.uuid);
      if (!entry || entry.conceptId !== conceptId) continue;
      pickMarker.position.copy(hotspot.position);
      pickMarker.visible = true;
      showZoneFromHitboxEntry(entry);
      return;
    }
  },
  clearQuizHighlight: () => {
    resetHighlight();
  },
});

quizManager.setActiveSystem(currentSystem.id);

const pickMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.02, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xff3c2e }),
);
pickMarker.visible = false;
scene.add(pickMarker);

// Wireframe sphere rendered on top to delimit the resolved organ zone
const zoneIndicator = new THREE.Mesh(
  new THREE.SphereGeometry(1, 18, 18),
  new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    wireframe: true,
    transparent: true,
    opacity: 0.42,
    depthTest: false,
    depthWrite: false,
  }),
);
zoneIndicator.visible = false;
zoneIndicator.renderOrder = 1;
scene.add(zoneIndicator);

function classifyLabelMesh(mesh) {
  const name = (mesh.name || "").toLowerCase();
  return (
    name.includes("label") ||
    name.includes("text") ||
    name.includes("arrow") ||
    name.includes("flecha") ||
    name.includes("etiqueta")
  );
}

function resetHighlight() {
  if (!selectedObject) return;
  if (
    selectedObject.material &&
    selectedObject.material.emissive &&
    previousEmissive != null
  ) {
    selectedObject.material.emissive.setHex(previousEmissive);
    selectedObject.material.emissiveIntensity = previousEmissiveIntensity;
  }
  selectedObject = null;
  previousEmissive = null;
  previousEmissiveIntensity = null;
}

function highlightObject(mesh) {
  resetHighlight();
  if (!mesh || !mesh.material || !mesh.material.emissive) return;

  selectedObject = mesh;
  previousEmissive = mesh.material.emissive.getHex();
  previousEmissiveIntensity = mesh.material.emissiveIntensity;
  mesh.material.emissive.setHex(0x4a2d00);
  mesh.material.emissiveIntensity = 1.65;
}

function setLabelsVisibility(visible) {
  labelsVisible = visible;
  labelMeshes.forEach((mesh) => {
    mesh.visible = labelsVisible;
  });
  ui.setLabelsButtonState(labelsVisible);
}

function fitCameraToObject(object3d) {
  const box = new THREE.Box3().setFromObject(object3d);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.6;
  const distance = Math.max(radius * 2.6, 1.8);

  controls.target.copy(center);
  camera.position.set(center.x, center.y + radius * 0.2, center.z + distance);
  camera.near = Math.max(0.01, radius / 150);
  camera.far = Math.max(300, radius * 30);
  camera.updateProjectionMatrix();
}

async function loadSystem(systemId) {
  const system = getSystemById(systemId);
  if (!system) return;
  currentSystem = system;
  quizManager.setActiveSystem(system.id);

  // Limpiar feedback del quiz, pero NO reconstruir el pool hasta que los hotspots estén listos.
  ui.clearQuizFeedback();

  ui.setStatus(`Cargando ${system.label}...`);
  ui.resetSelectionCard();
  pickMarker.visible = false;
  resetHighlight();
  clearZoneIndicator();
  currentSpatialIndex = new Map(); // clear stale entries before unloading model
  clickTargetsManager.clearHitboxes(scene);

  if (currentRoot) {
    scene.remove(currentRoot);
    currentRoot = null;
  }

  try {
    await resolver.ensureReadyForSystem(system);
    const { gltf, loadedUrl } = await loadSystemModel(system, modelBaseUrl);

    currentRoot = gltf.scene;
    modelMeshes = [];
    labelMeshes = [];

    currentRoot.traverse((node) => {
      if (!node.isMesh) return;

      if (node.material) {
        node.material = node.material.clone();
      }

      modelMeshes.push(node);

      if (classifyLabelMesh(node)) {
        labelMeshes.push(node);
      }
    });

    scene.add(currentRoot);
    // Build spatial index from the freshly loaded GLB.
    // All centroid/bbox/bsphere data is computed from real vertex positions.
    currentSpatialIndex = buildSpatialIndex(
      currentRoot,
      resolver.getRawIndex(system.id),
    );
    setLabelsVisibility(false);
    fitCameraToObject(currentRoot);

    // Load hotspot hitboxes for this system (JSON is cached after first fetch)
    try {
      await clickTargetsManager.load(dataBaseUrl);
      clickTargetsManager.buildHitboxes(system.id, scene);
      // Hotspots listos: reconstruir pool/preguntas del quiz para ESTE sistema.
      quizManager.onHitboxesRebuilt(system.id);
    } catch (err) {
      // Non-fatal: hitboxes are a convenience layer, not required for the app
      // eslint-disable-next-line no-console
      console.warn("clickTargets: no se pudieron cargar los hotspots.", err);
      // Sin hotspots: marcar como no listo para evitar pistas cruzadas.
      quizManager.setActiveSystem(system.id);
    }

    ui.setStatus(
      `Modelo cargado (${modelMeshes.length} mallas). Fuente: ${loadedUrl}`,
    );
  } catch (error) {
    const details =
      error && error.candidates
        ? ` Intentos: ${error.candidates.join(" | ")}`
        : "";
    ui.setStatus(`Error al cargar ${system.label}.${details}`, true);
    // eslint-disable-next-line no-console
    console.error(error);
  }
}

// Zone indicator: position and radius come from the real bounding sphere of the
// selected mesh (boundingSphereWorld in modelSpatialIndex). Not shown when the
// bounding sphere is too large, which indicates a composite whole-system mesh.
const COMPOSITE_MESH_THRESHOLD = 0.35; // metres; organs larger than this = whole-system mesh

function showZoneFromMesh(spatialEntry) {
  if (!spatialEntry || !spatialEntry.boundingSphereWorld) {
    zoneIndicator.visible = false;
    return;
  }
  const bs = spatialEntry.boundingSphereWorld;
  if (bs.radius > COMPOSITE_MESH_THRESHOLD) {
    zoneIndicator.visible = false;
    return;
  }
  const [cx, cy, cz] = bs.center;
  zoneIndicator.position.set(cx, cy, cz);
  gsap.killTweensOf(zoneIndicator.scale);
  zoneIndicator.scale.setScalar(bs.radius * 0.92);
  zoneIndicator.visible = true;
  gsap.to(zoneIndicator.scale, {
    x: bs.radius * 1.08,
    y: bs.radius * 1.08,
    z: bs.radius * 1.08,
    duration: 0.85,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });
}

function showZoneFromHitboxEntry(hitboxEntry) {
  if (
    !hitboxEntry ||
    !Array.isArray(hitboxEntry.position) ||
    hitboxEntry.position.length !== 3
  ) {
    zoneIndicator.visible = false;
    return;
  }

  const radius = Number(hitboxEntry.radius) || 0;
  if (radius <= 0 || radius > COMPOSITE_MESH_THRESHOLD) {
    zoneIndicator.visible = false;
    return;
  }

  zoneIndicator.position.set(
    hitboxEntry.position[0],
    hitboxEntry.position[1],
    hitboxEntry.position[2],
  );
  gsap.killTweensOf(zoneIndicator.scale);
  zoneIndicator.scale.setScalar(radius * 0.92);
  zoneIndicator.visible = true;
  gsap.to(zoneIndicator.scale, {
    x: radius * 1.08,
    y: radius * 1.08,
    z: radius * 1.08,
    duration: 0.85,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });
}

function findBestModelMeshByConceptId(conceptId) {
  if (!conceptId || !modelMeshes.length || !currentSpatialIndex.size) return null;

  let bestHigh = null;
  let bestMedium = null;
  let bestAny = null;

  for (const mesh of modelMeshes) {
    const spatialEntry = lookupSpatialEntry(currentSpatialIndex, mesh.uuid);
    if (!spatialEntry || spatialEntry.anatomyId !== conceptId) continue;

    const radius = spatialEntry.boundingSphereWorld
      ? Number(spatialEntry.boundingSphereWorld.radius) || Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;

    if (spatialEntry.confidence === "high") {
      if (!bestHigh || radius < bestHigh.radius) bestHigh = { mesh, radius };
      continue;
    }
    if (spatialEntry.confidence === "medium") {
      if (!bestMedium || radius < bestMedium.radius) {
        bestMedium = { mesh, radius };
      }
      continue;
    }
    if (!bestAny || radius < bestAny.radius) bestAny = { mesh, radius };
  }

  return (bestHigh || bestMedium || bestAny || {}).mesh || null;
}

function findHotspotByConceptId(conceptId) {
  if (!conceptId) return null;
  const hotspots = clickTargetsManager.getHitboxMeshes();
  for (const hotspot of hotspots) {
    const entry = clickTargetsManager.getEntryByUuid(hotspot.uuid);
    if (entry && entry.conceptId === conceptId) {
      return { hotspot, entry };
    }
  }
  return null;
}

function cancelGuidedCameraTween() {
  if (guidedCameraTween) {
    guidedCameraTween.kill();
    guidedCameraTween = null;
  }
  gsap.killTweensOf(camera.position);
  gsap.killTweensOf(controls.target);
  // Si se interrumpe el tween (cambio de paso, clic, rueda…), GSAP no ejecuta onComplete:
  // hay que reactivar siempre los controles salvo modo manos.
  if (!handTrackingActive) {
    controls.enabled = true;
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;
  }
  controls.update();
}

/**
 * Acerca la cámara de forma suave al concepto (mesh o hotspot).
 */
function slowZoomToAnatomyConcept(conceptId) {
  if (!conceptId) return;

  const hotspotMatch = findHotspotByConceptId(conceptId);
  const mesh = findBestModelMeshByConceptId(conceptId);

  const center = new THREE.Vector3();
  let radius = 0.35;

  if (mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    box.getCenter(center);
    const size = box.getSize(new THREE.Vector3());
    radius = Math.max(size.x, size.y, size.z, 0.02) * 0.55;
  } else if (hotspotMatch) {
    center.copy(hotspotMatch.hotspot.position);
    const hr = Number(hotspotMatch.entry?.radius);
    radius = Number.isFinite(hr) && hr > 0 ? hr * 5.5 : 0.22;
  } else {
    return;
  }

  const distance = Math.max(radius * 2.65, 1.15);

  const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
  if (dir.lengthSq() < 1e-10) {
    dir.set(0, 0.25 * radius, 1);
  }
  dir.normalize();
  const endCam = center.clone().add(dir.multiplyScalar(distance));

  cancelGuidedCameraTween();

  const duration = 1.65;
  // Durante el tween GSAP mueve la cámara; si OrbitControls sigue activo, update() la pisa.
  if (!handTrackingActive) controls.enabled = false;

  guidedCameraTween = gsap.timeline({
    onComplete: () => {
      guidedCameraTween = null;
      if (!handTrackingActive) {
        controls.enabled = true;
        controls.update();
      }
    },
  });

  guidedCameraTween.to(
    controls.target,
    {
      x: center.x,
      y: center.y,
      z: center.z,
      duration,
      ease: "power2.inOut",
    },
    0,
  );
  guidedCameraTween.to(
    camera.position,
    {
      x: endCam.x,
      y: endCam.y,
      z: endCam.z,
      duration,
      ease: "power2.inOut",
    },
    0,
  );
}

function focusGuidedConcept(conceptId) {
  cancelGuidedCameraTween();

  if (!conceptId) {
    pickMarker.visible = false;
    clearZoneIndicator();
    resetHighlight();
    return;
  }

  const hotspotMatch = findHotspotByConceptId(conceptId);
  if (hotspotMatch) {
    // Guided mode should anchor the cue to the configured hotspot coordinates.
    pickMarker.position.copy(hotspotMatch.hotspot.position);
    pickMarker.visible = true;
    showZoneFromHitboxEntry(hotspotMatch.entry);
  }

  const mesh = findBestModelMeshByConceptId(conceptId);
  if (!mesh) {
    if (!hotspotMatch) {
      pickMarker.visible = false;
      clearZoneIndicator();
    }
    resetHighlight();
    if (hotspotMatch) {
      slowZoomToAnatomyConcept(conceptId);
    }
    return;
  }

  highlightObject(mesh);

  // Fallback when there is no configured hotspot for this concept.
  if (!hotspotMatch) {
    const spatialEntry = lookupSpatialEntry(currentSpatialIndex, mesh.uuid);
    if (spatialEntry) {
      showZoneFromMesh(spatialEntry);
      if (
        Array.isArray(spatialEntry.centroidWorld) &&
        spatialEntry.centroidWorld.length === 3
      ) {
        pickMarker.position.set(
          spatialEntry.centroidWorld[0],
          spatialEntry.centroidWorld[1],
          spatialEntry.centroidWorld[2],
        );
        pickMarker.visible = true;
      }
    }
  }

  slowZoomToAnatomyConcept(conceptId);
}

function clearZoneIndicator() {
  gsap.killTweensOf(zoneIndicator.scale);
  zoneIndicator.visible = false;
}

async function handleCanvasPick(event) {
  // Only select hotspots (no direct mesh raycasting)
  const hotspots = clickTargetsManager.getHitboxMeshes();
  let selection = null;
  let hitboxEntry = null;

  if (hotspots.length) {
    const hotspotSel = pickSelection(
      event,
      camera,
      renderer.domElement,
      hotspots,
    );
    if (hotspotSel) {
      hitboxEntry = clickTargetsManager.getEntryByUuid(hotspotSel.object.uuid);
      if (hitboxEntry) selection = hotspotSel;
    }
  }

  if (!selection) {
    pickMarker.visible = false;
    resetHighlight();
    clearZoneIndicator();
    ui.resetSelectionCard();
    ui.hideEditor();
    ui.setStatus("Sin interseccion en el click actual.");
    return;
  }

  // intersection.point is always the primary position — exact, not estimated
  pickMarker.position.copy(selection.pointWorld);
  pickMarker.visible = true;

  // ── Hotspot hit (no matching GLB mesh) ────────────────────────────────────
  if (hitboxEntry) {
    // Quiz hook (opt-in): if active, consume the selection.
    if (quizManager.validateSelection(hitboxEntry)) {
      ui.hideEditor();
      return;
    }

    const mappedMesh = findBestModelMeshByConceptId(hitboxEntry.conceptId);
    if (mappedMesh) {
      highlightObject(mappedMesh);
      const spatialEntry = lookupSpatialEntry(currentSpatialIndex, mappedMesh.uuid);
      if (spatialEntry) showZoneFromMesh(spatialEntry);
    } else {
      resetHighlight();
      showZoneFromHitboxEntry(hitboxEntry);
    }
    const descriptiveInfo = resolver.getDescriptiveInfo(hitboxEntry.conceptId);
    ui.renderSelection(selection, null, descriptiveInfo, currentSystem.label);
    ui.setStatus(`Hotspot: ${hitboxEntry.label}.`);

    tryGuidedLearningZoom(hitboxEntry);

    // Show editor panel if in debug mode
    if (hitboxesVisible) {
      const onUpdateCallback = (uuid, position, radius) => {
        clickTargetsManager.updateHotspot(uuid, position, radius);
      };
      const onDownloadCallback = () => {
        downloadClickTargetsJSON();
      };
      ui.showEditor(
        hitboxEntry,
        selection.object.uuid,
        onUpdateCallback,
        onDownloadCallback,
      );
    } else {
      ui.hideEditor();
    }
    return;
  }

  // All spatial data derived from real GLB geometry (centroid, bbox, bsphere)
  const spatialEntry = lookupSpatialEntry(
    currentSpatialIndex,
    selection.object.uuid,
  );

  // Descriptive metadata from anatomyInfo.json — supplements, never invents position
  const descriptiveInfo =
    spatialEntry && spatialEntry.anatomyId
      ? resolver.getDescriptiveInfo(spatialEntry.anatomyId)
      : null;

  // Emissive highlight only when GLB mesh name matches the nameIndex exactly
  if (spatialEntry && spatialEntry.confidence === "high") {
    highlightObject(selection.object);
  } else {
    resetHighlight();
  }

  // Zone wireframe uses REAL bounding sphere from the spatial index.
  // Suppressed automatically for composite-mesh models (radius > threshold).
  if (spatialEntry && !spatialEntry.approximate) {
    showZoneFromMesh(spatialEntry);
  } else {
    clearZoneIndicator();
  }

  ui.renderSelection(
    selection,
    spatialEntry,
    descriptiveInfo,
    currentSystem.label,
  );
  ui.setStatus(
    `Seleccion detectada en ${selection.meshName || "mesh sin nombre"}.`,
  );
}

function downloadClickTargetsJSON() {
  const data = clickTargetsManager.exportCurrentData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "clickTargets.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  ui.setStatus("clickTargets.json descargado.");
}

// Named handler so it can be removed when hand tracking takes over
const mousePickHandler = (event) => {
  if (event.button !== 0) return;
  handleCanvasPick(event);
};
renderer.domElement.addEventListener("pointerdown", mousePickHandler);

// ════════════════════════════════════════════════════════════════
// Hand Tracking
// ════════════════════════════════════════════════════════════════

let handTrackingActive = false;
let handTracker = null;
let laserController = null;
let cameraController = null;
let rightGestureRec = null;
let leftGestureRec = null;
let overlayRenderer = null;

/**
 * Applies a hotspot hit triggered by the laser (right hand).
 * Mirrors the logic of handleCanvasPick for the hotspot branch,
 * but receives the mesh and world point directly instead of a DOM event.
 *
 * @param {THREE.Object3D}  mesh      - The hotspot sphere mesh that was hit
 * @param {THREE.Vector3}   hitPoint  - World-space intersection point
 */
function applyHotspotHit(mesh, hitPoint) {
  const hitboxEntry = clickTargetsManager.getEntryByUuid(mesh.uuid);
  if (!hitboxEntry) return;

  // Always leave visible evidence of what was selected.
  pickMarker.position.copy(hitPoint);
  pickMarker.visible = true;

  // Quiz hook (opt-in): validate hotspot and, if active, consume the selection.
  if (quizManager.validateSelection(hitboxEntry)) {
    return;
  }

  const mappedMesh = findBestModelMeshByConceptId(hitboxEntry.conceptId);
  if (mappedMesh) {
    highlightObject(mappedMesh);
    const spatialEntry = lookupSpatialEntry(currentSpatialIndex, mappedMesh.uuid);
    if (spatialEntry) showZoneFromMesh(spatialEntry);
  } else {
    resetHighlight();
    showZoneFromHitboxEntry(hitboxEntry);
  }

  const descriptiveInfo = resolver.getDescriptiveInfo(hitboxEntry.conceptId);

  // Construct a minimal selection-like object that ui.renderSelection() accepts
  const ptArr = [
    hitPoint.x.toFixed(4),
    hitPoint.y.toFixed(4),
    hitPoint.z.toFixed(4),
  ];
  const fakeSelection = {
    object: mesh,
    meshName: hitboxEntry.label || mesh.name || "",
    nodeName: mesh.name || "",
    hierarchy: [mesh.name],
    ancestorNames: [],
    pointWorld: hitPoint,
    pointWorldArray: ptArr,
    pointLocal: hitPoint.clone(),
    pointLocalArray: ptArr,
    normalWorld: null,
    normalWorldArray: null,
    uv: null,
    uvArray: null,
    faceIndex: null,
    distance: null,
    pointerNdc: [0, 0],
  };

  ui.renderSelection(fakeSelection, null, descriptiveInfo, currentSystem.label);
  ui.hideEditor();
  ui.setStatus(`Mano: ${hitboxEntry.label}.`);
  tryGuidedLearningZoom(hitboxEntry);
}

/** Returns a short human-readable gesture status string for the webcam overlay. */
function buildGestureStatus(results, rightGun, leftOpen, prayerActive) {
  if (prayerActive) return "MODO ZOOM (separa/junta manos)";
  if (results.leftHand && results.rightHand) return "Dos manos detectadas";

  const parts = [];
  if (results.rightHand) {
    parts.push(`Der: ${rightGun ? "\u2610\u2192 pistola" : "detectada"}`);
  }
  if (results.leftHand) {
    parts.push(`Izq: ${leftOpen ? "\u270b orbitar" : "detectada"}`);
  }
  return parts.length ? parts.join("  |  ") : "Sin manos detectadas";
}

function lmDist3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function computeHandScale(landmarks) {
  if (!landmarks || landmarks.length < 18) return 0.1;
  const palmWidth = lmDist3(landmarks[5], landmarks[17]);
  const handLength = lmDist3(landmarks[0], landmarks[12]);
  return Math.max(0.05, (palmWidth + handLength * 0.6) / 1.6);
}

function computeFingerTouchNorm(leftHand, rightHand) {
  if (!leftHand || !rightHand) return Infinity;
  const tips = [4, 8, 12, 16, 20];
  let minDist = Infinity;

  for (const li of tips) {
    for (const ri of tips) {
      minDist = Math.min(minDist, lmDist3(leftHand[li], rightHand[ri]));
    }
  }

  const avgScale = (computeHandScale(leftHand) + computeHandScale(rightHand)) * 0.5;
  return minDist / Math.max(0.001, avgScale);
}

async function activateHandTracking() {
  ui.setHandsButtonState(true, "Cargando…");

  try {
    handTracker = new HandTracker();
    const videoEl = await handTracker.init((msg) => ui.setStatus(msg));

    laserController = new HandLaserController(
      scene,
      camera,
      renderer.domElement,
      applyHotspotHit,
    );

    cameraController = new HandCameraController(camera, controls);
    rightGestureRec = new HandGestureRecognizer();
    leftGestureRec = new HandGestureRecognizer();
    overlayRenderer = new HandOverlayRenderer();

    ui.setWebcamPreview(videoEl);
    ui.setWebcamOverlayVisible(true);

    // Disable mouse picking and OrbitControls user-input while in hand mode
    renderer.domElement.removeEventListener("pointerdown", mousePickHandler);
    controls.enabled = false;

    handTrackingActive = true;
    ui.setHandsButtonState(true, "Activo");
    ui.setStatus(
      "Hand tracking activo.  Izq: mano abierta = rotar modelo.  Der: pistola = l\u00e1ser.  Toca dedos de ambas manos para activar MODO ZOOM.",
    );
  } catch (err) {
    ui.setStatus(`Error al activar manos: ${err.message}`, true);
    ui.setHandsButtonState(false, "Manos");
    if (handTracker) {
      handTracker.destroy();
      handTracker = null;
    }
  }
}

function deactivateHandTracking() {
  handTrackingActive = false;

  if (overlayRenderer) {
    overlayRenderer.destroy();
    overlayRenderer = null;
  }
  if (laserController) {
    laserController.destroy();
    laserController = null;
  }
  if (handTracker) {
    handTracker.destroy();
    handTracker = null;
  }
  cameraController = null;
  rightGestureRec = null;
  leftGestureRec = null;

  ui.setWebcamOverlayVisible(false);
  renderer.domElement.addEventListener("pointerdown", mousePickHandler);
  controls.enabled = true;

  ui.setHandsButtonState(false, "Manos");
  ui.setStatus("Hand tracking desactivado. Modo mouse activo.");
}

ui.toggleHandsBtn.addEventListener("click", () => {
  if (handTrackingActive) {
    deactivateHandTracking();
  } else {
    activateHandTracking();
  }
});

ui.toggleQuizBtn.addEventListener("click", () => {
  ui.clearQuizFeedback();
  quizManager.toggle();
});

ui.setQuizSubmitHandler((payload) => {
  ui.clearQuizFeedback();
  quizManager.submitPanelAnswer(payload);
});

ui.nextQuizBtn.addEventListener("click", () => {
  if (!quizManager.isActive()) return;
  ui.clearQuizFeedback();
  quizManager.nextQuestion();
});

ui.systemSelect.addEventListener("change", (event) => {
  loadSystem(event.target.value);
});

ui.toggleLabelsBtn.addEventListener("click", () => {
  setLabelsVisibility(!labelsVisible);
  ui.setStatus(labelsVisible ? "Etiquetas visibles." : "Etiquetas ocultas.");
});

ui.toggleHitboxesBtn.addEventListener("click", () => {
  hitboxesVisible = !hitboxesVisible;
  clickTargetsManager.setDebugVisible(hitboxesVisible);
  ui.setHitboxesButtonState(hitboxesVisible);
  ui.setStatus(
    hitboxesVisible ? "Hotspots visibles (modo debug)." : "Hotspots ocultos.",
  );
});

ui.clearSelectionBtn.addEventListener("click", () => {
  pickMarker.visible = false;
  resetHighlight();
  clearZoneIndicator();
  ui.resetSelectionCard();
  ui.hideEditor();
  ui.setStatus("Seleccion limpiada.");
});

// Guided Learning Manager
const guidedLearningManager = createGuidedLearningManager({
  getCurrentSystemId: () => currentSystem.id,
  onStepChange: (part) => {
    ui.setGuidedState(part);
    if (!part) {
      ui.setStatus("Aprendizaje guiado desactivado.");
      focusGuidedConcept(null);
    } else {
      const title = part.info?.title || part.conceptId;
      ui.setStatus(`Aprendizaje guiado: paso ${part.step}/${part.total} (${title}).`);
      focusGuidedConcept(part.conceptId);
    }
  },
});

// UI event bindings for guided learning
const tryStartGuidedLearning = async () => {
  const result = await guidedLearningManager.start();
  if (!result?.ok) ui.setStatus(result?.error || "No se pudo iniciar aprendizaje guiado.", true);
};

ui.toggleGuidedInsideBtn.addEventListener("click", () => {
  guidedLearningManager.stop();
});
ui.prevGuidedBtn.addEventListener("click", () => guidedLearningManager.prev());
ui.nextGuidedBtn.addEventListener("click", () => guidedLearningManager.next());
ui.stopGuidedBtn.addEventListener("click", () => guidedLearningManager.stop());

function tryGuidedLearningZoom(hitboxEntry) {
  if (!hitboxEntry?.conceptId) return;
  if (!guidedLearningManager.isActive()) return;
  const part = guidedLearningManager.getCurrentPart();
  if (!part || part.conceptId !== hitboxEntry.conceptId) return;
  slowZoomToAnatomyConcept(hitboxEntry.conceptId);
}

// Reiniciar guided learning al cambiar de sistema
ui.systemSelect.addEventListener("change", () => {
  guidedLearningManager.stop();
});

// --- Guided Learning: botón principal siempre visible ---
ui.openGuidedBtn.addEventListener("click", async () => {
  if (!guidedLearningManager.isActive()) {
    await tryStartGuidedLearning();
  } else {
    guidedLearningManager.stop();
  }
});

let _lastGestureStatus = "";
let _prayerModeActive = false;
let _lastZoomDist = 0;
let _lastTwoHandsSeenAt = 0;
let _touchActivateFrames = 0;
const FINGER_TOUCH_ACTIVATE_NORM = 0.24;
const FINGER_TOUCH_ACTIVATE_FRAMES = 3;
const TWO_HANDS_GRACE_MS = 220;

let _prevAnimTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.12, (now - _prevAnimTime) / 1000);
  _prevAnimTime = now;

  if (!handTrackingActive) {
    applyKeyboardOrbit(dt);
  }

  controls.update();

  if (handTrackingActive && handTracker) {
    const results = handTracker.detect();

    // Always update overlay (clears when no hands)
    let leftHand = null,
      rightHand = null;
    if (results) {
      leftHand = results.leftHand;
      rightHand = results.rightHand;
    }
    if (overlayRenderer) overlayRenderer.render(leftHand, rightHand);

    if (results) {
      // ── Per-hand gesture state with hysteresis ───────────────────────────
      const rState = rightGestureRec.update(results.rightHand);
      const lState = leftGestureRec.update(results.leftHand);

      let rightGun = false;
      let leftOpen = false;

      if (results.leftHand && results.rightHand) {
        // ── TWO HANDS PRESENT ────────────────────────────────────────────────
        const lp = getPalmCenter3D(results.leftHand);
        const rp = getPalmCenter3D(results.rightHand);
        const fingerTouchNorm = computeFingerTouchNorm(
          results.leftHand,
          results.rightHand,
        );
        const dist = Math.sqrt(
          Math.pow(lp.x - rp.x, 2) +
            Math.pow(lp.y - rp.y, 2) +
            Math.pow(lp.z - rp.z, 2),
        );
        _lastTwoHandsSeenAt = now;

        // Activacion por toque/choque de dedos entre ambas manos.
        if (!_prayerModeActive) {
          if (fingerTouchNorm <= FINGER_TOUCH_ACTIVATE_NORM) {
            _touchActivateFrames += 1;
          } else {
            _touchActivateFrames = 0;
          }

          if (_touchActivateFrames >= FINGER_TOUCH_ACTIVATE_FRAMES) {
            _prayerModeActive = true;
            _lastZoomDist = dist;
            _touchActivateFrames = 0;
          }
        }

        // Una vez activo: separar = zoom in, juntar = zoom out, continuo.
        if (_prayerModeActive) {
          _lastZoomDist = dist;
        }
        cameraController.updateZoom(_prayerModeActive, dist);

        // Priority rule: disable other gestures while two hands are present
        laserController.update(null, []);
        cameraController.updateOrbit(null, false);
      } else {
        // ── ONE OR ZERO HANDS PRESENT ────────────────────────────────────────
        const withinGrace =
          _prayerModeActive && now - _lastTwoHandsSeenAt < TWO_HANDS_GRACE_MS;
        if (!withinGrace) {
          _prayerModeActive = false;
          _touchActivateFrames = 0;
          cameraController.updateZoom(false, _lastZoomDist);
        }

        // ── Right hand: gun gesture → laser raycast ──────────────────────────
        if (withinGrace) {
          // Evita saltos al perder una mano brevemente por oclusion.
          laserController.update(null, []);
          cameraController.updateOrbit(null, false);
        } else {
          rightGun = rState.gun.active;
          const rightNdc = rightGun ? getIndexTipNdc(results.rightHand) : null;
          laserController.update(rightNdc, clickTargetsManager.getHitboxMeshes());

          // ── Left hand: open = rotate model (grab-and-drag) ───────────────────────
          leftOpen = lState.openHand.active;
          const leftPalm = getPalmCenter(results.leftHand);
          cameraController.updateOrbit(leftPalm, leftOpen);
        }
      }

      // ── Hand skeleton on the webcam mini-preview canvas ──────────────────
      const skCanvas = ui.getSkeletonCanvas();
      if (skCanvas) {
        const vid = handTracker.videoElement;
        if (vid && vid.videoWidth > 0) {
          if (skCanvas.width !== vid.videoWidth) {
            skCanvas.width = vid.videoWidth;
            skCanvas.height = vid.videoHeight;
          }
          drawHands(
            skCanvas.getContext("2d"),
            results.leftHand,
            results.rightHand,
          );
        }
      }

      // ── Gesture status overlay (only when text changes) ───────────────────
      const gestureStatus = buildGestureStatus(
        results,
        rightGun,
        leftOpen,
        _prayerModeActive,
      );
      if (gestureStatus !== _lastGestureStatus) {
        _lastGestureStatus = gestureStatus;
        ui.setHandStatus(gestureStatus);
      }
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
loadSystem(currentSystem.id);
