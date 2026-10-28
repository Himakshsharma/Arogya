// Built-in ISL signs (simplified) as keyframes of two hand poses.
// A recording from /teach takes priority over these.
import { add, norm, scale, sub } from './vec.js'
import { worldHand } from './handModel.js'

// Directions in body space
export const U = [0, 1, 0]
export const D = [0, -1, 0]
export const F = [0, 0, 1]   // toward the viewer
export const B = [0, 0, -1]  // toward the signer
export const XP = [1, 0, 0]  // toward the signer's left (viewer's right)
export const XN = [-1, 0, 0] // toward the signer's right
const dir = (...v) => norm(v)

// Places on the body (surface points)
export const PLACE = {
  forehead: [0, 0.86, 0.27],
  temple: [-0.24, 0.76, 0.17],
  eye: [-0.1, 0.69, 0.28],
  nose: [0, 0.6, 0.32],
  mouth: [0, 0.5, 0.3],
  chin: [0, 0.4, 0.27],
  cheek: [-0.2, 0.56, 0.23],
  ear: [-0.29, 0.64, 0.03],
  throat: [0, 0.24, 0.15],
  chest: [0, -0.25, 0.26],
  stomach: [0, -0.85, 0.32],
  thigh: [-0.36, -1.5, 0.34],
  front: [0, -0.35, 0.6],
}

export const REST = {
  r: { at: [-0.64, -1.32, 0.22], up: dir(0, -1, 0.2), face: XP, shape: 'flat' },
  l: { at: [0.64, -1.32, 0.22], up: dir(0, -1, 0.2), face: XN, shape: 'flat' },
}

const TIP = 0.43   // wrist to fingertip of a straight hand
const PALM = 0.14  // wrist to palm centre

const h = (at, up, face, shape = 'flat') => ({ at, up: norm(up), face: norm(face), shape })
// Put the fingertips (or palm) of a hand on a target point
const tipAt = (target, up, face, shape = 'point', reachLen = TIP) => h(sub(target, scale(norm(up), reachLen)), up, face, shape)
const palmAt = (target, up, face, shape = 'flat') => h(sub(target, scale(norm(up), PALM)), up, face, shape)
const move = (pose, delta) => ({ ...pose, at: add(pose.at, delta) })
const turn = (pose, up, face) => ({ ...pose, up: norm(up || pose.up), face: norm(face || pose.face) })
const withShape = (pose, shape) => ({ ...pose, shape })

// A base hand used by many two-handed signs: left palm up in front of the body
const L_PALM_UP = h([0.22, -0.55, 0.42], dir(-1, 0, 0.35), U, 'flat')
const L_FOREARM = h([0.25, -0.5, 0.4], dir(-1, 0.1, 0.2), U, 'flat')       // left arm across, palm up
const L_BACK = h([0.22, -0.5, 0.42], dir(-1, 0.05, 0.3), D, 'flat')       // left hand palm down

/** keyframes: [{ t, r, l }] - missing hands keep their previous pose */
const SIGNS = {}
function def(name, keys, opts = {}) {
  SIGNS[name] = { keys, ...opts }
}

// Alternate between two poses n times: tapping, shaking, nodding
function rep(t0, period, a, b, n, hand = 'r', other = {}) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push({ t: t0 + i * period, [hand]: a, ...other })
    out.push({ t: t0 + i * period + period / 2, [hand]: b, ...other })
  }
  out.push({ t: t0 + n * period, [hand]: a, ...other })
  return out
}

// ---------- Greetings & conversation ----------

const namR = h([-0.04, -0.36, 0.42], U, XP, 'flat')
const namL = h([0.04, -0.36, 0.42], U, XN, 'flat')
def('HELLO', [
  { t: 0, r: namR, l: namL },
  { t: 0.5, r: namR, l: namL },
  { t: 0.8, r: move(namR, [0, -0.05, 0.03]), l: move(namL, [0, -0.05, 0.03]) },
  { t: 1.1, r: namR, l: namL },
], { nod: true })

const thankStart = tipAt(PLACE.chin, U, B, 'flat')
def('THANK-YOU', [
  { t: 0, r: thankStart },
  { t: 0.3, r: thankStart },
  { t: 0.8, r: h([-0.12, -0.3, 0.72], dir(0, 0.5, 1), dir(0, 1, -0.4), 'flat') },
])

