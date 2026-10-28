// Procedural hand/arm model.
// pose = { at: wrist position, up: finger direction, face: palm normal, shape }
// -> 21 MediaPipe-style landmarks per hand, elbows via two-bone IK.
import { add, cross, dot, len, lerpN, norm, scale, sub } from './vec.js'

// Body space: +x viewer's right (signer's left), +y up, +z toward the viewer.
export const BODY = {
  shoulderL: [0.5, 0, 0],
  shoulderR: [-0.5, 0, 0],
  upperArm: 0.8,
  forearm: 0.72,
  head: [0, 0.66, 0.02],
  headRadius: 0.27,
}

// Curl per finger [thumb, index, middle, ring, pinky]: 0 straight, 1 fully bent.
// spread: 0 fingers together, 1 fingers apart.
export const SHAPES = {
  flat:  { curl: [0.35, 0, 0, 0, 0], spread: 0.1 },
  five:  { curl: [0, 0, 0, 0, 0], spread: 1 },
  fist:  { curl: [0.8, 1, 1, 1, 1], spread: 0 },
  A:     { curl: [0.1, 1, 1, 1, 1], spread: 0 },
  thumb: { curl: [0, 1, 1, 1, 1], spread: 0 },
  point: { curl: [0.85, 0, 1, 1, 1], spread: 0 },
  V:     { curl: [0.85, 0, 0, 1, 1], spread: 0.9 },
  U:     { curl: [0.85, 0, 0, 1, 1], spread: 0 },
  three: { curl: [0, 0, 0, 1, 1], spread: 0.7 },
  W:     { curl: [0.85, 0, 0, 0, 1], spread: 0.7 },
  four:  { curl: [0.9, 0, 0, 0, 0], spread: 0.7 },
  C:     { curl: [0.35, 0.45, 0.45, 0.45, 0.45], spread: 0.15 },
  O:     { curl: [0.6, 0.62, 0.68, 0.7, 0.72], spread: 0 },
  claw:  { curl: [0.3, 0.55, 0.55, 0.55, 0.55], spread: 0.9 },
  pinch: { curl: [0.55, 0.65, 0, 0, 0], spread: 0.6 },
  L:     { curl: [0, 0, 1, 1, 1], spread: 0.2 },
  Y:     { curl: [0, 1, 1, 1, 0], spread: 0.8 },
  I:     { curl: [0.85, 1, 1, 1, 0], spread: 0 },
  bent:  { curl: [0.35, 0.5, 0.5, 0.5, 0.5], spread: 0.05 },
  hook:  { curl: [0.85, 0.6, 1, 1, 1], spread: 0 },
}

// Finger geometry in hand-local space for a RIGHT hand:
// +y wrist -> fingers, +x toward the thumb, +z out of the palm.
const MCP = [
  null,
  [0.075, 0.25, 0],    // index
  [0.025, 0.262, 0],   // middle
  [-0.025, 0.248, 0],  // ring
  [-0.07, 0.222, 0],   // pinky
]
const SEGMENTS = [
  [0.1, 0.08, 0.065],   // thumb (CMC->MCP, MCP->IP, IP->TIP)
  [0.105, 0.065, 0.055],
  [0.115, 0.072, 0.058],
  [0.105, 0.068, 0.054],
  [0.082, 0.052, 0.048],
]
const SPREAD = [0, 0.16, 0, -0.12, -0.26]       // radians at spread = 1, + toward thumb
const JOINT_GAIN = [1.45, 1.75, 1.2]            // MCP, PIP, DIP flexion at curl = 1
const THUMB_CMC = [0.055, 0.055, 0.02]

function fingerChain(start, spreadAngle, curl, segLens) {
  const base = [-Math.sin(-spreadAngle), Math.cos(spreadAngle), 0]
  const pts = []
  let p = start
  let angle = 0
  for (let k = 0; k < 3; k++) {
    angle += curl * JOINT_GAIN[k]
    const d = add(scale(base, Math.cos(angle)), [0, 0, Math.sin(angle)])
    p = add(p, scale(d, segLens[k]))
    pts.push(p)
  }
  return pts
}

