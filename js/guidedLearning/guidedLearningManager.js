// GuidedLearningManager: guía al usuario por cada parte del sistema anatómico actual
// Usa rutas de dist/data/guidedRoutes.json y datos de anatomyInfo.json

export function createGuidedLearningManager({
  getCurrentSystemId,
  onStepChange,
}) {
  let active = false;
  let currentSystemId = null;
  let route = [];
  let currentStep = 0;
  let anatomyInfo = {};
  let routesBySystem = {};

  async function fetchJsonFromCandidates(candidates) {
	let lastError = null;
	for (const path of candidates) {
	  try {
		const res = await fetch(path);
		if (!res.ok) continue;
		return await res.json();
	  } catch (error) {
		lastError = error;
	  }
	}
	if (lastError) throw lastError;
	throw new Error(`No se pudo cargar recurso JSON (${candidates.join(", ")}).`);
  }

  async function loadData() {
	routesBySystem = await fetchJsonFromCandidates([
	  "/data/guidedRoutes.json",
	  "data/guidedRoutes.json",
	  "/dist/data/guidedRoutes.json",
	  "dist/data/guidedRoutes.json",
	]);

	anatomyInfo = await fetchJsonFromCandidates([
	  "/data/anatomyInfo.json",
	  "data/anatomyInfo.json",
	  "/dist/data/anatomyInfo.json",
	  "dist/data/anatomyInfo.json",
	]);

	if (typeof routesBySystem !== "object" || !routesBySystem) {
	  throw new Error("guidedRoutes.json debe contener un objeto por sistema.");
	}
	if (typeof anatomyInfo !== "object" || !anatomyInfo) {
	  anatomyInfo = {};
	}
  }

  function resolveRouteForCurrentSystem() {
	currentSystemId = getCurrentSystemId();
	const candidate = routesBySystem[currentSystemId];
	route = Array.isArray(candidate) ? candidate : [];
  }

  function isActive() {
	return active;
  }

  async function start() {
	try {
	  await loadData();
	  resolveRouteForCurrentSystem();
	  if (!route.length) {
		active = false;
		currentStep = 0;
		notifyStepChange();
		return {
		  ok: false,
		  error: `No hay ruta guiada para el sistema '${currentSystemId || "desconocido"}'.`,
		};
	  }

	  active = true;
	  currentStep = 0;
	  notifyStepChange();
	  return { ok: true };
	} catch (error) {
	  active = false;
	  route = [];
	  currentStep = 0;
	  notifyStepChange();
	  return {
		ok: false,
		error: `Error cargando datos de aprendizaje guiado: ${error?.message || "desconocido"}`,
	  };
	}
  }

  function stop() {
	active = false;
	currentStep = 0;
	route = [];
	notifyStepChange();
  }

  function next() {
	if (!active || currentStep >= route.length - 1) return;
	currentStep++;
	notifyStepChange();
  }

  function prev() {
	if (!active || currentStep <= 0) return;
	currentStep--;
	notifyStepChange();
  }

  function getCurrentPart() {
    if (!active || !route.length) return null;
    const conceptId = route[currentStep];
    return {
      conceptId,
      info: anatomyInfo[conceptId] || null,
      step: currentStep + 1,
      total: route.length,
    };
  }

  function notifyStepChange() {
	if (onStepChange) onStepChange(getCurrentPart());
  }

  return {
	isActive,
	start,
	stop,
	next,
	prev,
	getCurrentPart,
  };
}