const yesA = h([-0.32, -0.2, 0.45], dir(0, 0.3, 1), XP, 'fist')
def('YES', rep(0, 0.34, yesA, turn(move(yesA, [0, -0.08, 0]), dir(0, -0.4, 1)), 2), { nod: true })

const noA = h([-0.34, -0.1, 0.45], U, F, 'point')
def('NO', rep(0, 0.3, move(noA, [0.09, 0, 0]), move(noA, [-0.09, 0, 0]), 2), { shake: true })

const pleaseA = palmAt(PLACE.chest, dir(0.4, 1, 0), B, 'flat')
def('PLEASE', [
  { t: 0, r: pleaseA },
  { t: 0.3, r: move(pleaseA, [0.08, 0.06, 0]) },
  { t: 0.6, r: move(pleaseA, [0, 0.12, 0]) },
  { t: 0.9, r: move(pleaseA, [-0.08, 0.06, 0]) },
  { t: 1.2, r: pleaseA },
])

const sorryA = h([-0.06, -0.38, 0.32], dir(0.2, 1, 0.3), B, 'A')
def('SORRY', [
  { t: 0, r: sorryA },
  { t: 0.3, r: move(sorryA, [0.08, 0.05, 0]) },
  { t: 0.6, r: move(sorryA, [0, 0.1, 0]) },
  { t: 0.9, r: move(sorryA, [-0.08, 0.05, 0]) },
  { t: 1.2, r: sorryA },
])

const helpR = h([0.1, -0.42, 0.45], F, XP, 'thumb')
def('HELP', [
  { t: 0, r: helpR, l: L_PALM_UP },
  { t: 0.6, r: move(helpR, [0, 0.25, 0]), l: move(L_PALM_UP, [0, 0.25, 0]) },
])

const okA = h([-0.36, 0.05, 0.45], U, F, 'pinch')
def('OK', [{ t: 0, r: okA }, { t: 0.4, r: move(okA, [0, 0, 0.12]) }, { t: 0.7, r: move(okA, [0, 0, 0.12]) }])

// ---------- People & places ----------

const pulse = h([-0.02, -0.38, 0.5], dir(1, -0.1, 0), D, 'U')
def('DOCTOR', [{ t: 0, l: L_FOREARM }, ...rep(0, 0.32, pulse, move(pulse, [0, 0.07, 0]), 2, 'r', { l: L_FOREARM })])

const capR = tipAt([-0.12, 1.0, 0.18], dir(0.3, 0.2, 1), D, 'U', 0.3)
def('NURSE', [
  { t: 0, r: capR },
  { t: 0.35, r: move(capR, [0.16, 0, 0]) },
  { t: 0.55, r: pulse, l: L_FOREARM },
  { t: 0.75, r: move(pulse, [0, 0.07, 0]), l: L_FOREARM },
  { t: 0.95, r: pulse, l: L_FOREARM },
])

const crossA = h([0.38, 0.05, 0.2], dir(0.3, -1, 0), XP, 'U')
def('HOSPITAL', [
  { t: 0, r: crossA },
  { t: 0.35, r: move(crossA, [0, -0.22, 0]) },
  { t: 0.5, r: move(crossA, [-0.1, -0.1, 0.02]) },
  { t: 0.85, r: move(crossA, [0.12, -0.1, 0.02]) },
])

// ---------- Medicine ----------

const inPalm = h([0.08, -0.4, 0.5], dir(0.3, -1, 0), D, 'point')
def('MEDICINE', [
  { t: 0, r: inPalm, l: L_PALM_UP },
  { t: 0.25, r: move(inPalm, [0.05, 0, 0.04]), l: L_PALM_UP },
  { t: 0.5, r: move(inPalm, [0, 0, 0.08]), l: L_PALM_UP },
  { t: 0.75, r: move(inPalm, [-0.05, 0, 0.04]), l: L_PALM_UP },
  { t: 1.0, r: inPalm, l: L_PALM_UP },
])

