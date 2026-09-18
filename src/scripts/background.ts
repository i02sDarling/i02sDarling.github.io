import { createNoise3D } from 'simplex-noise'

/**
 * 背景装饰层：动画点阵 + 树枝分叉
 * 参考 antfu.me 的 ArtDots / ArtPlum，改为 Canvas 2D + simplex-noise 实现。
 * 规范见 docs/design-system.md 第七节。
 */

type Step = () => void

interface Layer {
  canvas: HTMLCanvasElement
  destroy: () => void
}

const MAX_DPR = 2

function createLayer(mask?: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '-1',
    pointerEvents: 'none',
    display: 'block',
    width: '100%',
    height: '100%',
  } satisfies Partial<CSSStyleDeclaration>)
  if (mask) {
    canvas.style.maskImage = mask
    canvas.style.setProperty('-webkit-mask-image', mask)
  }
  document.body.appendChild(canvas)
  return canvas
}

function readToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function readRgb(name: string, fallback: string): [number, number, number] {
  const raw = readToken(name, fallback).replace('#', '')
  const hex = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const value = Number.parseInt(hex, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function setupCanvas(canvas: HTMLCanvasElement): {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
} | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, width, height }
}

/* ── 动画点阵 ─────────────────────────────────────────────────── */

interface Dot {
  x: number
  y: number
  opacity: number
}

const BUCKETS = 8

interface DotsLayer extends Layer {
  refresh: () => void
}

function mountDots(): DotsLayer {
  const canvas = createLayer()
  let ctx: CanvasRenderingContext2D | null = null
  let width = 0
  let height = 0
  let dots: Dot[] = []
  let raf = 0
  let last = 0
  let styles: string[] = []

  const noise3d = createNoise3D()
  const SPACING = 15
  const SCALE = 200
  const LENGTH = 5
  const FPS = 30
  const MAX_POINTS = 6000

  function buildStyles() {
    const [r, g, b] = readRgb('--c-dot', '#d4d4d4')
    styles = Array.from({ length: BUCKETS }, (_, i) => {
      const alpha = ((i + 0.5) / BUCKETS).toFixed(3)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    })
  }

  function resize() {
    const ready = setupCanvas(canvas)
    if (!ready) return
    ctx = ready.ctx
    width = ready.width
    height = ready.height

    let spacing = SPACING
    while (((width / spacing) + 2) * ((height / spacing) + 2) > MAX_POINTS) {
      spacing += 2
    }

    dots = []
    for (let x = -spacing / 2; x < width + spacing; x += spacing) {
      for (let y = -spacing / 2; y < height + spacing; y += spacing) {
        dots.push({ x, y, opacity: Math.random() * 0.5 + 0.5 })
      }
    }
  }

  function frame(now: number) {
    raf = window.requestAnimationFrame(frame)
    if (!ctx || document.hidden) return
    if (now - last < 1000 / FPS) return
    last = now

    const t = now / 10000
    ctx.clearRect(0, 0, width, height)

    const buckets: { x: number; y: number }[][] = Array.from(
      { length: BUCKETS },
      () => [],
    )

    for (const dot of dots) {
      const force = (noise3d(dot.x / SCALE, dot.y / SCALE, t) + 1) / 2
      const rad = (force - 0.5) * 2 * Math.PI
      const drift = (noise3d(dot.x / SCALE, dot.y / SCALE, t * 2) + 1) / 2
      const len = (drift + 0.5) * LENGTH

      const nx = dot.x + Math.cos(rad) * len
      const ny = dot.y + Math.sin(rad) * len
      const alpha = (Math.abs(Math.cos(rad)) * 0.8 + 0.2) * dot.opacity

      const index = Math.min(BUCKETS - 1, Math.max(0, Math.floor(alpha * BUCKETS)))
      buckets[index].push({ x: nx, y: ny })
    }

    for (let i = 0; i < BUCKETS; i++) {
      const list = buckets[i]
      if (!list.length) continue
      ctx.fillStyle = styles[i]
      ctx.beginPath()
      for (const point of list) {
        ctx.rect(point.x - 1, point.y - 1, 2, 2)
      }
      ctx.fill()
    }
  }

  function start() {
    buildStyles()
    resize()
    raf = window.requestAnimationFrame(frame)
  }

  start()

  let resizeTimer = 0
  const onResize = () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(resize, 200)
  }
  window.addEventListener('resize', onResize)

  return {
    canvas,
    refresh: buildStyles,
    destroy() {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
    },
  }
}