function thumbChain(curl, spread) {
  const base = norm([0.75 + spread * 0.2, 0.55, 0.3])
  const across = norm([-0.55, 0.35, 0.75])
  const perp = norm(sub(across, scale(base, dot(across, base))))
  const pts = [THUMB_CMC]
  let p = THUMB_CMC
  let angle = 0
  const gains = [0.55, 0.85, 0.7]
  for (let k = 0; k < 3; k++) {
    angle += curl * gains[k]
    const d = norm(add(scale(base, Math.cos(angle)), scale(perp, Math.sin(angle))))
    p = add(p, scale(d, SEGMENTS[0][k]))
    pts.push(p)
  }
  return pts // CMC, MCP, IP, TIP
}

/** Hand-local 21 landmarks for curls/spread (right hand). */
export function localHand(curl, spread) {
  const out = new Array(21)
  out[0] = [0, 0, 0]
  const thumb = thumbChain(curl[0], spread)
  for (let i = 0; i < 4; i++) out[1 + i] = thumb[i]
  for (let f = 1; f <= 4; f++) {
    const base = 1 + f * 4
    out[base] = MCP[f]
    const chain = fingerChain(MCP[f], SPREAD[f] * spread, curl[f], SEGMENTS[f])
    for (let k = 0; k < 3; k++) out[base + 1 + k] = chain[k]
  }
  return out
}

/** Orthonormal palm frame from finger direction and palm-facing direction. */
export function palmFrame(up, face) {
  const Y = norm(up)
  let X = cross(Y, face)
  if (len(X) < 1e-4) X = cross(Y, [0, 0, 1])
  X = norm(X)
  const Z = cross(X, Y)
  return { X, Y, Z }
}

/** World-space 21 landmarks for a hand pose. side: 'r' | 'l'. */
export function worldHand(pose, side) {
  const { X, Y, Z } = palmFrame(pose.up, pose.face)
  const local = localHand(pose.curl, pose.spread)
  const mirror = side === 'l' ? -1 : 1
  return local.map(([x, y, z]) =>
    add(pose.at, add(add(scale(X, x * mirror), scale(Y, y)), scale(Z, z))),
  )
}

/** Two-bone IK: elbow position for a shoulder and wrist target. */
export function solveElbow(shoulder, wrist, side) {
  const L1 = BODY.upperArm
  const L2 = BODY.forearm
  const toW = sub(wrist, shoulder)
  const d = Math.min(Math.max(len(toW), 0.05), L1 + L2 - 1e-3)
  const dir = norm(toW)
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(L1 * L1 - a * a, 0))
  // pole vector: elbow swings forward as the hand rises
  const outward = side === 'l' ? 1 : -1
  const lift = Math.min(Math.max((wrist[1] + 0.8) / 1.4, 0), 1)
  const pole = norm([0.45 * outward * (1 - 0.4 * lift), -1, -0.25 + 0.95 * lift])
  const poleperp = norm(sub(pole, scale(dir, dot(pole, dir))))
  return add(add(shoulder, scale(dir, a)), scale(poleperp, h))
}

/** Clamp a wrist target to what the arm can reach. */
export function reach(shoulder, wrist) {
  const v = sub(wrist, shoulder)
  const max = BODY.upperArm + BODY.forearm - 0.02
  const l = len(v)
  return l > max ? add(shoulder, scale(v, max / l)) : wrist
}

/** Full landmark frame { p, l, r } from two hand poses. */
export function poseToFrame(R, L) {
  const wr = reach(BODY.shoulderR, R.at)
  const wl = reach(BODY.shoulderL, L.at)
  const r = worldHand({ ...R, at: wr }, 'r')
  const l = worldHand({ ...L, at: wl }, 'l')
  const p = [
    BODY.shoulderL, BODY.shoulderR,
    solveElbow(BODY.shoulderL, wl, 'l'), solveElbow(BODY.shoulderR, wr, 'r'),
    wl, wr,
  ]
  return { p, l, r }
}

export function shapeOf(name) {
  return SHAPES[name] || SHAPES.flat
}

export function blendShapes(a, b, t) {
  return {
    curl: a.curl.map((c, i) => lerpN(c, b.curl[i], t)),
    spread: lerpN(a.spread, b.spread, t),
  }
}
