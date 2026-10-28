// Writes backend/app/data/starter_templates.json from the avatar sign library.
// Usage: node scripts/export_starter_templates.mjs
import { writeFileSync } from 'node:fs'
import { sampleSign } from '../frontend/src/avatar/sequencer.js'
import { SIGN_NAMES } from '../frontend/src/avatar/signs.js'

const round = (frame) => ({
  p: frame.p.map((pt) => pt.map((v) => Math.round(v * 1000) / 1000)),
  l: frame.l ? frame.l.map((pt) => pt.map((v) => Math.round(v * 1000) / 1000)) : null,
  r: frame.r ? frame.r.map((pt) => pt.map((v) => Math.round(v * 1000) / 1000)) : null,
})

const out = {}
for (const name of SIGN_NAMES) {
  out[name] = [sampleSign(name, 20).map(round)]
}

const target = new URL('../backend/app/data/starter_templates.json', import.meta.url)
writeFileSync(target, JSON.stringify(out))
console.log(`Wrote ${SIGN_NAMES.length} starter signs to ${target.pathname}`)
