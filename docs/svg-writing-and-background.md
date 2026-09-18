# SVG 手写动画 & 背景特效（点阵 / 树枝生长）实现指南

> 面向对象：拿到一个 SVG 文件后，需要把它做成「书写动画」，或在页面里加「动态点阵 + 树枝生长」背景的其他 agent。
> 本文所有代码都是本项目（`i02sDarling.github.io`）实际跑通并验证过的实现，可直接复制。

---

## 0. 先判断输入 SVG 属于哪种形态

这一步决定后面用什么方案，**先分类再动手**：

| 形态 | 特征 | 能否用 `stroke-dashoffset` 书写 | 方案 |
|---|---|---|---|
| A. 真·中心线 | `<path fill="none" d="M…L…">`，笔画本身就是一条线 | ✅ 可以 | 直接用（§1.4） |
| B. 细线闭环 (retrace loop) | `<path d="M x,y … ">` 且**起点 == 终点**；看起来是一条线，其实是沿一侧去、另一侧回 | ⚠️ 会「描两遍」 | 先还原中心线（§1.2）再用 §1.4 |
| C. 填充轮廓 (filled outline) | `style="fill:#000000"`，来自矢量化（vectorizer.ai / potrace / svglo） | ❌ 只能描轮廓边 | 用「遮罩显影」（§1.6） |

### 快速判别脚本（Node）

```js
import { readFileSync } from 'node:fs'

const raw = readFileSync(process.argv[2], 'utf8')
const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1]
const paths = [...raw.matchAll(/<path([^>]*)>/g)].map((m) => m[1])

console.log('viewBox:', viewBox, 'paths:', paths.length)
for (const [i, p] of paths.entries()) {
  const d = p.match(/d="([^"]+)"/)?.[1] ?? ''
  const filled = /style="[^"]*fill:\s*#/.test(p)
  const n = (d.match(/-?\d+\.?\d*/g) || []).map(Number)
  const closed = Math.abs(n[0] - n[n.length - 2]) < 1 && Math.abs(n[1] - n[n.length - 1]) < 1
  const hasZ = /[zZ]/.test(d)
  console.log(`  path[${i}] 填充=${filled} 起点==终点=${closed} 有z=${hasZ}`)
}
```

- 全部 `起点==终点` → 形态 B（本项目 `darling (1..5).svg` 全是这种）。
- 有 `fill:#000` 且大量 `C` → 形态 C（本项目 `svglo-*.svg` 是这种）。
- 都没有 → 形态 A。

---

## 1. 把 SVG 做成「书写动画」

### 1.1 处理旋转（可选）

有的导出文件内容是**转了 90° 的**（`viewBox` 是竖的，例如 `0 0 573 1155`）。
在包一层 `<g>` 里转正即可，不必改路径数据：

```html
<!-- 原 viewBox 0 0 573 1155，转成横版 1155x573 -->
<svg viewBox="0 0 1155 573">
  <g transform="translate(0,573) rotate(-90)">…原始内容…</g>
</svg>
```

### 1.2 闭环 (retrace loop) → 中心线

**原理**：细线闭环 = 沿笔画一侧去、另一侧回。按**弧长对称**取两点平均即可还原中心线：

```
c[k] = ( q[k] + q[M-k] ) / 2        // q 是按弧长等距采样的点，M 为偶数
```

**实现**（必须让 path 在 DOM 里被渲染，`getTotalLength()` 才有效；用 1×1 的 offscreen svg）：