const pinchPalm = h([0.06, -0.38, 0.5], dir(0.4, -1, 0.2), D, 'O')
def('TABLET', [
  { t: 0, r: pinchPalm, l: L_PALM_UP },
  { t: 0.3, r: pinchPalm, l: L_PALM_UP },
  { t: 0.8, r: tipAt(PLACE.mouth, dir(0.2, 0.6, -1), XP, 'O', 0.32), l: L_PALM_UP },
])

const syringe = h([0.25, 0.0, 0.4], dir(1, -0.3, -0.6), D, 'three')
def('INJECTION', [
  { t: 0, r: move(syringe, [-0.15, 0, 0.15]) },
  { t: 0.4, r: syringe },
  { t: 0.8, r: { ...syringe, shape: 'V' } },
])

const testR = h([-0.25, -0.05, 0.45], U, F, 'hook')
const testL = h([0.25, -0.05, 0.45], U, F, 'hook')
def('TEST', [
  { t: 0, r: testR, l: testL },
  { t: 0.3, r: move(testR, [0, -0.15, 0]), l: move(testL, [0, -0.15, 0]) },
  { t: 0.6, r: move(testR, [0, -0.3, 0]), l: move(testL, [0, -0.3, 0]) },
])

const bloodA = tipAt(PLACE.chin, dir(0.2, -1, 0.3), B, 'five', 0.2)
def('BLOOD', [
  { t: 0, r: bloodA },
  { t: 0.3, r: { ...move(bloodA, [0, -0.15, 0]), shape: 'claw' } },
  { t: 0.6, r: { ...move(bloodA, [0, -0.3, 0]), shape: 'five' } },
  { t: 0.9, r: { ...move(bloodA, [0, -0.45, 0]), shape: 'claw' } },
])

const noseTip = tipAt(PLACE.nose, dir(0.2, 0.5, -1), D, 'point', 0.42)
def('ALLERGY', [{ t: 0, r: noseTip }, { t: 0.3, r: noseTip }, { t: 0.8, r: move(noseTip, [-0.15, -0.2, 0.3]) }])

// ---------- Body & symptoms ----------

const painR = h([-0.42, -0.35, 0.48], XP, D, 'point')
const painL = h([0.42, -0.35, 0.48], XN, D, 'point')
def('PAIN', [
  { t: 0, r: painR, l: painL },
  { t: 0.3, r: turn(painR, null, F), l: turn(painL, null, B) },
  { t: 0.6, r: painR, l: painL },
  { t: 0.9, r: turn(painR, null, F), l: turn(painL, null, B) },
  { t: 1.1, r: painR, l: painL },
], { face: 'pain' })

const pointAt = (target, from = dir(0.35, 0.3, -1)) => tipAt(target, from, D, 'point', 0.44)
const tapAt = (name, target, from) => {
  const a = pointAt(target, from)
  const b = move(a, scale(norm(from || dir(0.35, 0.3, -1)), -0.07))
  def(name, rep(0, 0.32, a, b, 2))
}
tapAt('HEAD', [-0.2, 0.85, 0.2], dir(0.4, 0.2, -1))
tapAt('EYE', [-0.1, 0.62, 0.3], dir(0.3, 0.4, -1))
tapAt('EAR', PLACE.ear, dir(0.7, 0.35, -0.5))
tapAt('THROAT', PLACE.throat, dir(0.2, 0.2, -1))

const stomachA = palmAt(PLACE.stomach, dir(0.6, 1, 0), B)
def('STOMACH', [
  { t: 0, r: stomachA },
  { t: 0.3, r: move(stomachA, [0.08, 0.06, 0]) },
  { t: 0.6, r: move(stomachA, [0, 0.12, 0]) },
  { t: 0.9, r: move(stomachA, [-0.08, 0.06, 0]) },
  { t: 1.1, r: stomachA },
])

const chestA = palmAt([-0.05, -0.2, 0.27], dir(0.5, 1, 0), B)
def('CHEST', rep(0, 0.3, chestA, move(chestA, [0, 0, 0.08]), 2))

const backA = h([-0.35, 0.05, 0.3], dir(0.2, 0.4, -1), XP, 'point')
def('BACK', [{ t: 0, r: move(backA, [0, -0.15, 0.2]) }, { t: 0.5, r: backA }, { t: 0.8, r: move(backA, [0, 0.02, -0.04]) }])

