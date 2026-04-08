import * as THREE from "three";

/**
 * Manages invisible hitbox spheres for each labeled organ in clickTargets.json.
 * These act as raycasting fallback targets when the pointer misses the exact GLB mesh.
 *
 * Usage:
 *   const mgr = createClickTargetsManager();
 *   await mgr.load("/data/");
 *   mgr.buildHitboxes("circulatory", scene);
 *   // pass mgr.getHitboxMeshes() into pickSelection as fallback targets
 *   mgr.setDebugVisible(true);   // shows red wireframe spheres for coordinate tuning
 *   mgr.clearHitboxes(scene);    // call before switching systems
 */
export function createClickTargetsManager() {
  /** @type {object|null} Parsed clickTargets.json, keyed by systemId */
  let targetData = null;

  /** @type {THREE.Mesh[]} Active hitbox meshes for the current system */
  let hitboxMeshes = [];

  /** @type {Map<string, object>} mesh.uuid -> clickTarget entry */
  let uuidToEntry = new Map();

  let debugVisible = false;

  /**
   * Fetch and cache clickTargets.json. Safe to call repeatedly — only fetches once.
   * @param {string} baseUrl  e.g. "/data/"
   */
  async function load(baseUrl) {
    if (targetData !== null) return;
    const url = `${baseUrl}clickTargets.json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `clickTargetsManager: failed to load ${url} (${res.status})`,
      );
    }
    targetData = await res.json();
  }

  /**
   * Create one SphereGeometry hitbox per entry for the given system and add them
   * to the scene. Each sphere is invisible (or wireframe when debugVisible=true).
   * @param {string}        systemId  Matches key in clickTargets.json
   * @param {THREE.Scene}   scene
   */
  function buildHitboxes(systemId, scene) {
    clearHitboxes(scene);
    if (!targetData) return;

    const entries = targetData[systemId];
    if (!Array.isArray(entries) || entries.length === 0) return;

    for (const entry of entries) {
      const [px, py, pz] = entry.position;

      const geometry = new THREE.SphereGeometry(entry.radius, 8, 8);
      const material = new THREE.MeshBasicMaterial({
        color: 0xff4444,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
        depthTest: false,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = entry.label;
      mesh.position.set(px, py, pz);
      mesh.visible = debugVisible;
      mesh.renderOrder = 2;
      mesh.userData.clickTarget = entry;

      scene.add(mesh);
      hitboxMeshes.push(mesh);
      uuidToEntry.set(mesh.uuid, entry);
    }
  }

  /**
   * Remove all hitbox meshes from the scene and free GPU memory.
   * Safe to call when the list is empty.
   * @param {THREE.Scene} scene
   */
  function clearHitboxes(scene) {
    for (const mesh of hitboxMeshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    hitboxMeshes = [];
    uuidToEntry.clear();
  }

  /** @returns {THREE.Mesh[]} Hitbox meshes to include in raycasting. */
  function getHitboxMeshes() {
    return hitboxMeshes;
  }

  /**
   * Returns the clickTarget entry (label, conceptId, position, radius) for a
   * hitbox identified by its mesh UUID, or null if not a hitbox mesh.
   * @param {string} uuid
   * @returns {object|null}
   */
  function getEntryByUuid(uuid) {
    return uuidToEntry.get(uuid) || null;
  }

  /**
   * Update the position and/or radius of a hotspot.
   * @param {string} uuid
   * @param {THREE.Vector3|object} position New position {x, y, z} or THREE.Vector3
   * @param {number} radius New radius
   */
  function updateHotspot(uuid, position, radius) {
    const mesh = hitboxMeshes.find((m) => m.uuid === uuid);
    if (!mesh) return;

    const entry = uuidToEntry.get(uuid);
    if (!entry) return;

    // Update entry data
    if (position) {
      const pos =
        position.x !== undefined
          ? [position.x, position.y, position.z]
          : position;
      entry.position = pos;
      mesh.position.set(...pos);
    }

    if (radius !== undefined) {
      entry.radius = radius;
      mesh.geometry.dispose();
      mesh.geometry = new THREE.SphereGeometry(radius, 8, 8);
    }
  }

  /**
   * Export all current hotspot data as a JSON object (for download).
   * @returns {object} Copy of targetData with current mesh positions
   */
  function exportCurrentData() {
    if (!targetData) return {};

    const exported = JSON.parse(JSON.stringify(targetData));

    // Update positions from current mesh states
    for (const mesh of hitboxMeshes) {
      const entry = uuidToEntry.get(mesh.uuid);
      if (entry) {
        entry.position = [
          parseFloat(mesh.position.x.toFixed(4)),
          parseFloat(mesh.position.y.toFixed(4)),
          parseFloat(mesh.position.z.toFixed(4)),
        ];
        entry.radius = parseFloat(mesh.geometry.parameters.radius.toFixed(4));
      }
    }

    return JSON.parse(JSON.stringify(targetData));
  }

  /**
   * Show or hide the red wireframe spheres for manual coordinate tuning.
   * @param {boolean} visible
   */
  function setDebugVisible(visible) {
    debugVisible = visible;
    for (const mesh of hitboxMeshes) {
      mesh.visible = visible;
    }
  }

  return {
    load,
    buildHitboxes,
    clearHitboxes,
    getHitboxMeshes,
    getEntryByUuid,
    updateHotspot,
    exportCurrentData,
    setDebugVisible,
  };
}