```js
function rdp(pts, eps) {                     // Douglas–Peucker 简化
  if (pts.length < 3) return pts
  const a = pts[0], b = pts[pts.length - 1]
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1e-9
  let idx = -1, dmax = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / len
    if (d > dmax) { dmax = d; idx = i }
  }
  if (dmax > eps) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps))
  return [a, b]
}

const NS = 'http://www.w3.org/2000/svg'
const holder = document.createElementNS(NS, 'svg')
holder.setAttribute('width', '1'); holder.setAttribute('height', '1')
holder.style.cssText = 'position:absolute;left:-9999px;top:0'  // 必须在文档里、且不能 display:none
document.body.appendChild(holder)

function loopToCenterline(d) {
  const el = document.createElementNS(NS, 'path')
  el.setAttribute('d', d); holder.appendChild(el)
  const L = el.getTotalLength()
  const M = 2 * Math.max(16, Math.round(L / 2))         // 偶数
  const q = []
  for (let k = 0; k <= M; k++) { const p = el.getPointAtLength(L * k / M); q.push([p.x, p.y]) }
  const c = []
  for (let k = 0; k <= M / 2; k++) c.push([(q[k][0] + q[M - k][0]) / 2, (q[k][1] + q[M - k][1]) / 2])
  const s = rdp(c, 0.4)
  return 'M' + s.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L')
}
```

> 也可以在 Node 里用 CDP 跑这段代码：起一个无头 Chrome，`Page.navigate` 到这个页面，
> `Runtime.evaluate('window.__out')` 取回结果（本项目就是这么做的）。

### 1.3 确定书写顺序

- 直接用**文件里的 path 顺序**通常就是作者的落笔顺序（本项目 5 个签名全部如此）。
- 校验：把每条 path 的起点 x 打印出来，若单调递增，顺序就是对的：

```js
console.log(paths.map((d) => d.match(/^M\s*(-?\d+\.?\d*)/)[1]))
```

- 若顺序错乱，需要人工重排（例如 `i` 的点应在 `i` 竖笔之后）。

### 1.4 动画（单次播放）

**CSS 部分**（`pathLength="1"` 让每条 path 的 dash 归一化，不同长度用同一套 CSS）：

```html
<svg viewBox="…">
  <path pathLength="1" d="…" style="--d:0.15s;--t:0s" />
  <path pathLength="1" d="…" style="--d:0.32s;--t:0.15s" />
  …
</svg>

<style>
  .dl-sign path {
    fill: none;                 /* ★ 关键：中心线路径若带 fill:black 会渲染成实心块 */
    stroke: currentColor;
    stroke-width: 8;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;        /* 配合 pathLength=1：1 == 整条长度 */
    stroke-dashoffset: 1;       /* 1 = 完全隐藏 */
    animation: dl-draw var(--d, 0.4s) cubic-bezier(0.33, 0.05, 0.55, 1) var(--t, 0s) both;
  }
  @keyframes dl-draw {
    from { stroke-dashoffset: 1; opacity: 0; }   /* ★ from 置 opacity:0 防止等待中的笔画冒圆点 */
    1%   { opacity: 1; }
    to   { stroke-dashoffset: 0; opacity: 1; }
  }
</style>
```

**时长分配**：按 path 的**长度**比例分配（用 `getTotalLength()` 或折线长度），
`delay` = 前面所有段时长之和（即错峰依次书写）。

> **★ 为什么要 `from{opacity:0}`**：`stroke-linecap: round` + 长度为 0 的 dash
> 会在路径起点渲染一个**实心圆点**。等待书写的 path（`dashoffset:1`）就会在各自起点
> 冒出一排小圆点。用 `animation-fill-mode: both` + `from{opacity:0}`，等待期间直接不可见。

### 1.5 循环版：写完 → 按住 → **原路擦回** → 循环（ping-pong）

这是本项目最终采用的「好看的动态效果」。关键点：**整条时间线正放一遍、再倒放一遍**，
所以倒放阶段是**按相反顺序**、且每段从**尾部沿原路退回**（`dashoffset 0 → 1`）。

因为每段有自己的起止时间，CSS 需要**每段一条独立 `@keyframes`**。生成逻辑：

