// vec3 helpers on plain arrays (usable in Node, no three.js)
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len = (a) => Math.hypot(a[0], a[1], a[2])
export const norm = (a) => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const lerpN = (a, b, t) => a + (b - a) * t
export const smooth = (t) => t * t * (3 - 2 * t)
export const round3 = (a) => a.map((v) => Math.round(v * 1000) / 1000)
