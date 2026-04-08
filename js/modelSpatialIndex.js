import * as THREE from "three";
import { normalizeName, buildNodePath, getAncestors } from "./utils";

// ── numeric helpers ───────────────────────────────────────────────────────────

function a3(v, d = 5) {
  if (!v) return null;
  return [+v.x.toFixed(d), +v.y.toFixed(d), +v.z.toFixed(d)];
}

/**
 * Compute the centroid of a BufferGeometry's position attribute by averaging
 * all vertex positions in local space. This is the geometric mean, not the
 * bounding-sphere center, so it better represents the organ's "center of mass".
 */
function computeCentroid(posAttr) {
  const c = new THREE.Vector3();
  const n = posAttr.count;
  for (let i = 0; i < n; i++) {
    c.x += posAttr.getX(i);
    c.y += posAttr.getY(i);
    c.z += posAttr.getZ(i);
  }
  if (n > 0) c.divideScalar(n);
  return c;
}

/**
 * Decompose matrixWorld and return the maximum absolute scale component.
 * Used to convert a local bounding-sphere radius to world space without
 * losing accuracy under non-uniform scale transforms.
 */
function maxWorldScale(mw) {
  const s = new THREE.Vector3();
  mw.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  return Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
}

// ── name resolution against nameIndex ────────────────────────────────────────

/**
 * Priority order (all applied against the nameIndex of the active system):
 *   1. Exact mesh name  → confidence: 'high',   sourceType: 'mesh-derived'
 *   2. Normalised name  → confidence: 'medium', sourceType: 'mesh-derived'
 *   3. Ancestor names   → confidence: 'medium', sourceType: 'mesh-derived'
 *   4. Substring approx → confidence: 'low',    sourceType: 'approximate'
 *   5. No match         → confidence: 'low',    sourceType: 'unresolved'
 *
 * No fallback coordinates are invented. If no match is found the entry is
 * simply marked as unresolved so the UI can display an honest warning.
 */