/* ── 树枝分叉 ─────────────────────────────────────────────────── */

const R90 = Math.PI / 2
const R180 = Math.PI
const R15 = Math.PI / 12
const MIN_BRANCH = 30

interface PlumLayer extends Layer {
  restart: () => void
}

function mountPlum(): PlumLayer {
  const mask = 'radial-gradient(circle, transparent, black)'
  const canvas = createLayer(mask)

  // 固定为初始视口的像素尺寸并锚定左上角（对齐 antfu.me）：
  // 窗口拉大时右下露出空白，而不是拉伸画布导致树枝变形、位置偏移。
  canvas.style.inset = 'auto'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = `${window.innerWidth}px`
  canvas.style.height = `${window.innerHeight}px`

  let ctx: CanvasRenderingContext2D | null = null
  let width = 0
  let height = 0
  let steps: Step[] = []
  let raf = 0
  let last = 0
  let len = 6

  const FPS = 40

  function step(
    x: number,
    y: number,
    rad: number,
    counter: { value: number },
  ): void {
    if (!ctx) return

    const length = Math.random() * len
    counter.value += 1

    const nx = x + Math.cos(rad) * length
    const ny = y + Math.sin(rad) * length

    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(nx, ny)
    ctx.stroke()

    const rad1 = rad + Math.random() * R15
    const rad2 = rad - Math.random() * R15

    if (nx < -100 || nx > width + 100 || ny < -100 || ny > height + 100) return

    const rate = counter.value <= MIN_BRANCH ? 0.8 : 0.5
    if (Math.random() < rate) steps.push(() => step(nx, ny, rad1, counter))
    if (Math.random() < rate) steps.push(() => step(nx, ny, rad2, counter))
  }

  function frame(now: number) {
    raf = window.requestAnimationFrame(frame)
    if (!ctx || document.hidden) return
    if (now - last < 1000 / FPS) return
    last = now

    const previous = steps
    steps = []

    if (!previous.length) return

    for (const next of previous) {
      if (Math.random() < 0.5) steps.push(next)
      else next()
    }
  }

  function restart() {
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    ctx.lineWidth = 1
    ctx.lineCap = 'round'
    ctx.strokeStyle = readToken('--c-plum', 'rgba(136,136,136,0.16)')

    const middle = () => Math.random() * 0.6 + 0.2

    steps = [
      () => step(middle() * width, -5, R90, { value: 0 }),
      () => step(middle() * width, height + 5, -R90, { value: 0 }),
      () => step(-5, middle() * height, 0, { value: 0 }),
      () => step(width + 5, middle() * height, R180, { value: 0 }),
    ]
    if (width < 500) steps = steps.slice(0, 2)
  }

  const ready = setupCanvas(canvas)
  if (ready) {
    ctx = ready.ctx
    width = ready.width
    height = ready.height
    len = width < 640 ? 4.5 : 6
    restart()
    raf = window.requestAnimationFrame(frame)
  }

  return {
    canvas,
    restart,
    destroy() {
      window.cancelAnimationFrame(raf)
    },
  }
}

/* ── 挂载 ─────────────────────────────────────────────────────── */

export function mountBackground(): () => void {
  if (typeof window === 'undefined') return () => {}

  const dots = mountDots()
  const plum = mountPlum()
  document.documentElement.classList.add('has-canvas-bg')

  const observer = new MutationObserver(() => {
    // 主题切换后刷新颜色并重画树枝
    dots.refresh()
    plum.restart()
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })

  return () => {
    observer.disconnect()
    dots.destroy()
    plum.destroy()
    dots.canvas.remove()
    plum.canvas.remove()
    document.documentElement.classList.remove('has-canvas-bg')
  }
}