const mouthA = pointAt([-0.08, 0.5, 0.3], dir(0.2, 0.3, -1))
def('MOUTH', [
  { t: 0, r: mouthA },
  { t: 0.25, r: move(mouthA, [0.08, 0.04, 0]) },
  { t: 0.5, r: move(mouthA, [0.16, 0, 0]) },
  { t: 0.75, r: move(mouthA, [0.08, -0.04, 0]) },
  { t: 1.0, r: mouthA },
])

const legA = palmAt(PLACE.thigh, dir(0.3, -0.4, 1), D)
def('LEG', rep(0, 0.3, legA, move(legA, [0, 0.07, 0]), 2))

const handR = h([0.02, -0.4, 0.55], dir(1, 0.1, 0), D, 'flat')
def('HAND', [{ t: 0, r: handR, l: L_BACK }, { t: 0.4, r: move(handR, [0.12, 0, 0]), l: L_BACK }, { t: 0.7, r: handR, l: L_BACK }])

const feverA = palmAt(PLACE.forehead, dir(0.8, 0.3, 0), B)
def('FEVER', [
  { t: 0, r: feverA },
  { t: 0.5, r: feverA },
  { t: 0.7, r: move(feverA, [0, 0, 0.05]) },
  { t: 0.9, r: feverA },
], { face: 'pain' })

const coughA = h([-0.06, 0.35, 0.5], U, XP, 'fist')
def('COUGH', rep(0, 0.28, coughA, move(coughA, [0, 0, -0.08]), 2, 'r'), { face: 'pain' })

const coldR = h([-0.22, -0.35, 0.42], U, XP, 'fist')
const coldL = h([0.22, -0.35, 0.42], U, XN, 'fist')
def('COLD', rep(0, 0.16, { ...coldR }, move(coldR, [-0.04, 0, 0]), 4, 'r', { l: coldL }), { face: 'pain' })

const vomitA = tipAt(PLACE.mouth, dir(0, 0.2, -1), D, 'five', 0.35)
def('VOMIT', [{ t: 0, r: vomitA }, { t: 0.6, r: h([-0.15, -0.45, 0.8], dir(0, -0.8, 1), D, 'five') }], { face: 'pain' })

const dizzyA = h([-0.2, 0.75, 0.55], dir(0.2, 0.2, -1), B, 'claw')
def('DIZZY', [
  { t: 0, r: dizzyA },
  { t: 0.3, r: move(dizzyA, [0.12, 0.06, 0]) },
  { t: 0.6, r: move(dizzyA, [0.24, 0, 0]) },
  { t: 0.9, r: move(dizzyA, [0.12, -0.06, 0]) },
  { t: 1.2, r: dizzyA },
], { face: 'pain' })

const brR = palmAt([-0.18, -0.25, 0.27], dir(0.3, 1, 0), B, 'five')
const brL = palmAt([0.18, -0.25, 0.27], dir(-0.3, 1, 0), B, 'five')
def('BREATHE', rep(0, 0.6, { ...brR }, move(brR, [0, 0, 0.15]), 2, 'r', { l: brL }))

// ---------- Food & daily life ----------

const waterA = tipAt(PLACE.chin, dir(0.1, 1, -0.2), XP, 'W', 0.4)
def('WATER', rep(0, 0.3, waterA, move(waterA, [0, -0.06, 0.04]), 2))

const eatA = tipAt(PLACE.mouth, dir(0.2, 0.5, -1), XP, 'O', 0.3)
def('EAT', rep(0, 0.3, eatA, move(eatA, [0, -0.04, 0.1]), 2))
def('FOOD', [{ t: 0, r: move(eatA, [0, -0.04, 0.1]) }, { t: 0.35, r: eatA }, { t: 0.7, r: move(eatA, [0, -0.04, 0.1]) }])

const drinkA = h([-0.06, 0.22, 0.48], U, XP, 'C')
def('DRINK', [{ t: 0, r: drinkA }, { t: 0.5, r: turn(move(drinkA, [0, 0.05, -0.05]), dir(-0.6, 0.6, -0.3), XP) }])

