import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// WASM runtime files are loaded from CDN to avoid webpack WASM asset complexity.
// The CDN version must match the installed npm package version (0.10.21).
const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class HandTracker {
  constructor() {
    this._handLandmarker = null;
    this._video = null;
    this._lastVideoTime = -1;
    this._results = null;
    this._ready = false;
  }

  /**
   * Initializes the hand landmarker and opens the webcam.
   * @param {function(string): void} onStatus  - Called with progress/status messages
   * @returns {Promise<HTMLVideoElement>}  The live webcam video element
   */
  async init(onStatus) {
    onStatus("Cargando modelo de manos…");

    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    this._handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });

    onStatus("Solicitando acceso a cámara…");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
    } catch (err) {
      throw new Error("Acceso a cámara denegado: " + err.message);
    }

    this._video = document.createElement("video");
    this._video.srcObject = stream;
    this._video.autoplay = true;
    this._video.playsInline = true;
    this._video.muted = true;

    await new Promise((resolve, reject) => {
      this._video.addEventListener("loadeddata", resolve, { once: true });
      this._video.addEventListener("error", reject, { once: true });
    });

    this._ready = true;
    return this._video;
  }

  /**
   * Runs detection on the current webcam frame.
   * Safe to call every animation frame — skips re-processing if frame hasn't changed.
   * @returns {{ leftHand: Array|null, rightHand: Array|null }|null}
   */
  detect() {
    if (!this._ready || !this._video || this._video.readyState < 2) {
      return null;
    }
    if (this._video.currentTime === this._lastVideoTime) {
      return this._results;
    }
    this._lastVideoTime = this._video.currentTime;

    const raw = this._handLandmarker.detectForVideo(
      this._video,
      performance.now(),
    );
    this._results = this._parseResults(raw);
    return this._results;
  }

  get videoElement() {
    return this._video;
  }

  /**
   * MediaPipe reports handedness MIRRORED for front-facing cameras:
   *   "Left"  from the model → user's RIGHT hand
   *   "Right" from the model → user's LEFT hand
   * We swap them here so callers receive the correct real-world hand assignment.
   */
  _parseResults(raw) {
    let leftHand = null;
    let rightHand = null;

    if (!raw || !raw.landmarks) return { leftHand: null, rightHand: null };

    for (let i = 0; i < raw.landmarks.length; i++) {
      const handedness = raw.handednesses[i]?.[0]?.categoryName;
      if (handedness === "Left") {
        // MediaPipe "Left" = user's right hand (mirrored)
        rightHand = raw.landmarks[i];
      } else if (handedness === "Right") {
        // MediaPipe "Right" = user's left hand (mirrored)
        leftHand = raw.landmarks[i];
      }
    }

    return { leftHand, rightHand };
  }

  /** Stops webcam stream and releases the landmarker. */
  destroy() {
    this._ready = false;
    if (this._video && this._video.srcObject) {
      this._video.srcObject.getTracks().forEach((t) => t.stop());
      this._video.srcObject = null;
    }
    if (this._handLandmarker) {
      this._handLandmarker.close();
      this._handLandmarker = null;
    }
  }
}
