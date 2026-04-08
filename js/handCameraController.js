import * as THREE from "three";

// ── Configuration ─────────────────────────────────────────────────────────────
const INITIAL_RADIUS = 2.5;
const MIN_RADIUS = 0.4;
const MAX_RADIUS = 8.0;

// How many radians to rotate per unit of palm displacement in [0,1] space.
const ORBIT_SENS = Math.PI * 2.0;

// Zoom sensitivity: multiplier for palm distance changes.
const ZOOM_SENS = 4.0;
const ZOOM_DEAD_ZONE = 0.003;

// Dead zone: palm displacement below this from the gesture anchor is ignored.
const DEAD_ZONE = 0.025;

const MIN_POLAR = 0.08; // prevent gimbal flip at top pole
const MAX_POLAR = Math.PI - 0.08;

// EMA smoothing for the mapped angles and radius.
const SMOOTH = 0.2;

export class HandCameraController {
  constructor(camera, controls) {
    this._camera = camera;
    this._controls = controls;
    this._sph = new THREE.Spherical();

    this._radius = INITIAL_RADIUS;
    this._smoothRadius = INITIAL_RADIUS;

    // Orbit Anchor
    this._anchorPalm = null; // { x, y }
    this._anchorTheta = 0;
    this._anchorPhi = 0;
    this._smoothTheta = null;
    this._smoothPhi = null;

    // Zoom state
    this._isZooming = false;
    this._lastZoomDist = undefined;
  }

  /**
   * Orbit logic (one hand open).
   */
  updateOrbit(palmPos, openHand) {
    if (!openHand || !palmPos) {
      this._anchorPalm = null;
      this._smoothTheta = null;
      this._smoothPhi = null;
      this._applyToCamera();
      return;
    }

    if (this._anchorPalm === null) {
      this._sph.setFromVector3(
        this._camera.position.clone().sub(this._controls.target),
      );
      this._anchorPalm = { x: palmPos.x, y: palmPos.y };
      this._anchorTheta = this._sph.theta;
      this._anchorPhi = this._sph.phi;
      this._smoothTheta = this._sph.theta;
      this._smoothPhi = this._sph.phi;
      return;
    }

    let dx = palmPos.x - this._anchorPalm.x;
    let dy = palmPos.y - this._anchorPalm.y;

    if (Math.abs(dx) < DEAD_ZONE) dx = 0;
    if (Math.abs(dy) < DEAD_ZONE) dy = 0;

    const targetTheta = this._anchorTheta - dx * ORBIT_SENS;
    const targetPhi = Math.max(
      MIN_POLAR,
      Math.min(MAX_POLAR, this._anchorPhi - dy * ORBIT_SENS),
    );

    if (this._smoothTheta === null) {
      this._smoothTheta = targetTheta;
      this._smoothPhi = targetPhi;
    } else {
      this._smoothTheta += SMOOTH * (targetTheta - this._smoothTheta);
      this._smoothPhi += SMOOTH * (targetPhi - this._smoothPhi);
    }

    this._sph.theta = this._smoothTheta;
    this._sph.phi = this._smoothPhi;
    this._applyToCamera();
  }

  /**
   * Zoom logic (two hands prayer gesture).
   */
  updateZoom(active, distance) {
    if (active) {
      if (!this._isZooming) {
        this._isZooming = true;
        this._lastZoomDist = distance;
      }
      if (this._lastZoomDist !== undefined) {
        const delta = distance - this._lastZoomDist;
        if (Math.abs(delta) >= ZOOM_DEAD_ZONE) {
          this._radius = Math.max(
            MIN_RADIUS,
            Math.min(MAX_RADIUS, this._radius - delta * ZOOM_SENS),
          );
        }
        this._lastZoomDist = distance;
      }
      this._applyToCamera();
    } else if (this._isZooming) {
      // Solo resetea si estaba en modo zoom
      this._isZooming = false;
      this._lastZoomDist = undefined;
      this._applyToCamera();
    }
  }

  _applyToCamera() {
    // Smooth the radius change
    this._smoothRadius += SMOOTH * (this._radius - this._smoothRadius);

    this._sph.setFromVector3(
      this._camera.position.clone().sub(this._controls.target),
    );
    this._sph.radius = this._smoothRadius;

    // If we are currently orbiting, we already set theta/phi in updateOrbit.
    // Otherwise, we keep current theta/phi.
    if (this._smoothTheta !== null && this._smoothPhi !== null) {
      this._sph.theta = this._smoothTheta;
      this._sph.phi = this._smoothPhi;
    }

    this._camera.position
      .setFromSpherical(this._sph)
      .add(this._controls.target);
    this._controls.update();
  }

  // Backwards compatibility for app.js if needed, though we'll likely refactor app.js
  update(palmPos, openHand) {
    this.updateOrbit(palmPos, openHand);
  }
}