const sleepA = palmAt([-0.27, 0.55, 0.14], dir(0.15, 1, 0.1), XP, 'flat')
def('SLEEP', [{ t: 0, r: move(sleepA, [-0.1, -0.1, 0.1]) }, { t: 0.5, r: sleepA }, { t: 1.0, r: sleepA }], { face: 'sleep' })

// ---------- Time ----------

const horizon = h([0.32, -0.45, 0.45], dir(-1, 0.05, 0.2), D, 'flat')
def('MORNING', [
  { t: 0, l: horizon, r: h([-0.05, -0.85, 0.42], dir(0.3, 1, 0.1), F, 'flat') },
  { t: 0.8, l: horizon, r: h([-0.05, -0.25, 0.42], dir(0.3, 1, 0.1), F, 'flat') },
])
def('AFTERNOON', [
  { t: 0, l: horizon, r: h([-0.05, -0.3, 0.42], U, F, 'flat') },
  { t: 0.8, l: horizon, r: h([-0.2, -0.32, 0.42], dir(-0.6, 1, 0), F, 'flat') },
])
def('NIGHT', [
  { t: 0, l: horizon, r: h([-0.15, -0.2, 0.45], dir(1, 0.2, 0.2), D, 'bent') },
  { t: 0.8, l: horizon, r: h([0.15, -0.5, 0.45], dir(1, -0.6, 0.2), D, 'bent') },
])
const dayA = h([-0.4, 0.45, 0.4], U, F, 'point')
def('DAY', [{ t: 0, r: dayA }, { t: 0.8, r: h([0.3, 0.45, 0.4], dir(1, 0.6, 0), F, 'point') }])

const nowR = h([-0.3, -0.35, 0.5], dir(0, 0.2, 1), U, 'bent')
const nowL = h([0.3, -0.35, 0.5], dir(0, 0.2, 1), U, 'bent')
def('NOW', [{ t: 0, r: nowR, l: nowL }, { t: 0.4, r: move(nowR, [0, -0.15, 0]), l: move(nowL, [0, -0.15, 0]) }])
def('TODAY', [
  { t: 0, r: nowR, l: nowL },
  { t: 0.35, r: move(nowR, [0, -0.12, 0]), l: move(nowL, [0, -0.12, 0]) },
  { t: 0.6, r: nowR, l: nowL },
  { t: 0.95, r: move(nowR, [0, -0.12, 0]), l: move(nowL, [0, -0.12, 0]) },
])
const cheekThumb = tipAt(PLACE.cheek, dir(0.4, 0.6, -0.4), B, 'A', 0.28)
def('TOMORROW', [{ t: 0, r: cheekThumb }, { t: 0.7, r: move(turn(cheekThumb, dir(0, 0.6, 1)), [-0.05, -0.05, 0.3]) }])
def('YESTERDAY', [{ t: 0, r: cheekThumb }, { t: 0.7, r: move(turn(cheekThumb, dir(-0.4, 0.4, -1)), [-0.1, 0.05, -0.15]) }])
const watch = h([0.08, -0.4, 0.52], dir(0.5, -1, -0.2), D, 'point')
def('TIME', [{ t: 0, l: L_BACK }, ...rep(0, 0.3, watch, move(watch, [0, 0.06, 0]), 2, 'r', { l: L_BACK })])

// ---------- Questions (eyebrows raised by the renderer) ----------

