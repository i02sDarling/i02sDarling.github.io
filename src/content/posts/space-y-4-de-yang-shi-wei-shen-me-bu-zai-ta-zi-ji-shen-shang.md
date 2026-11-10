---
title: "Tailwind的长处并非没有代价"
date: "2025-08-23"
updated: "2025-08-23"
slug: "space-y-4-de-yang-shi-wei-shen-me-bu-zai-ta-zi-ji-shen-shang"
description: "space-y-4 贴在父元素上，规则却落在子元素上。工具类省掉的那一半「选择器决策」，只是换了个地方生效。"
tags: ["Tailwind", "CSS", "前端"]
public: true
source: "未命名-20261110-2333"
---

> metadata:
> title: Tailwind的长处并非没有代价
> slug: space-y-4-de-yang-shi-wei-shen-me-bu-zai-ta-zi-ji-shen-shang
> date: 2025-08-23
> updated: 2025-08-23
> tags: Tailwind, CSS, 前端
> description: space-y-4 贴在父元素上，规则却落在子元素上。工具类省掉的那一半「选择器决策」，只是换了个地方生效。
> public: true

给页面里一列卡片调间距，我在父元素上写了 `space-y-4`，盯着预览看了十几秒：卡片之间的缝没变，变的是别处。

第一反应是类加错了元素。删掉，改到每张卡片上，卡片顶上确实出现了空白，但第一张也跟着多了一段。

来回两次，我才回去看这个类到底生成了什么。它没有生成一条声明。

## 生成的规则

```html
<div class="space-y-4">
  <div class="card">一</div>
  <div class="card">二</div>
</div>
```

编译（`npx @tailwindcss/cli -i in.css -o out.css`，v4）出来的是这一段：

```css
.space-y-4 {
  :where(& > :not(:last-child)) {
    --tw-space-y-reverse: 0;
    margin-block-start: calc(calc(var(--spacing) * 4) * var(--tw-space-y-reverse));
    margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - var(--tw-space-y-reverse)));
  }
}
```

真正干活的是里面那行 `:where(& > :not(:last-child))`：`&` 指回 `.space-y-4` 自己，`> :not(:last-child)` 把主语换成「不是最后一个的直接子元素」。

所以 margin 写在卡片上，不写在容器上。`--spacing` 是 `0.25rem`，四倍就是 `1rem`，落在每张卡片下边，最后一张没有。

<span class="hl-red-bg">你贴 class 的位置，和样式落下去的位置，可以是两个元素。</span>

`divide-y` 是同一个形状：也贴父元素、也选「除最后一个」，只是加的是边框。`group-hover` 更远一层，被改的是后代，触发条件却写在祖先身上。

## 作用对象

| 类名 | 贴在哪 | 命中谁 |
|---|---|---|
| `space-y-4` | 父元素 | 除最后一个以外的直接子元素 |
| `divide-y` | 父元素 | 同上，画边框 |
| `group-hover:underline` | 后代元素 | 后代元素，条件是祖先 hover |
| `sm:grid-cols-3` | 元素自己 | 元素自己，包在媒体查询里 |

文档说工具类「adding or removing a utility class to an element only ever affects that element」。这句对 `p-4`、`text-sm` 成立，对前三行不成立。

<span class="hl-red">前三个类影响的是这个元素的子树，而你在读父元素的代码时，一行 margin 都看不见。</span>

## 代价

我这次付了三笔。

**读的成本不固定。** `p-4` 一眼看完；`space-y-4` 得知道父元素有几个子元素、谁是最后一个、子元素有没有被包一层。它的含义有一部分不在类名里，在 DOM 里。

**改动的判断变难。** 模板里挪一个 `<div>`、循环里加一个条件，`:not(:last-child)` 指的就不是原来那个元素了。样式一行没改，效果变了。

**调试路径变长。** 间距不对，第一反应是看它自己的样式，可答案在父元素上。我多绕了两圈。

官方把限制写在另一页，`margin` 的 Limitations 段：

> The space utilities are really just a shortcut for adding margin to all-but-the-last-item in a group, and aren't designed to handle complex cases like grids, layouts that wrap…

> …the space utilities are not designed to work together with the divide utilities.

限定词很密：直接子元素、除最后一个、普通 DOM 顺序、不适配 grid、不适配会换行的布局、不和 `divide` 共用。而名字只说了一个词：垂直间距。

<span class="hl-red-bg">名字描述的是意图，实现描述的是条件，中间那段距离就是读代码要补的部分。</span>

## 边界

页面只是一堆互不相干的卡片、间距只调一次，那 `space-y-4` 确实比 `.card + .card` 短，也省掉了给每个子元素挂类。这笔交易划算。

但间距一旦随数据变，它就帮不上忙。列表为空、或者只有一项时，`:not(:last-child)` 都选中零个元素，卡片和下面的按钮之间拉不开。<span class="hl-red">它只负责子元素之间，不负责子元素和外面。</span>

还有一条：这是 v4 的行为。v3 输出的是相邻兄弟选择器（`~ :not([hidden])`），碰上条件渲染和 `hidden` 时结果不一样。

## 判断

以后碰到没看明白的工具类，先问三句：

1. 这个类的主语是谁——它所在的元素，还是子元素、兄弟、祖先？
2. 它省掉的东西跑到哪去了——选择器进了生成器，体积进了标记，成本进了读代码的时间。
3. 官方 Limitations 有没有点名我这种用法。

`space-y-4` 一直都在，代码没写错，我也没读漏。我只是在读一句话，而它写的不是我以为的那句。

真正花时间的不是读懂一条 CSS，是发现自己在读一段没写出来的 CSS。😑

![](/images/space-y-4-de-yang-shi-wei-shen-me-bu-zai-ta-zi-ji-shen-shang/6f1bdc82be.webp)

![](/images/space-y-4-de-yang-shi-wei-shen-me-bu-zai-ta-zi-ji-shen-shang/b1c64ef52e.webp)

![](/images/space-y-4-de-yang-shi-wei-shen-me-bu-zai-ta-zi-ji-shen-shang/6c974087ae.webp)
