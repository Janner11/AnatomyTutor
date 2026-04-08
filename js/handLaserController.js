import * as THREE from "three";

// ── Configuration ─────────────────────────────────────────────────────────────
const RING_C = 100.53; // 2π × 16 (SVG progress-ring circumference)
const HOVER_MS = 1000; // dwell time before a hotspot selection fires
const RAY_MAX = 15; // laser length (metres) when nothing is hit
const LOSS_HOLD_MS = 450; // keep last known cursor position this long after hand disappears

// Sticky target: cursor must travel at least this far (NDC units, ~4-6% of screen)
// before the current hover target is abandoned.
const STICKY_RADIUS = 0.07;

// ── One Euro Filter ───────────────────────────────────────────────────────────
// Adaptively smooths fast movements (little lag) and slow ones (strong tremor reduction).
// Ref: Casiez et al. 2012  https://inria.hal.science/hal-00670496
const OEF_MIN_CUTOFF = 0.9; // lower = smoother at rest (more latency at rest)
const OEF_BETA = 0.006; // higher = faster response during fast movement
const OEF_D_CUTOFF = 1.0; // derivative low-pass cutoff (keep at 1.0)

class LpFilter {
  constructor() {
    this._v = null;
  }
  filter(x, alpha) {
    this._v = this._v === null ? x : alpha * x + (1 - alpha) * this._v;
    return this._v;
  }
  reset() {
    this._v = null;
  }
  get last() {
    return this._v;
  }
}

class OneEuroFilter {
  constructor(
    minCutoff = OEF_MIN_CUTOFF,
    beta = OEF_BETA,
    dCutoff = OEF_D_CUTOFF,
  ) {
    this._mc = minCutoff;
    this._b = beta;
    this._dc = dCutoff;
    this._xf = new LpFilter();
    this._df = new LpFilter();
    this._pt = null;
  }
  _alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x, t) {
    const dt =
      this._pt !== null ? Math.max((t - this._pt) / 1000, 0.004) : 0.016;
    this._pt = t;
    const prev = this._xf.last;
    const dxRaw = prev !== null ? (x - prev) / dt : 0;
    const adx = this._df.filter(dxRaw, this._alpha(this._dc, dt));
    return this._xf.filter(
      x,
      this._alpha(this._mc + this._b * Math.abs(adx), dt),
    );
  }
  reset() {
    this._xf.reset();
    this._df.reset();
    this._pt = null;
  }
}