const qR = h([-0.32, -0.4, 0.5], dir(0.2, 0.3, 1), U, 'five')
const qL = h([0.32, -0.4, 0.5], dir(-0.2, 0.3, 1), U, 'five')
def('WHAT', [
  ...rep(0, 0.25, qR, move(qR, [-0.05, 0, 0]), 3, 'r', { l: qL }),
], { face: 'question' })
def('HOW', [
  { t: 0, r: h([-0.06, -0.35, 0.48], dir(0.5, 0.2, 1), D, 'bent'), l: h([0.06, -0.35, 0.48], dir(-0.5, 0.2, 1), D, 'bent') },
  { t: 0.7, r: qR, l: qL },
], { face: 'question' })
const whereA = h([-0.3, -0.35, 0.55], dir(0, 0.2, 1), U, 'five')
def('WHERE', [
  { t: 0, r: whereA },
  { t: 0.3, r: move(whereA, [-0.12, 0, 0.06]) },
  { t: 0.6, r: move(whereA, [-0.2, 0, -0.04]) },
  { t: 0.9, r: move(whereA, [-0.1, 0, -0.08]) },
  { t: 1.1, r: whereA },
], { face: 'question' })
const whenL = h([0.2, -0.3, 0.45], U, B, 'point')
def('WHEN', [
  { t: 0, l: whenL, r: h([-0.15, -0.05, 0.5], dir(0.6, 1, 0.2), F, 'point') },
  { t: 0.4, l: whenL, r: h([-0.05, 0.05, 0.55], dir(0.6, 1, 0.2), F, 'point') },
  { t: 0.8, l: whenL, r: h([0.02, -0.36, 0.48], dir(1, 0.4, 0), D, 'point') },
], { face: 'question' })
const whyA = tipAt(PLACE.forehead, dir(0.4, 0.4, -1), D, 'flat', 0.4)
def('WHY', [{ t: 0, r: whyA }, { t: 0.3, r: whyA }, { t: 0.8, r: h([-0.35, 0.2, 0.55], U, F, 'Y') }], { face: 'question' })

// ---------- People ----------

def('ME', [{ t: 0, r: tipAt([-0.02, -0.2, 0.3], dir(0.2, 0.3, -1), D, 'point', 0.44) }, { t: 0.5, r: tipAt([-0.02, -0.2, 0.3], dir(0.2, 0.3, -1), D, 'point', 0.47) }])
const youA = h([-0.25, -0.25, 0.5], dir(0, 0.1, 1), D, 'point')
def('YOU', [{ t: 0, r: youA }, { t: 0.45, r: move(youA, [0, 0, 0.12]) }])
const famR = h([-0.08, -0.25, 0.5], U, F, 'C')
const famL = h([0.08, -0.25, 0.5], U, F, 'C')
def('FAMILY', [
  { t: 0, r: famR, l: famL },
  { t: 0.4, r: move(famR, [-0.18, 0, 0.12]), l: move(famL, [0.18, 0, 0.12]) },
  { t: 0.8, r: move(famR, [-0.08, 0, 0.28]), l: move(famL, [0.08, 0, 0.28]) },
])
const nameR = h([-0.05, -0.18, 0.5], dir(1, 0.3, 0), B, 'U')
const nameL = h([0.18, -0.3, 0.48], dir(-1, 0.3, 0), B, 'U')
def('NAME', rep(0, 0.3, nameR, move(nameR, [0, 0.06, 0]), 2, 'r', { l: nameL }))
const ageA = tipAt(PLACE.chin, dir(0, 1, 0.2), XP, 'fist', 0.15)
def('AGE', [{ t: 0, r: ageA }, { t: 0.7, r: move(ageA, [0, -0.25, 0]) }])

// ---------- Describing ----------

const goodA = h([-0.25, -0.25, 0.48], F, XP, 'thumb')
def('GOOD', [{ t: 0, r: goodA }, { t: 0.45, r: move(goodA, [0, 0.04, 0.1]) }, { t: 0.8, r: move(goodA, [0, 0.04, 0.1]) }])
const badA = h([-0.25, -0.25, 0.48], F, XN, 'thumb')
def('BAD', [{ t: 0, r: badA }, { t: 0.45, r: move(badA, [0, -0.08, 0.06]) }], { face: 'pain' })
def('BETTER', [{ t: 0, r: goodA }, { t: 0.7, r: move(goodA, [0, 0.3, 0.05]) }])
const moreR = h([-0.08, -0.3, 0.5], dir(0.6, 0.6, 0.4), XP, 'O')
const moreL = h([0.08, -0.3, 0.5], dir(-0.6, 0.6, 0.4), XN, 'O')
def('MORE', rep(0, 0.32, move(moreR, [-0.08, 0, 0]), moreR, 2, 'r', { l: moreL }))
const littleA = h([-0.3, -0.15, 0.48], U, XP, 'pinch')
def('LITTLE', rep(0, 0.25, littleA, move(littleA, [0.03, 0, 0]), 2))

// ---------- Actions ----------