```js
const T_WRITE = 1.9   // 写完总时长
const HOLD    = 0.7   // 写完后停顿
const HOLD2   = 0.45  // 擦完后停顿
const CYCLE   = T_WRITE + HOLD + T_WRITE + HOLD2
const EASE    = 'cubic-bezier(0.33, 0.05, 0.55, 1)'
const EPS     = 0.002 // opacity 瞬间过渡（秒）

// 1) 按长度分配每段时长；2) 累加得到 a(开始)/b(结束)
const raw = lens.map((L) => Math.max(0.1, L / total))
const k = T_WRITE / raw.reduce((x, y) => x + y, 0)
let acc = 0
const strokes = raw.map((r, i) => {
  const dur = r * k
  const s = { d: paths[i], a: acc, b: acc + dur }
  acc += dur
  return s
})
const TW = acc  // 实际写完时长（含最短 0.1s 的影响）

// 3) 每段生成关键帧：正放画出 → 停 → 倒放按原路擦回 → 停
const p = (t) => (Math.min(Math.max(t / CYCLE, 0), 1) * 100).toFixed(3)
const kf = strokes.map((s, i) => {
  const eraseStart = TW + HOLD + (TW - s.b)   // ★ 倒放：越晚写的越早擦
  const eraseEnd   = TW + HOLD + (TW - s.a)
  return `@keyframes dl-k${i} {
  0% { stroke-dashoffset: 1; opacity: 0; }
  ${p(s.a)}% { stroke-dashoffset: 1; opacity: 0; }
  ${p(s.a + EPS)}% { stroke-dashoffset: 1; opacity: 1; animation-timing-function: ${EASE}; }
  ${p(s.b)}% { stroke-dashoffset: 0; opacity: 1; }
  ${p(TW + HOLD)}% { stroke-dashoffset: 0; opacity: 1; }
  ${p(eraseStart + EPS)}% { stroke-dashoffset: 0; opacity: 1; animation-timing-function: ${EASE}; }
  ${p(eraseEnd)}% { stroke-dashoffset: 1; opacity: 1; }
  ${p(eraseEnd + EPS)}% { stroke-dashoffset: 1; opacity: 0; }
  100% { stroke-dashoffset: 1; opacity: 0; }
}`
}).join('\n')
```

配套 CSS（**用长属性**，这样每条 path 只需内联 `animation-name`）：

```css
.dl-sign path {
  fill: none; stroke: currentColor; stroke-width: 8;
  stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 1; stroke-dashoffset: 1;
  animation-duration: 4.95s;        /* = CYCLE */
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-fill-mode: both;
}
```

```html
<path pathLength="1" d="…" style="animation-name: dl-k0" />
<path pathLength="1" d="…" style="animation-name: dl-k1" />
```

React/TS 组件版本见 `D:\DownloadEdge\darling-export\Darling.tsx`（含 `width / color / duration / replayKey` 等 props）。

### 1.6 形态 C（填充轮廓）的替代方案：遮罩显影

填充轮廓无法用 `stroke-dashoffset`。要做「像在写」的效果，用**遮罩按轨迹显影**：

1. 沿书写轨迹撒一串「落笔点」，每个点的半径 = **该处墨迹的局部宽度**（用距离变换 `distance transform` 求）。
2. 把这些点做成 SVG `<mask>` 里的白色圆，按时间依次 `opacity 0→1`。
3. 真实墨迹放在 `<g mask="url(#m)">` 里 → 被逐个「刷」出来。

> 教训：**不要用一条固定粗细的 mask 笔画**去扫。太粗会「整块冒出」，太细会漏。
> 半径必须自适应局部墨迹宽度。本项目 `compute-dabs.html` 是这段算法的实现。

---

## 2. 背景特效：动态点阵 + 树枝生长

实现文件：`src/scripts/background.ts`（Canvas 2D + `simplex-noise`，零 WebGL / 非 pixi）。

### 2.1 动态点阵（dots）

- 一个 `position:fixed; inset:0; z-index:-1; pointer-events:none` 的 canvas，追加到 `body`。
- 按视口铺点（`SPACING=15`，上限 `MAX_POINTS=6000`，超了就加大间距）。
- 每帧用 `noise3d(x/SCALE, y/SCALE, t)` 决定每个点的**位移方向与长度**，并据此计算透明度；
  按透明度分 8 个桶（`BUCKETS`），每桶一次 `fill()`，减少绘制调用。
