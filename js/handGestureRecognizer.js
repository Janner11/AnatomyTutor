// MediaPipe Hand Landmark indices:
//   0:      WRIST
//   1-4:    THUMB  (CMC, MCP, IP, TIP)
//   5-8:    INDEX  (MCP, PIP, DIP, TIP)
//   9-12:   MIDDLE (MCP, PIP, DIP, TIP)
//  13-16:   RING   (MCP, PIP, DIP, TIP)
//  17-20:   PINKY  (MCP, PIP, DIP, TIP)
//
// Coordinate system: y = 0 at top of image, y = 1 at bottom.
//   Extended finger: tip.y < pip.y  (tip is higher in the image)
//   Curled finger:   tip.y > pip.y  (tip hangs below the PIP joint)

// ── Hysteresis configuration ──────────────────────────────────────────────────
// All thresholds and timing tunable here
const CFG = {
  gun: {
    enterThreshold: 0.65,
    exitThreshold: 0.42,
    activationFrames: 3,
    deactivationFrames: 6,
  },
  openHand: {
    enterThreshold: 0.6,
    exitThreshold: 0.38,
    activationFrames: 4, // slightly slower activation = fewer accidental orbits
    deactivationFrames: 5,
  },
  fist: {
    enterThreshold: 0.65,
    exitThreshold: 0.42,
    activationFrames: 3,
    deactivationFrames: 6,
  },
  // Pinch: thumb tip (4) close to index tip (8) — replaces fist for zoom
  pinch: {
    enterThreshold: 0.72,
    exitThreshold: 0.45,
    activationFrames: 3,
    deactivationFrames: 5,
  },
};

// ── Score helpers ─────────────────────────────────────────────────────────────
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Continuous extension score for one finger (0 = fully curled, 1 = fully extended).
 * Uses a tolerance band around the zero-crossing for granular transitions.
 */
function extendScore(lm, tip, pip) {
  // pip.y > tip.y → tip is above pip in image (screen-Y inverted) → extended
  return clamp01((lm[pip].y - lm[tip].y + 0.07) / 0.15);
}

function curlScore(lm, tip, pip) {
  return 1 - extendScore(lm, tip, pip);
}

function computeGunScore(lm) {
  const indexExt = extendScore(lm, 8, 6);
  const middleCurl = curlScore(lm, 12, 10);
  const ringCurl = curlScore(lm, 16, 14);
  const pinkyCurl = curlScore(lm, 20, 18);
  return indexExt * 0.4 + ((middleCurl + ringCurl + pinkyCurl) / 3) * 0.6;
}

function computeOpenHandScore(lm) {
  return (
    (extendScore(lm, 8, 6) +
      extendScore(lm, 12, 10) +
      extendScore(lm, 16, 14) +
      extendScore(lm, 20, 18)) /
    4
  );
}

function computeFistScore(lm) {
  return (
    (curlScore(lm, 8, 6) +
      curlScore(lm, 12, 10) +
      curlScore(lm, 16, 14) +
      curlScore(lm, 20, 18)) /
    4
  );
}

function computePinchScore(lm) {
  // Distance between thumb tip (4) and index tip (8) in normalised [0,1] coords.
  // Both x and y used; z adds depth but its scale differs → skip for stability.
  const dx = lm[4].x - lm[8].x;
  const dy = lm[4].y - lm[8].y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // ~0.02 touching → score ≈ 1 ;  ~0.16 fully spread → score ≈ 0
  return clamp01(1 - (dist - 0.02) / 0.14);
}

// ── Hysteresis gate ───────────────────────────────────────────────────────────
class GestureGate {
  constructor({
    enterThreshold,
    exitThreshold,
    activationFrames,
    deactivationFrames,
  }) {
    this._enter = enterThreshold;
    this._exit = exitThreshold;
    this._actF = activationFrames;
    this._deactF = deactivationFrames;
    this._active = false;
    this._pending = 0;
    this._score = 0;
    this._justActivated = false;
    this._justReleased = false;
  }

  update(score) {
    this._score = score;
    this._justActivated = false;
    this._justReleased = false;

    if (!this._active) {
      if (score >= this._enter) {
        if (++this._pending >= this._actF) {
          this._active = true;
          this._pending = 0;
          this._justActivated = true;
        }
      } else {
        this._pending = 0;
      }
    } else {
      if (score < this._exit) {
        if (++this._pending >= this._deactF) {
          this._active = false;
          this._pending = 0;
          this._justReleased = true;
        }
      } else {
        this._pending = 0;
      }
    }
  }

