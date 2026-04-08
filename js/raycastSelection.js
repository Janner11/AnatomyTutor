import * as THREE from "three";
import {
  buildNodePath,
  getAncestors,
  toFixedArray,
  toFixedArray2,
} from "./utils";

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

function computePointerNdc(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  pointerNdc.x = x * 2 - 1;
  pointerNdc.y = -(y * 2 - 1);
}

export function pickSelection(event, camera, canvas, targetMeshes) {
  computePointerNdc(event, canvas);
  raycaster.setFromCamera(pointerNdc, camera);

  const intersections = raycaster.intersectObjects(targetMeshes, false);
  if (!intersections.length) return null;

  const hit = intersections[0];
  const mesh = hit.object;
  const pointWorld = hit.point.clone();
  const pointLocal = mesh.worldToLocal(pointWorld.clone());
  const hierarchy = buildNodePath(mesh);
  const ancestors = getAncestors(mesh);

  let normalWorld = null;
  if (hit.face && hit.face.normal) {
    normalWorld = hit.face.normal.clone();
    normalWorld.transformDirection(mesh.matrixWorld).normalize();
  }

  return {
    object: mesh,
    meshName: mesh.name || "",
    nodeName: mesh.name || mesh.type,
    hierarchy,
    ancestorNames: ancestors.map((item) => item.name).filter(Boolean),
    pointWorld,
    pointWorldArray: toFixedArray(pointWorld),
    pointLocal,
    pointLocalArray: toFixedArray(pointLocal),
    normalWorld,
    normalWorldArray: toFixedArray(normalWorld),
    uv: hit.uv ? hit.uv.clone() : null,
    uvArray: toFixedArray2(hit.uv),
    faceIndex: Number.isInteger(hit.faceIndex) ? hit.faceIndex : null,
    distance: Number.isFinite(hit.distance)
      ? Number(hit.distance.toFixed(5))
      : null,
    pointerNdc: [
      Number(pointerNdc.x.toFixed(5)),
      Number(pointerNdc.y.toFixed(5)),
    ],
  };
}
