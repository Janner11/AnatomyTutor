// MediaPipe hand landmark indices
// 0: WRIST
// 1-4:   THUMB  (CMC, MCP, IP, TIP)
// 5-8:   INDEX  (MCP, PIP, DIP, TIP)
// 9-12:  MIDDLE (MCP, PIP, DIP, TIP)
// 13-16: RING   (MCP, PIP, DIP, TIP)
// 17-20: PINKY  (MCP, PIP, DIP, TIP)

// Connections with per-segment finger assignment for coloring
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
  // Middle
  [5, 9, "palm"],
  [9, 10, "middle"],
  [10, 11, "middle"],
  [11, 12, "middle"],
  // Ring
  [9, 13, "palm"],
  [13, 14, "ring"],
  [14, 15, "ring"],
  [15, 16, "ring"],
  // Pinky
  [13, 17, "palm"],
  [17, 18, "pinky"],
  [18, 19, "pinky"],
  [19, 20, "pinky"],
  // Wrist → pinky MCP (palm base)
  [0, 17, "palm"],
];

// Finger tip landmark indices
const TIPS = [4, 8, 12, 16, 20];

// Per-finger colors
const COLORS = {
  thumb: "#ffb300",
  index: "#00d4ff",
  middle: "#4cd137",
  ring: "#c56cff",
  pinky: "#ff6b81",
  palm: "rgba(255,255,255,0.55)",
};

/**
 * Clears the canvas and draws both hands with color-coded joints/bones.
 * The canvas element should have CSS transform: scaleX(-1) applied
 * so it visually mirrors the webcam feed.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array|null} leftHand   - MediaPipe landmarks for user's left hand
 * @param {Array|null} rightHand  - MediaPipe landmarks for user's right hand
 */
export function drawHands(ctx, leftHand, rightHand) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (leftHand) _drawOne(ctx, leftHand, w, h, 0.72);
  if (rightHand) _drawOne(ctx, rightHand, w, h, 1.0);
}

function _drawOne(ctx, landmarks, w, h, alpha) {
  ctx.globalAlpha = alpha;

  // ── Bones ──────────────────────────────────────────────────────────────────
  ctx.lineWidth = 2.5;
  for (const [a, b, finger] of SEGMENTS) {
    const ax = landmarks[a].x * w;
    const ay = landmarks[a].y * h;
    const bx = landmarks[b].x * w;
    const by = landmarks[b].y * h;

    ctx.strokeStyle = COLORS[finger];
    ctx.shadowColor = COLORS[finger];
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  // ── Joints ─────────────────────────────────────────────────────────────────
  for (let i = 0; i < landmarks.length; i++) {
    const x = landmarks[i].x * w;
    const y = landmarks[i].y * h;
    const isTip = TIPS.includes(i);
    const isWrist = i === 0;

    const radius = isWrist ? 4.5 : isTip ? 4 : 2.5;
    const fill = isTip ? "#ffffff" : "#dddddd";
    const stroke = isWrist ? "#888" : "#333";

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}