def('WAIT', rep(0, 0.3, qR, { ...qR, shape: 'bent' }, 3, 'r', { l: qL }))
const chopR = h([0.05, -0.2, 0.45], dir(1, 0.3, 0.3), XP, 'flat')
def('STOP', [{ t: 0, r: chopR, l: L_PALM_UP }, { t: 0.4, r: move(chopR, [0, -0.28, 0]), l: L_PALM_UP }, { t: 0.7, r: move(chopR, [0, -0.28, 0]), l: L_PALM_UP }])
const frontL = h([0.15, -0.35, 0.55], U, B, 'flat')
def('BEFORE', [{ t: 0, l: frontL, r: h([0.02, -0.38, 0.62], U, F, 'flat') }, { t: 0.7, l: frontL, r: h([-0.05, -0.38, 0.35], U, F, 'flat') }])
def('AFTER', [{ t: 0, l: frontL, r: h([0.0, -0.38, 0.5], U, B, 'flat') }, { t: 0.7, l: frontL, r: h([-0.05, -0.38, 0.85], U, B, 'flat') }])
const takeA = h([-0.25, -0.25, 0.75], dir(0, 0.3, 1), D, 'five')
def('TAKE', [{ t: 0, r: takeA }, { t: 0.35, r: { ...takeA, shape: 'fist' } }, { t: 0.8, r: { ...move(takeA, [0.05, 0, -0.3]), shape: 'fist' } }])
const notA = h([-0.1, -0.3, 0.5], dir(1, 0.2, 0.3), D, 'flat')
def('NOT', [{ t: 0, r: notA }, { t: 0.6, r: move(notA, [-0.4, -0.05, 0.05]) }], { shake: true })
const haveR = palmAt([-0.1, -0.25, 0.28], dir(0.6, 0.8, 0), B, 'bent')
const haveL = palmAt([0.1, -0.25, 0.28], dir(-0.6, 0.8, 0), B, 'bent')
def('HAVE', [{ t: 0, r: move(haveR, [0, 0, 0.15]), l: move(haveL, [0, 0, 0.15]) }, { t: 0.5, r: haveR, l: haveL }])
const feelA = tipAt([-0.04, -0.4, 0.28], dir(0.3, 0.6, -1), D, 'point', 0.42)
def('FEEL', [{ t: 0, r: feelA }, { t: 0.6, r: move(feelA, [0, 0.22, 0]) }])
const showL = h([0.12, -0.3, 0.5], U, B, 'flat')
const showR = h([-0.05, -0.3, 0.48], dir(1, 0.2, 0), D, 'point')
def('SHOW', [{ t: 0, l: showL, r: showR }, { t: 0.6, l: move(showL, [0, 0, 0.2]), r: move(showR, [0, 0, 0.2]) }])
const openR = h([-0.04, -0.3, 0.5], U, F, 'flat')
const openL = h([0.04, -0.3, 0.5], U, F, 'flat')
def('OPEN', [{ t: 0, r: openR, l: openL }, { t: 0.6, r: turn(move(openR, [-0.22, 0, -0.05]), null, XP), l: turn(move(openL, [0.22, 0, -0.05]), null, XN) }])
const sitL = h([0.2, -0.5, 0.45], dir(-1, 0, 0.2), D, 'U')
const sitR = h([0.0, -0.3, 0.48], dir(1, -0.2, 0.2), D, 'U')
def('SIT', [{ t: 0, l: sitL, r: sitR }, { t: 0.5, l: sitL, r: { ...move(sitR, [0, -0.14, 0]), shape: 'hook' } }])
const lieR = h([-0.05, -0.38, 0.5], dir(1, 0, 0.3), U, 'V')
def('LIE-DOWN', [{ t: 0, l: L_PALM_UP, r: move(lieR, [0, 0.15, 0]) }, { t: 0.6, l: L_PALM_UP, r: lieR }])
const comeA = h([-0.2, -0.25, 0.75], dir(0, 0.6, 1), U, 'point')
def('COME', [{ t: 0, r: comeA }, { t: 0.4, r: { ...move(comeA, [0, 0, -0.12]), shape: 'hook' } }, { t: 0.8, r: { ...move(comeA, [0, 0, -0.25]), shape: 'hook' } }])
const goA = h([-0.2, -0.25, 0.45], dir(0, 0.4, 1), D, 'point')
def('GO', [{ t: 0, r: goA }, { t: 0.6, r: move(goA, [-0.1, 0.05, 0.4]) }])
const understandA = h([-0.22, 0.62, 0.32], U, B, 'fist')
def('UNDERSTAND', [{ t: 0, r: understandA }, { t: 0.3, r: understandA }, { t: 0.6, r: withShape(understandA, 'point') }])
const againR = h([-0.05, -0.15, 0.5], dir(0.6, 0.6, 0.2), U, 'bent')
def('AGAIN', [{ t: 0, r: againR, l: L_PALM_UP }, { t: 0.5, r: h([0.12, -0.42, 0.48], dir(0.6, -0.3, 0.2), D, 'bent'), l: L_PALM_UP }])
const slowR = h([0.0, -0.42, 0.5], dir(1, 0.1, 0), D, 'flat')
def('SLOW', [{ t: 0, r: slowR, l: L_BACK }, { t: 1.0, r: move(slowR, [0.08, 0.15, -0.02]), l: L_BACK }])

