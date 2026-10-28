import { handsRaised } from './landmarks.js'

/**
 * Splits a continuous stream of frames into individual signs.
 *
 * A sign starts when a hand is raised above the waist and ends when the
 * hands drop (or disappear) for a short pause. A natural rhythm for a
 * signer: sign, lower hands briefly, sign the next word.
 */
export class SignSegmenter {
  constructor({ minFrames = 8, maxFrames = 75, restFrames = 7 } = {}) {
    this.minFrames = minFrames
    this.maxFrames = maxFrames
    this.restFrames = restFrames
    this.reset()
  }

  reset() {
    this.buffer = []
    this.rest = 0
    this.active = false
  }

  /** Returns { state, segment? } where state is idle | signing. */
  push(frame) {
    const raised = handsRaised(frame)
    if (!this.active) {
      if (raised) {
        this.active = true
        this.buffer = [frame]
        this.rest = 0
      }
      return { state: this.active ? 'signing' : 'idle' }
    }

    this.buffer.push(frame)
    this.rest = raised ? 0 : this.rest + 1

    const tooLong = this.buffer.length >= this.maxFrames
    if (this.rest >= this.restFrames || tooLong) {
      const segment = this.buffer.slice(0, this.buffer.length - this.rest)
      this.reset()
      if (segment.length >= this.minFrames) return { state: 'idle', segment }
      return { state: 'idle' }
    }
    return { state: 'signing', progress: this.buffer.length / this.maxFrames }
  }
}
