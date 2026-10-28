import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { localHand, poseToFrame, SHAPES } from './handModel.js'
import { buildTimeline, evaluate, sampleSign } from './sequencer.js'
import { SIGN_NAMES } from './signs.js'
import { len, sub } from './vec.js'

const lexicon = JSON.parse(readFileSync(new URL('../../../backend/app/data/isl_lexicon.json', import.meta.url)))

describe('sign library', () => {
  it('has an animation for every sign the backend can produce', () => {
    const missing = lexicon.signs.filter((s) => !SIGN_NAMES.includes(s))
    expect(missing).toEqual([])
  })

  it('every sign produces finite, reachable landmarks', () => {
    for (const name of SIGN_NAMES) {
      const frames = sampleSign(name)
      expect(frames.length, name).toBeGreaterThan(5)
      for (const f of frames) {
        for (const pt of [...f.p, ...f.l, ...f.r]) {
          pt.forEach((v) => expect(Number.isFinite(v), name).toBe(true))
        }
        // forearm length is preserved by the IK
        expect(len(sub(f.p[5], f.p[3]))).toBeCloseTo(0.72, 1)
      }
    }
  })
})

describe('hand model', () => {
  it('a straight finger is longer than a curled one', () => {
    const flat = localHand(SHAPES.five.curl, 1)
    const fist = localHand(SHAPES.fist.curl, 0)
    expect(len(flat[8])).toBeGreaterThan(len(fist[8]) + 0.1)
  })

  it('produces 21 points per hand', () => {
    const pose = { at: [0, 0, 0.4], up: [0, 1, 0], face: [0, 0, 1], ...SHAPES.flat }
    const f = poseToFrame(pose, { ...pose, at: [0.3, 0, 0.4] })
    expect(f.r).toHaveLength(21)
    expect(f.l).toHaveLength(21)
  })
})

describe('timeline', () => {
  it('fingerspells unknown words letter by letter', () => {
    const tl = buildTimeline([{ gloss: 'RAVI', kind: 'spell', letters: 'RAVI' }])
    const letters = tl.items.map((i) => i.letter)
    expect(letters).toEqual(['R', 'A', 'V', 'I'])
  })

  it('reports the current word while playing and finishes', () => {
    const tl = buildTimeline([{ gloss: 'PAIN', kind: 'sign' }, { gloss: 'WHERE', kind: 'sign' }])
    const span = tl.spans.find((s) => s.kind === 'item' && s.item.label === 'WHERE')
    expect(evaluate(tl, (span.start + span.end) / 2).label).toBe('WHERE')
    expect(evaluate(tl, tl.duration + 1).done).toBe(true)
  })

  it('uses a real recording when one exists', () => {
    const rec = sampleSign('HELLO')
    const tl = buildTimeline([{ gloss: 'WATER', kind: 'sign' }], { recorded: { WATER: rec } })
    expect(tl.items[0].type).toBe('frames')
  })
})