// ---------- Numbers ----------

const numA = (shape) => h([-0.38, 0.05, 0.42], U, F, shape)
def('ONE', [{ t: 0, r: numA('point') }, { t: 0.6, r: numA('point') }])
def('TWO', [{ t: 0, r: numA('V') }, { t: 0.6, r: numA('V') }])
def('THREE', [{ t: 0, r: numA('three') }, { t: 0.6, r: numA('three') }])
def('FOUR', [{ t: 0, r: numA('four') }, { t: 0.6, r: numA('four') }])
def('FIVE', [{ t: 0, r: numA('five') }, { t: 0.6, r: numA('five') }])

// ---------- Fingerspelling ----------
// Vowels: right index on a left fingertip (A thumb ... U pinky).

const SPELL_L = h([0.22, -0.32, 0.45], dir(-0.2, 1, 0), B, 'five')
const VOWEL_TIP = { A: 4, E: 8, I: 12, O: 16, U: 20 }

function vowelPose(letter) {
  const tip = worldHand({ ...SPELL_L, curl: [0, 0, 0, 0, 0], spread: 1 }, 'l')[VOWEL_TIP[letter]]
  const up = dir(1, 0.25, 0.1)
  return { r: tipAt(add(tip, [0, 0, 0.03]), up, D, 'point', 0.44), l: SPELL_L }
}

const SPELL_SPOT = [-0.3, -0.05, 0.5]
const CONSONANT = {
  B: ['four', U, F], C: ['C', U, XP], D: ['L', U, F], F: ['pinch', U, F], G: ['point', XP, B],
  H: ['U', XP, B], J: ['I', U, F], K: ['three', U, F], L: ['L', U, F], M: ['W', D, B],
  N: ['U', D, B], P: ['V', D, B], Q: ['hook', D, B], R: ['U', U, F], S: ['fist', U, F],
  T: ['A', U, XP], V: ['V', U, F], W: ['W', U, F], X: ['hook', U, F], Y: ['Y', U, F], Z: ['point', U, F],
}
const DIGIT = { 0: 'O', 1: 'point', 2: 'V', 3: 'three', 4: 'four', 5: 'five', 6: 'Y', 7: 'L', 8: 'W', 9: 'hook' }

export function letterPose(ch) {
  const c = ch.toUpperCase()
  if (VOWEL_TIP[c] !== undefined) return vowelPose(c)
  if (CONSONANT[c]) {
    const [shape, up, face] = CONSONANT[c]
    return { r: h(SPELL_SPOT, up, face, shape), l: REST.l }
  }
  if (DIGIT[c] !== undefined) return { r: h(SPELL_SPOT, U, F, DIGIT[c]), l: REST.l }
  return { r: h(SPELL_SPOT, U, F, 'five'), l: REST.l }
}

export function hasSign(gloss) {
  return Object.prototype.hasOwnProperty.call(SIGNS, gloss)
}

export function getSign(gloss) {
  return SIGNS[gloss] || null
}

export const SIGN_NAMES = Object.keys(SIGNS)
