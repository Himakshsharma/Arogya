// In-browser landmark tracking with MediaPipe hand + pose landmarkers.
import { assignHands, normalizeRaw } from './landmarks.js'

const VERSION = '0.10.14'
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

let modelsPromise = null

async function createModels() {
  const { FilesetResolver, HandLandmarker, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks(WASM)
  const make = async (delegate) => Promise.all([
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    }),
  ])
  let hand, pose
  try {
    ;[hand, pose] = await make('GPU')
  } catch {
    ;[hand, pose] = await make('CPU')   // older phones without WebGL2
  }
  return { hand, pose }
}

export function loadModels() {
  if (!modelsPromise) {
    modelsPromise = createModels().catch((e) => {
      modelsPromise = null
      throw e
    })
  }
  return modelsPromise
}

export const HAND_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]

export class SignTracker {
  constructor(video, { onFrame, fps = 20 } = {}) {
    this.video = video
    this.onFrame = onFrame
    this.interval = 1000 / fps
    this.running = false
    this.lastTime = -1
    this.lastRun = 0
  }

  async start() {
    this.models = await loadModels()
    this.running = true
    const loop = () => {
      if (!this.running) return
      this.raf = requestAnimationFrame(loop)
      const now = performance.now()
      const v = this.video
      if (!v || v.readyState < 2 || v.currentTime === this.lastTime || now - this.lastRun < this.interval) return
      this.lastTime = v.currentTime
      this.lastRun = now
      this.process(now)
    }
    loop()
  }

  process(ts) {
    const v = this.video
    const handRes = this.models.hand.detectForVideo(v, ts)
    const poseRes = this.models.pose.detectForVideo(v, ts)
    const hands = (handRes.landmarks || []).map((l) => l.map((p) => [p.x, p.y, p.z]))
    const poseLm = poseRes.landmarks?.[0]
    if (!poseLm) {
      this.onFrame?.({ frame: null, raw: { hands, pose: null } })
      return
    }
    const pose = poseLm.map((p) => [p.x, p.y, p.z])
    const [left, right] = assignHands(pose, hands)
    const frame = normalizeRaw(pose, left, right, v.videoWidth, v.videoHeight)
    this.onFrame?.({ frame, raw: { hands, pose } })
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }
}