  reset() {
    this._active = false;
    this._pending = 0;
    this._score = 0;
    this._justActivated = false;
    this._justReleased = false;
  }

  get active() {
    return this._active;
  }
  get score() {
    return this._score;
  }
  get justActivated() {
    return this._justActivated;
  }
  get justReleased() {
    return this._justReleased;
  }
}

// ── Stateful per-hand recognizer ──────────────────────────────────────────────
/**
 * Tracks gesture state over time with hysteresis so brief landmark noise cannot
 * toggle a gesture on/off within a single frame.
 *
 * Usage:
 *   const rec = new HandGestureRecognizer();
 *   // in animate():
 *   const state = rec.update(landmarks);  // landmarks may be null
 *   if (state.gun.active) { ... }
 */
export class HandGestureRecognizer {
  constructor() {
    this._gun = new GestureGate(CFG.gun);
    this._openHand = new GestureGate(CFG.openHand);
    this._fist = new GestureGate(CFG.fist);
    this._pinch = new GestureGate(CFG.pinch);
  }

  /**
   * @param {Array|null} landmarks
   * @returns {{ gun, openHand, fist, pinch }}  Each: { active, justActivated, justReleased, score }
   */
  update(landmarks) {
    if (!landmarks) {
      this._gun.reset();
      this._openHand.reset();
      this._fist.reset();
      this._pinch.reset();
    } else {
      this._gun.update(computeGunScore(landmarks));
      this._openHand.update(computeOpenHandScore(landmarks));
      this._fist.update(computeFistScore(landmarks));
      this._pinch.update(computePinchScore(landmarks));
    }
    return {
      gun: {
        active: this._gun.active,
        justActivated: this._gun.justActivated,
        justReleased: this._gun.justReleased,
        score: this._gun.score,
      },
      openHand: {
        active: this._openHand.active,
        justActivated: this._openHand.justActivated,
        justReleased: this._openHand.justReleased,
        score: this._openHand.score,
      },
      fist: {
        active: this._fist.active,
        justActivated: this._fist.justActivated,
        justReleased: this._fist.justReleased,
        score: this._fist.score,
      },
      pinch: {
        active: this._pinch.active,
        justActivated: this._pinch.justActivated,
        justReleased: this._pinch.justReleased,
        score: this._pinch.score,
      },
    };
  }
}

// ── Stateless legacy helpers (kept for backward compatibility) ────────────────
const FINGERS = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
];

function extended(lm, tip, pip) {
  return lm[tip].y < lm[pip].y;
}
function curled(lm, tip, pip) {
  return lm[tip].y > lm[pip].y;
}

export function isGunGesture(landmarks) {
  if (!landmarks) return false;
  return (
    extended(landmarks, 8, 6) &&
    curled(landmarks, 12, 10) &&
    curled(landmarks, 16, 14) &&
    curled(landmarks, 20, 18)
  );
}

export function isOpenHand(landmarks) {
  if (!landmarks) return false;
  return FINGERS.every(([tip, pip]) => extended(landmarks, tip, pip));
}

export function isFist(landmarks) {
  if (!landmarks) return false;
  return FINGERS.every(([tip, pip]) => curled(landmarks, tip, pip));
}

/**
 * Returns a precision-improved NDC point [-1, 1] for right-hand laser aiming.
 * Extends the MCP→TIP vector 55% beyond the tip and mirrors X.
 */
export function getIndexTipNdc(landmarks) {
  if (!landmarks) return null;
  const mcp = landmarks[5];
  const tip = landmarks[8];
  const EXTEND = 0.55;
  const px = tip.x + (tip.x - mcp.x) * EXTEND;
  const py = tip.y + (tip.y - mcp.y) * EXTEND;
  return { x: (1 - px) * 2 - 1, y: -(py * 2 - 1) };
}

export function getPalmCenter(landmarks) {
  if (!landmarks) return null;
  const p = landmarks[9];
  return { x: 1 - p.x, y: p.y };
}

/**
 * Returns 3D palm center in normalized space [0,1], with X mirrored for intuition.
 */
export function getPalmCenter3D(landmarks) {
  if (!landmarks) return null;
  const p = landmarks[9];
  return { x: 1 - p.x, y: p.y, z: p.z };
}

/**
 * Midpoint between thumb tip (4) and index tip (8), mirrored X.
 * Use as the tracking point for pinch-zoom.
 */
export function getPinchCenter(landmarks) {
  if (!landmarks) return null;
  const tx = (landmarks[4].x + landmarks[8].x) / 2;
  const ty = (landmarks[4].y + landmarks[8].y) / 2;
  return { x: 1 - tx, y: ty };
}
