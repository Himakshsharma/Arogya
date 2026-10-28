// gloss tokens -> timeline -> landmark frame at time t
import { blendShapes, poseToFrame, shapeOf } from './handModel.js'
import { getSign, letterPose, REST } from './signs.js'
import { lerp, norm, smooth } from './vec.js'
import { mirrorFrame } from '../lib/landmarks.js'

const TRANSITION = 0.3
const HOLD = 0.15
const LETTER = 0.42
const EDGE = 0.4

function resolvePose(p) {
  const s = shapeOf(p.shape)
  return { at: p.at, up: p.up, face: p.face, curl: s.curl, spread: s.spread }
}

const REST_POSE = { r: resolvePose(REST.r), l: resolvePose(REST.l) }

function blendPose(a, b, t) {
  return {
    at: lerp(a.at, b.at, t),
    up: norm(lerp(a.up, b.up, t)),
    face: norm(lerp(a.face, b.face, t)),
    ...blendShapes(a, b, t),
  }
}

function blendFrame(a, b, t) {
  const pts = (x, y) => (x && y ? x.map((p, i) => lerp(p, y[i], t)) : t < 0.5 ? x || y : y || x)
  return { p: pts(a.p, b.p), l: pts(a.l, b.l), r: pts(a.r, b.r) }
}

function keysFromSign(sign) {
  let r = REST.r
  let l = REST.l
  return sign.keys.map((k) => {
    if (k.r) r = k.r
    if (k.l) l = k.l
    return { t: k.t, r: resolvePose(r), l: resolvePose(l) }
  })
}

function poseItem(label, keys, extra = {}) {
  const dur = keys[keys.length - 1].t + HOLD
  return { type: 'pose', label, keys, dur, ...extra }
}

/** Build the list of items to perform. recorded: { LABEL: frames[] } */
export function buildItems(tokens, recorded = {}) {
  const items = []
  for (const tok of tokens) {
    const g = (tok.gloss || '').toUpperCase()
    if (tok.kind === 'sign' && recorded[g]?.length) {
      items.push({ type: 'frames', label: g, frames: recorded[g], dur: recorded[g].length / 20, source: 'recorded' })
      continue
    }
    const sign = tok.kind === 'sign' ? getSign(g) : null
    if (sign) {
      items.push(poseItem(g, keysFromSign(sign), { face: sign.face, nod: sign.nod, shake: sign.shake }))
      continue
    }
    // Fingerspell anything without a sign
    const letters = (tok.letters || g).replace(/[^A-Z0-9]/gi, '').toUpperCase()
    ;[...letters].forEach((ch, i) => {
      const lp = letterPose(ch)
      const key = { t: 0, r: resolvePose(lp.r), l: resolvePose(lp.l) }
      items.push(poseItem(g, [key, { ...key, t: LETTER - HOLD }], { letter: ch, word: g, letterIndex: i }))
    })
  }
  return items
}

/** Lay items out in time, with transitions from rest, between items and back to rest. */
export function buildTimeline(tokens, { speed = 1, recorded = {} } = {}) {
  const items = buildItems(tokens, recorded)
  const spans = []
  let t = 0
  let prev = null
  items.forEach((item, idx) => {
    const trans = prev ? (prev.letter && item.letter ? 0.12 : TRANSITION) : EDGE
    spans.push({ kind: 'transition', start: t, end: t + trans, from: prev, to: item })
    t += trans
    spans.push({ kind: 'item', start: t, end: t + item.dur, item, index: idx })
    t += item.dur
    prev = item
  })
  if (prev) {
    spans.push({ kind: 'transition', start: t, end: t + EDGE, from: prev, to: null })
    t += EDGE
  }
  return { items, spans, duration: t / speed, speed }
}

function poseAt(item, local) {
  const keys = item.keys
  if (local <= keys[0].t) return { r: keys[0].r, l: keys[0].l }
  for (let i = 1; i < keys.length; i++) {
    if (local <= keys[i].t) {
      const a = keys[i - 1]
      const b = keys[i]
      const u = smooth((local - a.t) / (b.t - a.t || 1))
      return { r: blendPose(a.r, b.r, u), l: blendPose(a.l, b.l, u) }
    }
  }
  const last = keys[keys.length - 1]
  return { r: last.r, l: last.l }
}

function framesAt(item, local) {
  const f = item.frames
  const x = Math.min(Math.max(local * 20, 0), f.length - 1)
  const i = Math.floor(x)
  const j = Math.min(i + 1, f.length - 1)
  return blendFrame(withRest(f[i]), withRest(f[j]), x - i)
}

const REST_FRAME = poseToFrame(REST_POSE.r, REST_POSE.l)
function withRest(frame) {
  return { p: frame.p, l: frame.l || REST_FRAME.l, r: frame.r || REST_FRAME.r }
}

function startState(item) {
  if (!item) return { pose: REST_POSE }
  return item.type === 'pose' ? { pose: { r: item.keys[0].r, l: item.keys[0].l } } : { frame: framesAt(item, 0) }
}

function endState(item) {
  if (!item) return { pose: REST_POSE }
  return item.type === 'pose'
    ? { pose: poseAt(item, item.dur) }
    : { frame: framesAt(item, item.dur) }
}

const toFrame = (s) => s.frame || poseToFrame(s.pose.r, s.pose.l)

/** Evaluate the timeline at time t (seconds of real time). */
export function evaluate(timeline, tReal, { mirror = false } = {}) {
  const t = tReal * timeline.speed
  let frame = REST_FRAME
  let current = null
  const span = timeline.spans.find((s) => t >= s.start && t < s.end)
  if (span) {
    const local = t - span.start
    if (span.kind === 'item') {
      current = span
      frame = span.item.type === 'pose'
        ? (() => { const p = poseAt(span.item, local); return poseToFrame(p.r, p.l) })()
        : framesAt(span.item, local)
    } else {
      const a = endState(span.from)
      const b = startState(span.to)
      const u = smooth(local / (span.end - span.start))
      frame = a.pose && b.pose
        ? (() => ({ r: blendPose(a.pose.r, b.pose.r, u), l: blendPose(a.pose.l, b.pose.l, u) }))()
        : null
      frame = frame ? poseToFrame(frame.r, frame.l) : blendFrame(toFrame(a), toFrame(b), u)
      current = span.to ? { item: span.to, upcoming: true } : null
    }
  }
  if (mirror) frame = mirrorFrame(frame)
  const item = current?.item
  return {
    frame,
    label: item?.letter ? item.word : item?.label || '',
    letter: item?.letter || '',
    index: current?.index ?? -1,
    face: item?.face || '',
    nod: Boolean(item?.nod && !current?.upcoming),
    shake: Boolean(item?.shake && !current?.upcoming),
    done: t >= (timeline.spans.at(-1)?.end ?? 0),
  }
}

export const restFrame = () => REST_FRAME

/** Sample a single sign at a fixed rate - used to create recognition templates. */
export function sampleSign(gloss, fps = 20) {
  const tl = buildTimeline([{ gloss, kind: 'sign' }])
  const item = tl.spans.find((s) => s.kind === 'item')
  if (!item) return []
  const frames = []
  for (let t = item.start; t <= item.end; t += 1 / fps) frames.push(evaluate(tl, t).frame)
  return frames
}
