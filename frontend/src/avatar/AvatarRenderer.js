// Three.js avatar built from primitives and posed from landmark frames.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { evaluate, restFrame } from './sequencer.js'

const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16], [17, 18], [18, 19], [19, 20], [0, 5], [0, 17], [5, 9], [9, 13], [13, 17],
]
const JOINT_R = (i) => (i === 0 ? 0.042 : [4, 8, 12, 16, 20].includes(i) ? 0.019 : [1, 5, 9, 13, 17].includes(i) ? 0.027 : 0.022)

const COLORS = {
  skin: 0xa86b45,
  skinDark: 0x8c5536,
  kurta: 0xf2b035,
  trim: 0x1c2470,
  hair: 0x1b1a22,
  eye: 0x1b1a22,
  mouth: 0x5a2a22,
}

const UP = new THREE.Vector3(0, 1, 0)
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _d = new THREE.Vector3()

function placeLimb(mesh, a, b) {
  _a.set(a[0], a[1], a[2])
  _b.set(b[0], b[1], b[2])
  _d.subVectors(_b, _a)
  const length = _d.length() || 1e-4
  mesh.position.copy(_a).addScaledVector(_d, 0.5)
  mesh.scale.set(1, length, 1)
  mesh.quaternion.setFromUnitVectors(UP, _d.normalize())
}

