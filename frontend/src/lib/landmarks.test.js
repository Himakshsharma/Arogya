import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assignHands, handsRaised, mirrorFrame, normalizeRaw } from './landmarks.js'
import { SignSegmenter } from './segmenter.js'

const fixture = JSON.parse(readFileSync(new URL('../../../backend/tests/fixtures/normalize_case.json', import.meta.url)))

describe('landmark normalization', () => {
  it('matches the Python implementation exactly', () => {
    const [left, right] = assignHands(fixture.pose, fixture.hands)
    const out = normalizeRaw(fixture.pose, left, right, fixture.width, fixture.height)
    for (const key of ['p', 'l', 'r']) {
      out[key].forEach((pt, i) => pt.forEach((v, j) => expect(v).toBeCloseTo(fixture.expected[key][i][j], 3)))
    }
  })

  it('mirroring twice gives the original frame', () => {
    const f = fixture.expected
    expect(mirrorFrame(mirrorFrame(f))).toEqual(f)
  })
})

describe('sign segmenter', () => {
  const down = { p: [], l: null, r: [[-0.6, -1.4, 0]] }
  const up = { p: [], l: null, r: [[-0.3, -0.2, 0.4]] }

  it('treats a wrist above the waist as signing', () => {
    expect(handsRaised(up)).toBe(true)
    expect(handsRaised(down)).toBe(false)
  })

  it('emits one segment per raise-and-lower', () => {
    const seg = new SignSegmenter({ minFrames: 5, restFrames: 3 })
    const segments = []
    const stream = [...Array(4).fill(down), ...Array(12).fill(up), ...Array(5).fill(down), ...Array(10).fill(up), ...Array(5).fill(down)]
    for (const f of stream) {
      const out = seg.push(f)
      if (out.segment) segments.push(out.segment)
    }
    expect(segments.length).toBe(2)
    expect(segments[0].length).toBe(12)
  })

  it('ignores very short movements', () => {
    const seg = new SignSegmenter({ minFrames: 8, restFrames: 3 })
    const outs = [...Array(3).fill(up), ...Array(4).fill(down)].map((f) => seg.push(f))
    expect(outs.some((o) => o.segment)).toBe(false)
  })
})