- 限帧 `FPS=30`，`document.hidden` 时跳过；`resize` 防抖 200ms 后按新视口**重铺点并同步位图尺寸**。

### 2.2 树枝生长（plum）

- 同样一个 fixed canvas，但额外加 `mask-image: radial-gradient(circle, transparent, black)`。
- **算法**（`step` 递归 + 每帧队列）：
  - 从四条边随机取点作为种子，方向朝内（上边 → 向下等）。
  - 每次前进 `Math.random()*len`，左右各偏 `±(Math.random()*R15)`。
  - 画线；越界（±100 缓冲）就 return。
  - 前 `MIN_BRANCH=30` 次分支概率 `0.8`，之后 `0.5`（让主干先长出来）。
  - 每帧只执行队列里约一半的 step（`Math.random() < 0.5` 保留），制造有机生长感；队列空则停帧。
- 颜色取 CSS 变量 `--c-plum`；`lineWidth=1`。

### 2.3 ★ 窗口 resize 的正确姿势（容易做错）

- **点阵**：跟随窗口重铺（可拉伸/重建），没问题。
- **树枝**：必须**固定为初始视口的像素尺寸，并锚定左上角**，不要用 `width:100%;height:100%`：

```js
canvas.style.inset = 'auto'
canvas.style.top = '0'
canvas.style.left = '0'
canvas.style.width = `${window.innerWidth}px`
canvas.style.height = `${window.innerHeight}px`
```

这样窗口变大时**右下露出空白**（对齐 antfu.me 的手感），而不是把旧位图拉伸导致**树枝变形/位置漂移**。

### 2.4 挂载与降级

- `mountBackground()` 里创建两层 canvas，并给 `document.documentElement` 加 `has-canvas-bg`。
- `global.css` 里有一层**静态 CSS 点阵**作为 JS 未执行时的降级：

```css
/* html 上的静态点阵（JS 未执行时的兜底） */
body::before {
  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background-image: radial-gradient(var(--c-dot) 1px, transparent 1px);
  background-size: 15px 15px;
}
html.has-canvas-bg body::before { display: none; }  /* 有 canvas 就让位 */
```

- 依赖：`simplex-noise`（`npm i simplex-noise`），按 `createNoise3D()` 使用。

---

## 3. 注意事项 / 踩坑清单（务必逐条检查）

### 3.1 动画相关

1. **SVG 的 dash 会在每条子路径处重置**：
   `stroke-dasharray/dashoffset` 动画要求路径是**单条子路径**（只有一个 `M`）。
   若拼接成 `M…L…M…L…`，每个子路径都会「立刻整体显示」，动画会失效。
   → 要么合并成一条 `M…L…L…`，要么**每段单独一个 `<path>`**（本项目采用后者）。
2. **等待中的笔画会冒圆点**（`round` 线帽 + 零长度 dash）。
   → `animation-fill-mode: both` + `@keyframes from { opacity: 0 }`（详见 §1.4）。
3. **中心线 path 常带 `fill`**（如 `style="fill:black"`）。书写动画必须 `fill: none`，否则渲染成实心块。
4. **闭环会「描两遍」**：形态 B 必须先用 §1.2 还原中心线，否则动画会沿环路去+回。
5. **顺序**：不要想当然按 `id` 顺序；用起点 x 坐标校验。
6. **`getTotalLength()` 需要元素被渲染**：不能用 `display:none`；用 `position:absolute;left:-9999px` 的 1×1 svg。
7. **无损重播**：改 `key`（React）或「移除 class → 强制 reflow → 重新加 class」来重启动画。

### 3.2 页面 / 框架相关

8. **`body` 有不透明背景会盖住 `z-index:-1` 的 canvas**：
   CSS 绘制顺序里，in-flow 的 `body` 背景画在负 z-index 子层**之上**。
   → 背景色放在 `html`，`body { background: transparent; }`。
   （本项目原来 `body{background:var(--c-bg)}` 导致点阵/树枝完全不可见。）
9. **内联 SVG 里的 `<style>` 是全局的**（作用于整个文档，不是那个 svg）。
   → 用类名隔离：`.dl-sign path { … }`。