export class AvatarRenderer {
  constructor(container, { interactive = true, reduceMotion = false } = {}) {
    this.container = container
    this.reduceMotion = reduceMotion
    this.timeline = null
    this.playStart = 0
    this.paused = false
    this.mirror = false
    this.liveFrame = null
    this.onUpdate = null
    this.lastInfoKey = ''

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    container.appendChild(renderer.domElement)
    renderer.domElement.setAttribute('aria-hidden', 'true')
    this.renderer = renderer

    const scene = new THREE.Scene()
    this.scene = scene
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50)
    camera.position.set(0, -0.25, 5.6)
    this.camera = camera

    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1c2470, 1.25))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(1.8, 2.5, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x9fb2ff, 1.1)
    rim.position.set(-2.5, 1.5, -3)
    scene.add(rim)

    this.mat = {
      skin: new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.62, metalness: 0 }),
      kurta: new THREE.MeshStandardMaterial({ color: COLORS.kurta, roughness: 0.85 }),
      trim: new THREE.MeshStandardMaterial({ color: COLORS.trim, roughness: 0.7 }),
      hair: new THREE.MeshStandardMaterial({ color: COLORS.hair, roughness: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: COLORS.eye, roughness: 0.4 }),
      mouth: new THREE.MeshStandardMaterial({ color: COLORS.mouth, roughness: 0.6 }),
    }

    this.root = new THREE.Group()
    this.root.position.y = 0.05
    scene.add(this.root)
    this.buildBody()
    this.arms = { l: this.buildArm(), r: this.buildArm() }
    this.hands = { l: this.buildHand(), r: this.buildHand() }

    if (interactive) {
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, -0.25, 0)
      controls.enableZoom = false
      controls.enablePan = false
      controls.enableDamping = !reduceMotion
      controls.minAzimuthAngle = -0.9
      controls.maxAzimuthAngle = 0.9
      controls.minPolarAngle = 1.25
      controls.maxPolarAngle = 1.85
      this.controls = controls
    } else {
      camera.lookAt(0, -0.25, 0)
    }

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.clock = new THREE.Clock()
    this.nextBlink = 2
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  buildBody() {
    const { mat, root } = this
    // Kurta: a lathe flattened front-to-back
    const profile = [
      [0.0, 0.17], [0.16, 0.17], [0.34, 0.1], [0.44, -0.04], [0.44, -0.4],
      [0.39, -0.9], [0.41, -1.3], [0.46, -1.75], [0.0, -1.75],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), mat.kurta)
    torso.scale.set(1, 1, 0.58)
    this.torso = torso
    root.add(torso)

    // Placket and collar in indigo
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.02), mat.trim)
    placket.position.set(0, -0.12, 0.25)
    root.add(placket)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 10, 32), mat.trim)
    collar.rotation.x = Math.PI / 2
    collar.scale.set(1, 0.7, 1)
    collar.position.set(0, 0.16, 0.0)
    root.add(collar)

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.34, 20), mat.skin)
    neck.position.set(0, 0.3, 0)
    root.add(neck)

    // Head group so it can nod, shake and tilt
    const head = new THREE.Group()
    head.position.set(0, 0.66, 0.02)
    this.head = head
    root.add(head)

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 40, 32), mat.skin)
    skull.scale.set(0.9, 1.06, 0.95)
    head.add(skull)
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.285, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.52), mat.hair)
    hair.scale.set(0.92, 1.05, 0.98)
    hair.position.set(0, 0.025, -0.02)
    hair.rotation.x = -0.32
    head.add(hair)
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), mat.skin)
      ear.scale.set(0.5, 1, 0.7)
      ear.position.set(0.245 * s, -0.01, 0)
      head.add(ear)
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), mat.skin)
    nose.scale.set(0.9, 1.2, 1)
    nose.position.set(0, -0.06, 0.26)
    head.add(nose)

    this.eyes = []
    this.brows = []
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), mat.dark)
      eye.scale.set(1, 1.25, 0.6)
      eye.position.set(0.09 * s, 0.03, 0.235)
      head.add(eye)
      this.eyes.push(eye)
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.07, 4, 8), mat.hair)
      brow.rotation.z = Math.PI / 2
      brow.position.set(0.09 * s, 0.1, 0.235)
      brow.userData.side = s
      head.add(brow)
      this.brows.push(brow)
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 24, Math.PI), mat.mouth)
    mouth.rotation.z = Math.PI
    mouth.position.set(0, -0.135, 0.225)
    this.mouth = mouth
    head.add(mouth)
  }

  buildArm() {
    const { mat, root } = this
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 1, 20), mat.kurta)
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.06, 1, 18), mat.skin)
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), mat.kurta)
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 14), mat.kurta)
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 8, 20), mat.trim)
    for (const m of [upper, fore, shoulder, elbow, cuff]) root.add(m)
    return { upper, fore, shoulder, elbow, cuff }
  }

  buildHand() {
    const { mat, root } = this
    const group = new THREE.Group()
    root.add(group)
    const joints = Array.from({ length: 21 }, (_, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(JOINT_R(i), 14, 10), mat.skin)
      group.add(m)
      return m
    })
    const bones = HAND_BONES.map(([a, b]) => {
      const r = Math.min(JOINT_R(a), JOINT_R(b)) * 0.95
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), mat.skin)
      group.add(m)
      return { m, a, b }
    })
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), mat.skin)
    group.add(palm)
    return { group, joints, bones, palm }
  }

  // ---------- Posing ----------

  applyFrame(frame) {
    const [ls, rs, le, re, lw, rw] = frame.p
    this.poseArm(this.arms.l, ls, le, lw)
    this.poseArm(this.arms.r, rs, re, rw)
    this.poseHand(this.hands.l, frame.l)
    this.poseHand(this.hands.r, frame.r)
  }

  poseArm(arm, s, e, w) {
    placeLimb(arm.upper, s, e)
    placeLimb(arm.fore, e, w)
    arm.shoulder.position.set(s[0], s[1] - 0.02, s[2])
    arm.elbow.position.set(e[0], e[1], e[2])
    // Cuff ring sits just below the elbow, facing along the forearm
    _a.set(e[0], e[1], e[2])
    _b.set(w[0], w[1], w[2])
    _d.subVectors(_b, _a).normalize()
    arm.cuff.position.copy(_a).addScaledVector(_d, 0.06)
    arm.cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _d)
  }

  poseHand(hand, pts) {
    hand.group.visible = Boolean(pts)
    if (!pts) return
    pts.forEach((p, i) => hand.joints[i].position.set(p[0], p[1], p[2]))
    for (const { m, a, b } of hand.bones) placeLimb(m, pts[a], pts[b])

    // Palm: an ellipsoid spanning wrist, index MCP and pinky MCP
    const w = new THREE.Vector3(...pts[0])
    const i5 = new THREE.Vector3(...pts[5])
    const p17 = new THREE.Vector3(...pts[17])
    const m9 = new THREE.Vector3(...pts[9])
    const yAxis = m9.clone().sub(w)
    const length = yAxis.length()
    yAxis.normalize()
    const xAxis = i5.clone().sub(p17)
    const width = xAxis.length()
    xAxis.addScaledVector(yAxis, -xAxis.dot(yAxis)).normalize()
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize()
    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)
    hand.palm.quaternion.setFromRotationMatrix(basis)
    hand.palm.position.copy(w).add(m9).multiplyScalar(0.5).lerp(i5.clone().add(p17).multiplyScalar(0.5), 0.3)
    hand.palm.scale.set(width + 0.05, length + 0.04, 0.075)
  }

  applyFace(info, t) {
    const question = info.face === 'question' || this.question
    const pain = info.face === 'pain'
    const sleep = info.face === 'sleep'
    for (const b of this.brows) {
      const targetY = question ? 0.135 : pain ? 0.09 : 0.1
      b.position.y += (targetY - b.position.y) * 0.2
      const tilt = pain ? -0.25 * b.userData.side : question ? 0.08 * b.userData.side : 0
      b.rotation.x = 0
      b.rotation.z = Math.PI / 2 + tilt
    }
    // Blink, or eyes closed for SLEEP
    let eyeScale = 1.25
    if (sleep) eyeScale = 0.12
    else if (t > this.nextBlink) {
      eyeScale = 0.12
      if (t > this.nextBlink + 0.12) this.nextBlink = t + 2.5 + Math.random() * 3
    }
    for (const e of this.eyes) e.scale.y = eyeScale
    this.mouth.rotation.z = pain ? 0 : Math.PI
    this.mouth.position.y = pain ? -0.165 : -0.135

    // Head: nod for YES/HELLO, shake for NO/NOT, tilt for SLEEP and questions
    const head = this.head
    const nod = info.nod ? Math.sin(t * 9) * 0.12 : 0
    const shake = info.shake ? Math.sin(t * 10) * 0.18 : 0
    const tilt = sleep ? 0.3 : question ? -0.06 : 0
    head.rotation.x += ((question ? -0.08 : 0) + nod - head.rotation.x) * 0.25
    head.rotation.y += (shake - head.rotation.y) * 0.25
    head.rotation.z += (tilt - head.rotation.z) * 0.15
  }

  // ---------- Playback ----------

  play(timeline, { question = false } = {}) {
    this.timeline = timeline
    this.question = question
    this.playStart = performance.now() / 1000
    this.paused = false
    this.liveFrame = null
  }

  stop() {
    this.timeline = null
    this.question = false
  }

  showLive(frame) {
    this.liveFrame = frame
    this.timeline = null
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop)
    const t = this.clock.getElapsedTime()
    let info = { frame: restFrame(), label: '', letter: '', index: -1, face: '', done: true }

    if (this.liveFrame) {
      info = { ...info, frame: this.liveFrame }
    } else if (this.timeline) {
      const elapsed = performance.now() / 1000 - this.playStart
      info = evaluate(this.timeline, elapsed, { mirror: this.mirror })
      if (info.done) {
        this.timeline = null
        this.question = false
        this.lastInfoKey = 'done'
        this.onUpdate?.({ ...info, label: '', letter: '', index: -1, done: true })
      }
    }

    // idle breathing
    if (!this.reduceMotion) {
      const breath = Math.sin(t * 1.6) * 0.008
      this.torso.scale.y = 1 + breath
      this.root.position.y = 0.05 + breath * 0.5
    }

    this.applyFrame(info.frame)
    this.applyFace(info, t)

    if (!info.done) {
      const key = `${info.index}|${info.label}|${info.letter}`
      if (key !== this.lastInfoKey) {
        this.lastInfoKey = key
        this.onUpdate?.(info)
      }
    }

    this.controls?.update()
    this.renderer.render(this.scene, this.camera)
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // pull back on portrait screens
    this.camera.position.z = w / h < 0.8 ? 6.6 : 5.6
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.controls?.dispose()
    this.scene.traverse((o) => {
      o.geometry?.dispose()
    })
    Object.values(this.mat).forEach((m) => m.dispose())
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch {
    return false
  }
}