function resolveFromIndex(mesh, directMap, normMap) {
  const name = mesh.name || "";

  // 1. Exact name
  if (name && directMap.has(name)) {
    return {
      anatomyId: directMap.get(name),
      confidence: "high",
      matchedBy: name,
      sourceType: "mesh-derived",
    };
  }

  // 2. Normalised name
  const norm = normalizeName(name);
  if (norm && normMap.has(norm)) {
    return {
      anatomyId: normMap.get(norm),
      confidence: "medium",
      matchedBy: name,
      sourceType: "mesh-derived",
    };
  }

  // 3. Ancestor names (scene graph parents before root)
  const ancestors = getAncestors(mesh);
  for (const anc of ancestors) {
    const aName = anc.name || "";
    if (aName && directMap.has(aName)) {
      return {
        anatomyId: directMap.get(aName),
        confidence: "medium",
        matchedBy: aName,
        sourceType: "mesh-derived",
      };
    }
    const normA = normalizeName(aName);
    if (normA && normMap.has(normA)) {
      return {
        anatomyId: normMap.get(normA),
        confidence: "medium",
        matchedBy: aName,
        sourceType: "mesh-derived",
      };
    }
  }

  // 4. Substring approximation across all candidates
  const candidates = [name, ...ancestors.map((a) => a.name || "")].filter(
    Boolean,
  );
  for (const cand of candidates) {
    const q = normalizeName(cand);
    if (!q) continue;
    for (const [idxName, anatomyId] of normMap) {
      if (!idxName) continue;
      if (idxName.includes(q) || q.includes(idxName)) {
        return {
          anatomyId,
          confidence: "low",
          matchedBy: cand,
          sourceType: "approximate",
        };
      }
    }
  }

  // 5. Unresolved
  return {
    anatomyId: null,
    confidence: "low",
    matchedBy: null,
    sourceType: "unresolved",
  };
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Traverse `gltfScene`, compute per-mesh spatial data from real geometry, and
 * resolve each mesh to an anatomyId using `rawNameIndex` (the content of
 * data/nameIndex.{system}.json).
 *
 * Returns a Map<meshUuid, SpatialEntry> where every value contains:
 *  - anatomyId, confidence, matchedBy, sourceType, approximate, notes
 *  - centroidLocal / centroidWorld  (geometric mean of vertices)
 *  - boundingBoxLocal / boundingBoxWorld
 *  - boundingSphereLocal / boundingSphereWorld
 *  - nodePath (from mesh to scene root)
 *
 * Nothing in this function invents anatomical coordinates. All positions come
 * from Three.js geometry computations applied to the loaded model.
 */
export function buildSpatialIndex(gltfScene, rawNameIndex) {
  // Build lookup maps from the raw nameIndex JSON
  const directMap = new Map();
  const normMap = new Map();

  Object.entries(rawNameIndex || {}).forEach(([key, conceptId]) => {
    if (!key || String(key).startsWith("__")) return;
    directMap.set(key, String(conceptId));
    normMap.set(normalizeName(key), String(conceptId));
  });

  const index = new Map();

  gltfScene.traverse((node) => {
    if (!node.isMesh) return;
    const geo = node.geometry;
    if (!geo || !geo.attributes.position) return;

    // Ensure world matrices are up to date before any world-space computation
    node.updateWorldMatrix(true, false);
    const mw = node.matrixWorld;

    // ── centroid ──────────────────────────────────────────────────────────────
    const centroidLocal = computeCentroid(geo.attributes.position);
    const centroidWorld = centroidLocal.clone().applyMatrix4(mw);

    // ── bounding box ──────────────────────────────────────────────────────────
    geo.computeBoundingBox();
    const bboxLocal = geo.boundingBox.clone();
    // Box3.applyMatrix4 transforms all 8 corners then recomputes the AABB
    const bboxWorld = new THREE.Box3().copy(bboxLocal).applyMatrix4(mw);

    // ── bounding sphere ───────────────────────────────────────────────────────
    geo.computeBoundingSphere();
    const bsLocal = geo.boundingSphere;
    // Transform center to world space; scale radius by max axis scale
    const bsCenterWorld = bsLocal.center.clone().applyMatrix4(mw);
    const bsRadiusWorld = bsLocal.radius * maxWorldScale(mw);

    // ── anatomy resolution ────────────────────────────────────────────────────
    const res = resolveFromIndex(node, directMap, normMap);

    const isApprox = res.confidence === "low";
    const notes =
      res.sourceType === "unresolved"
        ? "Mesh no encontrado en el índice del sistema activo. Añade una entrada en data/nameIndex.{system}.json con el mesh name exacto del GLB."
        : res.confidence === "low"
          ? `Coincidencia por substring aproximado ("${res.matchedBy}"). Verifica el mesh name en el GLB e introduce el mapeo exacto en data/nameIndex.{system}.json.`
          : null;

    index.set(node.uuid, {
      meshUuid: node.uuid,
      meshName: node.name || "",
      nodePath: buildNodePath(node),

      // Anatomy resolution — derived entirely from nameIndex, not invented
      anatomyId: res.anatomyId,
      confidence: res.confidence,
      matchedBy: res.matchedBy,
      sourceType: res.sourceType,
      approximate: isApprox,
      notes,

      // Spatial data — derived entirely from Three.js geometry math on the real model
      centroidLocal: a3(centroidLocal),
      centroidWorld: a3(centroidWorld),
      boundingBoxLocal: {
        min: a3(bboxLocal.min),
        max: a3(bboxLocal.max),
      },
      boundingBoxWorld: {
        min: a3(bboxWorld.min),
        max: a3(bboxWorld.max),
      },
      boundingSphereLocal: {
        center: a3(bsLocal.center),
        radius: +bsLocal.radius.toFixed(5),
      },
      boundingSphereWorld: {
        center: a3(bsCenterWorld),
        radius: +bsRadiusWorld.toFixed(5),
      },
    });
  });

  return index;
}

/** Look up the pre-computed spatial entry for a mesh by its THREE uuid. */
export function lookupSpatialEntry(index, meshUuid) {
  return index.get(meshUuid) || null;
}