10. **内联 `style="color:#111"` 会压过 `@media (prefers-color-scheme: dark)`**。
    → 默认色也写在 CSS 里（`.dl-sign{color:#111}`），暗色覆盖才生效。
11. **`<img src="x.svg">` 里没有继承的 `currentColor`**：
    → SVG 内部自己设 `color`，并用 `prefers-color-scheme` 做暗色；不要指望外部页面传色。
12. **Astro/Vue 的 scoped 样式优先级高于全局类选择器**：
    组件内 `svg { width: 100% }`（scoped `svg[cid]`，特异性 0,1,1）会**覆盖**全局 `.logo-mark{width:104px}`（0,1,0）。
    本项目踩过：logo 被撑到 300×110 顶出 header。→ 尺寸写在组件内，或提高全局选择器特异性。
13. **Astro 的 scoped `<style>` 里选择器要能匹配到**：`path:nth-child(n)` 之类可用；
    更省事的是给每条 path 内联 `style="animation-name: dl-kN"`。

### 3.3 测试相关

14. **无头 Chrome 默认上报 `prefers-reduced-motion: reduce`**。
    如果你的代码尊重该设置（早期版本 `mountBackground` 会直接 return），无头里会**看不到任何动画**。
    → 测试时用 CDP `Emulation.setEmulatedMedia({features:[{name:'prefers-reduced-motion',value:'no-preference'}]})`，
    或明确决定「不因 reduced-motion 关闭动画」。
15. **`--virtual-time-budget` 截图的动画帧不可信**：会给出「笔画消失只剩圆点」之类的假帧。
    → 用**真实 Chrome + CDP**，`Page.navigate` 后按真实时间 `setTimeout` 再 `Page.captureScreenshot`。
16. **性能**：mask 落笔点这类方案如果撒 500+ 个带动画的元素，注意去重/抽样（本项目 1081 → 560）。
17. **纯白底上验证**最直观；暗色模式记得再看一眼 `currentColor` / `prefers-color-scheme`。

---

## 4. 最小复现步骤（拿到一个签名 SVG）

```bash
# 0) 依赖（背景特效才需要）
npm i simplex-noise

# 1) 分类 + 打印结构
node inspect.mjs "input.svg"

# 2) 若是「闭环」→ 还原中心线，输出 centerlines.json
#    （用 CDP 跑 loopToCenterline，或直接在 Node 里用 canvas/path 库）

# 3) 生成动画 CSS
#    - 单次：§1.4
#    - 循环 ping-pong：§1.5
#    - 每段 <path pathLength="1" style="animation-name: dl-kN" />

# 4) 验证（真实 Chrome + CDP 定时截图）
node shot.mjs http://localhost:PORT/ out.png 1200,2600,4000
```

**验收标准**：
- 中间帧能看到「正在写」的局部笔画（而不是整字瞬间出现）；
- 结束帧与原始 SVG 渲染一致（无缺笔、无重复描边、无多余圆点）；
- 循环版：能看到完整 → 停顿 → 按相反顺序擦回 → 空白 → 再写。

---

## 5. 本项目相关文件索引

| 文件 | 作用 |
|---|---|
| `src/scripts/background.ts` | 点阵 + 树枝背景（Canvas 2D + simplex-noise） |
| `src/components/Logo.astro` | header 的「Darling」循环书写动画（形态 B → 中心线 → ping-pong） |
| `src/styles/global.css` | `body` 透明、静态点阵降级、`has-canvas-bg` |
| `D:\DownloadEdge\darling-export\darling-animated.svg` | 独立可用的循环书写 SVG（自带 CSS/关键帧） |
| `D:\DownloadEdge\darling-export\Darling.tsx` | React + TS 组件版（零依赖） |

临时工具脚本（生成上述产物，可参考逻辑）：`mkpingpong.mjs`（关键帧生成）、
`gen-centerlines.mjs`（闭环→中心线）、`compute-dabs.html`（填充轮廓→落笔点 mask）。