// ── Controller ────────────────────────────────────────────────────────────────
export class HandLaserController {
  /**
   * @param {THREE.Scene}   scene
   * @param {THREE.Camera}  camera
   * @param {HTMLElement}   canvas      renderer.domElement
   * @param {function(THREE.Object3D, THREE.Vector3): void} onSelect
   */
  constructor(scene, camera, canvas, onSelect) {
    this._scene = scene;
    this._camera = camera;
    this._canvas = canvas;
    this._onSelect = onSelect;
    this._raycaster = new THREE.Raycaster();

    // ── Laser line ────────────────────────────────────────────────────────────
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(6), 3),
    );
    const mat = new THREE.LineBasicMaterial({
      color: 0xff2020,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    this._line = new THREE.Line(geo, mat);
    this._line.renderOrder = 999;
    this._line.frustumCulled = false;
    this._line.visible = false;
    scene.add(this._line);

    // ── Cursor overlay (SVG progress ring) ────────────────────────────────────
    this._cursor = document.createElement("div");
    this._cursor.className = "hand-laser-cursor";
    this._cursor.innerHTML =
      `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,50,50,0.2)" stroke-width="3"/>` +
      `<circle class="laser-ring" cx="20" cy="20" r="16" fill="none"` +
      ` stroke="#ff2020" stroke-width="3"` +
      ` stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"` +
      ` stroke-linecap="round" transform="rotate(-90 20 20)"/>` +
      `</svg>`;
    this._cursor.style.cssText =
      "position:fixed;width:40px;height:40px;pointer-events:none;z-index:200;display:none;";
    document.body.appendChild(this._cursor);
    this._ring = this._cursor.querySelector(".laser-ring");

    // ── One Euro Filters (separate for X and Y) ───────────────────────────────
    this._filterX = new OneEuroFilter();
    this._filterY = new OneEuroFilter();
    this._smoothNdc = null; // cached last filtered NDC

    // ── Tracking-loss hold ────────────────────────────────────────────────────
    this._lostAt = null; // timestamp when hand was lost

    // ── Hover & sticky-target state ───────────────────────────────────────────
    this._hoverUuid = null;
    this._hoverStart = null;
    this._lastSelectedUuid = null;
    this._stickyCenter = null; // NDC position where hover started (for sticky radius)
  }

  /**
   * Call every animation frame.
   * @param {{ x: number, y: number }|null} ndc  Raw fingertip NDC; null when gesture off.
   * @param {THREE.Object3D[]} targetMeshes       From clickTargetsManager.getHitboxMeshes().
   */
  update(ndc, targetMeshes) {
    const now = performance.now();

    // ── Tracking-loss hold: keep last cursor for up to LOSS_HOLD_MS ──────────
    let effectiveNdc = ndc;
    if (ndc === null && this._smoothNdc !== null) {
      if (this._lostAt === null) this._lostAt = now;
      const elapsed = now - this._lostAt;
      if (elapsed < LOSS_HOLD_MS) {
        effectiveNdc = this._smoothNdc;
        const fadeAlpha = (1 - elapsed / LOSS_HOLD_MS).toFixed(2);
        this._cursor.style.opacity = fadeAlpha;
        this._line.material.opacity = 0.85 * Number(fadeAlpha);
      } else {
        this._lostAt = null;
        this._smoothNdc = null;
        this._filterX.reset();
        this._filterY.reset();
      }
    } else if (ndc !== null) {
      this._lostAt = null;
      this._cursor.style.opacity = "1";
      this._line.material.opacity = 0.85;
    }

    const active = effectiveNdc !== null;
    this._line.visible = active;
    this._cursor.style.display = active ? "block" : "none";

    if (!active || !targetMeshes.length) {
      if (!active) this._resetHover();
      return;
    }

    // ── One Euro Filter smoothing ─────────────────────────────────────────────
    const t = now;
    const fx = ndc !== null ? this._filterX.filter(ndc.x, t) : effectiveNdc.x;
    const fy = ndc !== null ? this._filterY.filter(ndc.y, t) : effectiveNdc.y;
    const sNdc = { x: fx, y: fy };
    this._smoothNdc = sNdc;

    // ── Position cursor ───────────────────────────────────────────────────────
    const rect = this._canvas.getBoundingClientRect();
    const sx = ((sNdc.x + 1) / 2) * rect.width + rect.left;
    const sy = ((-sNdc.y + 1) / 2) * rect.height + rect.top;
    this._cursor.style.left = `${sx - 20}px`;
    this._cursor.style.top = `${sy - 20}px`;

    // ── Raycast ───────────────────────────────────────────────────────────────
    this._raycaster.setFromCamera(sNdc, this._camera);
    const origin = this._raycaster.ray.origin;
    const dir = this._raycaster.ray.direction;
    const lineStart = origin.clone().addScaledVector(dir, 0.2);
    const hits = this._raycaster.intersectObjects(targetMeshes, false);

    let lineEnd;
    if (hits.length > 0) {
      const hit = hits[0];
      lineEnd = hit.point.clone();
      let uuid = hit.object.uuid;

      // ── Sticky target: resist brief excursions outside the current target ──
      if (
        this._hoverUuid !== null &&
        uuid !== this._hoverUuid &&
        this._stickyCenter
      ) {
        const dx = sNdc.x - this._stickyCenter.x;
        const dy = sNdc.y - this._stickyCenter.y;
        if (Math.sqrt(dx * dx + dy * dy) < STICKY_RADIUS) {
          uuid = this._hoverUuid; // snap back to current target
        }
      }

      if (uuid !== this._hoverUuid) {
        this._hoverUuid = uuid;
        this._hoverStart = now;
        this._lastSelectedUuid = null;
        this._stickyCenter = { x: sNdc.x, y: sNdc.y };
        this._ring.style.strokeDashoffset = String(RING_C);
      } else {
        const progress = Math.min((now - this._hoverStart) / HOVER_MS, 1);
        this._ring.style.strokeDashoffset = String(RING_C * (1 - progress));
        if (progress >= 1 && uuid !== this._lastSelectedUuid) {
          this._lastSelectedUuid = uuid;
          this._onSelect(hit.object, hit.point.clone());
        }
      }
    } else {
      // ── No direct hit — maintain hover if still inside sticky radius ──────
      if (this._hoverUuid !== null && this._stickyCenter) {
        const dx = sNdc.x - this._stickyCenter.x;
        const dy = sNdc.y - this._stickyCenter.y;
        if (Math.sqrt(dx * dx + dy * dy) < STICKY_RADIUS) {
          // Still "on" the target — advance hover timer
          lineEnd = lineStart.clone().addScaledVector(dir, RAY_MAX);
          const progress = Math.min((now - this._hoverStart) / HOVER_MS, 1);
          this._ring.style.strokeDashoffset = String(RING_C * (1 - progress));
        } else {
          lineEnd = lineStart.clone().addScaledVector(dir, RAY_MAX);
          this._resetHover();
        }
      } else {
        lineEnd = lineStart.clone().addScaledVector(dir, RAY_MAX);
        this._resetHover();
      }
    }

    // ── Update laser line geometry ────────────────────────────────────────────
    const pos = this._line.geometry.attributes.position;
    pos.setXYZ(0, lineStart.x, lineStart.y, lineStart.z);
    pos.setXYZ(1, lineEnd.x, lineEnd.y, lineEnd.z);
    pos.needsUpdate = true;
  }

  _resetHover() {
    this._hoverUuid = null;
    this._hoverStart = null;
    this._lastSelectedUuid = null;
    this._stickyCenter = null;
    if (this._ring) this._ring.style.strokeDashoffset = String(RING_C);
  }

  destroy() {
    this._scene.remove(this._line);
    this._line.geometry.dispose();
    this._line.material.dispose();
    if (this._cursor.parentNode)
      this._cursor.parentNode.removeChild(this._cursor);
    this._filterX.reset();
    this._filterY.reset();
  }
}
