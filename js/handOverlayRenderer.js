// Skeleton connections with per-segment finger assignments for colour-coding
const SEGMENTS = [
  // Thumb
  [0, 1, "thumb"],
  [1, 2, "thumb"],
  [2, 3, "thumb"],
  [3, 4, "thumb"],
  // Index
  [0, 5, "index"],
  [5, 6, "index"],
  [6, 7, "index"],
  [7, 8, "index"],
  // Middle (+ palm bridge)
  [5, 9, "palm"],
  [9, 10, "middle"],
  [10, 11, "middle"],
  [11, 12, "middle"],
  // Ring (+ palm bridge)
  [9, 13, "palm"],
  [13, 14, "ring"],
  [14, 15, "ring"],
  [15, 16, "ring"],
  // Pinky (+ palm bridge)
  [13, 17, "palm"],
  [17, 18, "pinky"],
  [18, 19, "pinky"],
  [19, 20, "pinky"],
  // Wrist → pinky MCP base
  [0, 17, "palm"],
];

const TIPS = [4, 8, 12, 16, 20];

// Right hand — warm red tones
const RIGHT_COLORS = {
  thumb: "#ffb300",
  index: "#ff3a3a",
  middle: "#ff6060",
  ring: "#ff8585",
  pinky: "#ffaaaa",
  palm: "rgba(255,210,210,0.5)",
};

// Left hand — cool blue tones
const LEFT_COLORS = {
  thumb: "#00e5ff",
  index: "#4499ff",
  middle: "#6677ff",
  ring: "#9966ee",
  pinky: "#cc88ff",
  palm: "rgba(180,200,255,0.5)",
};

/**
 * Full-screen canvas overlay that draws MediaPipe hand skeletons on top of the
 * Three.js viewport.  Landmark coordinates (normalised [0,1]) are mapped to
 * the full window size.
 *
 * The canvas element has CSS  transform: scaleX(-1)  so the hands appear
 * mirrored — matching the mirrored webcam preview and the cursor position
 * calculated in handGestureRecognizer.getIndexTipNdc().
 */
export class HandOverlayRenderer {
  constructor() {
    this._canvas = document.createElement("canvas");
    this._canvas.id = "hand-overlay-canvas";
    this._canvas.style.cssText =
      "position:fixed;inset:0;width:100vw;height:100vh;" +
      "pointer-events:none;z-index:12;transform:scaleX(-1);";
    document.body.appendChild(this._canvas);
    this._ctx = this._canvas.getContext("2d");
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
    this._resize();
  }

  _resize() {
    this._canvas.width = window.innerWidth;
    this._canvas.height = window.innerHeight;
  }

  /**
   * Call once per animation frame.
   * @param {Array|null} leftHand   MediaPipe landmarks for user's left hand
   * @param {Array|null} rightHand  MediaPipe landmarks for user's right hand
   */
  render(leftHand, rightHand) {
    const { width: w, height: h } = this._canvas;
    this._ctx.clearRect(0, 0, w, h);
    if (leftHand) this._drawHand(leftHand, LEFT_COLORS, "I", 0.72);
    if (rightHand) this._drawHand(rightHand, RIGHT_COLORS, "D", 0.88);
  }

  _drawHand(lm, colors, label, alpha) {
    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;

    ctx.globalAlpha = alpha;

    // ── Bones ─────────────────────────────────────────────────────────────────
    ctx.lineWidth = 2.8;
    for (const [a, b, finger] of SEGMENTS) {
      ctx.strokeStyle = colors[finger];
      ctx.shadowColor = colors[finger];
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // ── Joints ────────────────────────────────────────────────────────────────
    for (let i = 0; i < lm.length; i++) {
      const px = lm[i].x * w;
      const py = lm[i].y * h;
      const isTip = TIPS.includes(i);
      const isWrist = i === 0;

      ctx.beginPath();
      ctx.arc(px, py, isWrist ? 5.5 : isTip ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? "#ffffff" : "#dddddd";
      ctx.fill();
      ctx.strokeStyle = isWrist ? "#888888" : "#333333";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── "I" / "D" label near wrist ────────────────────────────────────────────
    const wx = lm[0].x * w;
    const wy = lm[0].y * h;
    ctx.globalAlpha = alpha * 0.95;
    ctx.font = "bold 14px 'Segoe UI', sans-serif";
    ctx.fillStyle = label === "D" ? "#ff8888" : "#88bbff";
    ctx.fillText(label, wx + 9, wy - 9);

    ctx.globalAlpha = 1;
  }

  destroy() {
    window.removeEventListener("resize", this._onResize);
    this._canvas.remove();
  }
}
