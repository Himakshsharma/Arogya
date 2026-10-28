// Port of backend/app/services/features.py; landmarks.test.js checks they match.

export const POSE_IDS = [11, 12, 13, 14, 15, 16]

const r4 = (v) => Math.round(v * 10000) / 10000

export function normalizeRaw(pose, left, right, width, height) {
  const px = (pt) => [pt[0] * width, pt[1] * height, pt[2] * width]
  const ls = px(pose[11])
  const rs = px(pose[12])
  const cx = (ls[0] + rs[0]) / 2
  const cy = (ls[1] + rs[1]) / 2
  const cz = (ls[2] + rs[2]) / 2
  const sw = Math.hypot(ls[0] - rs[0], ls[1] - rs[1]) || 1

  const n = (X, Y, Z) => [r4((X - cx) / sw), r4(-(Y - cy) / sw), r4(-(Z - cz) / sw)]
  const p = POSE_IDS.map((i) => n(...px(pose[i])))

  const hand = (points, wristIdx) => {
    if (!points) return null
    const wz = px(pose[wristIdx])[2]
    return points.map((pt) => n(pt[0] * width, pt[1] * height, wz + pt[2] * width))
  }
  return { p, l: hand(left, 15), r: hand(right, 16) }
}

export function assignHands(pose, hands) {
  const lw = pose[15]
  const rw = pose[16]
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
  const scored = hands.map((h) => ({ h, dl: d2(h[0], lw), dr: d2(h[0], rw) }))
  if (scored.length === 0) return [null, null]
  if (scored.length === 1) {
    const { h, dl, dr } = scored[0]
    return dl < dr ? [h, null] : [null, h]
  }
  const [a, b] = scored
  return a.dl + b.dr <= a.dr + b.dl ? [a.h, b.h] : [b.h, a.h]
}

export function mirrorFrame(frame) {
  const flip = (pts) => (pts ? pts.map(([x, y, z]) => [-x, y, z]) : null)
  const p = flip(frame.p)
  return { p: [p[1], p[0], p[3], p[2], p[5], p[4]], l: flip(frame.r), r: flip(frame.l) }
}

// Hands are "raised" (signing) when a wrist is above the waist line.
export function handsRaised(frame) {
  const up = (pts) => pts && pts[0][1] > -1.15
  return Boolean(up(frame.l) || up(frame.r))
}
