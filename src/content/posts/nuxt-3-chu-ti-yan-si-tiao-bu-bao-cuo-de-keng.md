---
title: "Nuxt 3 初体验：四条不报错的坑"
date: "2024-06-14"
updated: "2026-11-13"
slug: "nuxt-3-chu-ti-yan-si-tiao-bu-bao-cuo-de-keng"
description: "2024 年 6 月第一次上手 Nuxt 3 撞到的四个坑：空白页、两次请求、动态路由卡死、跨请求状态泄漏，全都不抛错。"
tags: ["Nuxt", "Vue", "SSR", "数据获取"]
public: true
source: "未命名-20261109-2256"
---

> metadata:
> title: Nuxt 3 初体验：四条不报错的坑
> slug: nuxt-3-chu-ti-yan-si-tiao-bu-bao-cuo-de-keng
> date: 2024-06-14
> updated: 2026-11-13
> tags: Nuxt, Vue, SSR, 数据获取
> description: 2024 年 6 月第一次上手 Nuxt 3 撞到的四个坑：空白页、两次请求、动态路由卡死、跨请求状态泄漏，全都不抛错。
> public: true

2024 年 6 月，我第一次正经用 Nuxt。

`npx nuxi init` 之后三分钟就跑起来了，感觉良好。目录约定确实省事：`pages/post/[id].vue` 一个文件就是一条路由，`composables/` 里的东西自动导入，`server/api/` 写完就是一个接口。

真正花时间的不是「怎么写」，是后面四件事——**它们一个都不抛错**。

## 一、空白页

第一个坑最直接：`pages/` 建好了，`app.vue` 也写了，浏览器打开一片空白。

`app.vue` 是整个应用的入口，它自己不会去渲染路由。`pages/` 里的东西要有个位置落地，那个位置就是 `<NuxtPage />`：

```vue
<!-- 这样写，pages/ 里的内容不会出现 -->
<template>
  <div>
    <NuxtWelcome />
  </div>
</template>
```

改成：

```vue
<template>
  <div>
    <NuxtPage />
  </div>
</template>
```

注意 `<NuxtPage />` 不是 `<RouterView />` 的别名。它包了一层 `RouterView`，还顺手处理了过渡、keep-alive 和 `useRoute()` 的路径正确性——直接用 `RouterView`，会出现「路由参数对不上」这种更难查的现象。

这条在 3.10 之后至少会给你一句 warning（`Your project has pages but the <NuxtPage /> component has not been used`），在那之前是纯静默。<span class="hl-red">warning 不中断渲染，所以页面上什么都没有，dev server 依然是一行绿色的 ready。</span>

判断方式：网络面板 200，HTML 里有 `<div id="__nuxt">`，但里面是空的——那就是入口没接上路由。

## 二、两次请求

第二个坑更隐蔽：接口被调用了两次，而且两次都成功。

```ts
const posts = await $fetch('/api/posts')
```

这段代码放在 `<script setup>` 里，服务端渲染时跑一次生成 HTML，浏览器 hydration 时再跑一次。`$fetch` 文档写得很直白：

> Using `$fetch` in components without wrapping it with `useAsyncData` causes fetching the data twice: initially on the server, then again on the client-side during hydration, because `$fetch` does not transfer state from the server to the client.

原因不复杂：<span class="hl-red">`$fetch` 只是 ofetch 挂了个全局名，它不知道自己在 SSR 里。</span> 服务端那次的结果没有任何通道交给客户端，客户端只能自己再来一遍。

`useFetch` 和 `useAsyncData` 干的就是这个通道：把结果序列化进 payload，客户端 hydration 时从 payload 取，不再发请求。

```ts
// 一次
const { data } = await useFetch('/api/posts')

// 一次，但能塞任意逻辑
const { data } = await useAsyncData('posts', () => $fetch('/api/posts'))
```

验证只要五秒：打开 Vue DevTools 的 Payload 面板，数据在里头，说明 hydration 复用了；不在，Network 里还能看到同一个接口第二次出现。

顺带记一下 `dedupe` 的默认值 `'cancel'`：同一个 key 同时发两次，先发的那个会被中止。多数时候这是对的，但如果你指望两次都完成，就会看到一个请求莫名其妙变成 `canceled`。

## 三、动态路由

第三个坑最容易误判：从 `/post/1` 点到 `/post/2`，URL 变了，内容没变。

而那行代码看起来完全正常：

```ts
const route = useRoute()
const { data } = await useFetch(`/api/post/${route.params.id}`)
```

问题在于 `/post/1` 和 `/post/2` 是**同一个页面组件**。Vue Router 在参数变化时会复用组件实例，`setup()` 不会重新执行——`useFetch` 也就没有第二次机会跑。这是 Vue 的行为，不是 Nuxt 的 bug，但在 Nuxt 里它长得像「数据没刷新」。

修法是把 URL 变成响应式的，交给 Nuxt 去 watch：

```ts
const route = useRoute()
const { data } = await useFetch(() => `/api/post/${route.params.id}`)
```

传函数而不是字符串，Nuxt 会把 key 变成响应式的，参数一变就重新请求。

另一种写法是给页面一个 key，强制重新挂载：

```ts
definePageMeta({
  key: route => route.fullPath,
})
```

两种都能用，区别是：传 getter 只重新取数据，组件状态留着；给 page key 是整页重建，`ref` 全部归零。<span class="hl-red-bg">参数变了但组件没重建——这才是数据不刷新的真正原因，不是缓存，也不是接口。</span>

## 四、跨请求状态

第四个坑在本地永远复现不出来。

想要一个全局状态，最自然的写法是：

```ts
// composables/useCart.ts
import { ref } from 'vue'

export const cart = ref<string[]>([])
```

单机 `npm run dev` 下一切正常。但服务端是**一个长期运行的 Node 进程**，模块顶层那行 `ref()` 只在进程启动时执行一次。用户 A 加了购物车，用户 B 下一秒请求页面，渲染出来的 HTML 里可能带着 A 的东西。

`useState` 文档的原话：

> Never define `const state = ref()` outside of `<script setup>` or `setup()` function. Such state will be shared across all users visiting your website and can lead to memory leaks!

Nuxt 给的替代品是 `useState`。它不是普通的 ref，而是挂在当前请求的 Nuxt 实例上，每个请求一份，渲染完序列化进 payload，客户端再水合回来。

```ts
export const useCart = () => useState<string[]>('cart', () => [])
```

注意第二个参数是**工厂函数**，不是值。`() => []` 才会每个请求新造一个数组；写成 `[]` 就是全进程共用一个。

这条最恶心的地方在于：<span class="hl-red-bg">单用户开发时它 100% 正常，只有并发请求才会串数据</span>，通常发现的时候已经上线了。

## 五、边界

四条对完，补几句适用范围。

这些行为在 3.11 和 3.12 上是一样的。Nuxt 3.12.0 是 2024 年 6 月 11 日发的，主要动静是开了 `future.compatibilityVersion: 4` 这个开关——把 Nuxt 4 的行为变更提前放进 3.x 里试。我让 agent 把这四条对着 3.12 的文档和 3.12.0 的 changelog 核了一遍，结论没变。

| 坑 | 会不会报错 | 发现难度 |
|---|---|---|
| 漏 `<NuxtPage />` | 3.10+ 有 warning | 低 |
| `$fetch` 两次请求 | 完全静默 | 中 |
| 动态路由不刷新 | 完全静默 | 高 |
| 模块级 `ref` 泄漏 | 完全静默 | 最高 |

<span class="hl-red">第四条我到现在也没有一个可靠的本地复现方法</span>，只能靠「不在模块顶层放响应式状态」这条纪律撑着。`ssr: false` 的纯 SPA 模式不会暴露它——因为压根没有服务端渲染；等哪天上了 SSR，它就出来了。

还有一点不确定：`useState` 的 key 是全局的，两个不相干的功能都写 `useState('data', ...)`，会拿到同一个 ref。文档只说了「用一个唯一的 key」，没说不唯一会怎样——我按共享 ref 理解，但没有实际验证过跨模块撞 key 的效果。

所以现在再看「Nuxt 好不好上手」，我的答案不是「目录约定很省事」。

省事是真的：一个文件一条路由，`composables/` 自动导入，`server/api/` 写完就是接口。但那四条坑都不在「怎么写」，而在「它什么时候不按你想的跑」——而且四条全都不抛错。

我把这四条当成一份检查清单：

1. `app.vue` 里有 `<NuxtPage />` 吗；
2. 初始数据用的是 `useFetch` 还是 `$fetch`；
3. 带参数的页面，URL 是字符串还是 getter；
4. 有没有在模块顶层写 `ref()`。

四条都过了，剩下的才是 Nuxt 真正帮你省下的那部分。

至于那条空白页——它教会我一件事：<span class="hl-red">框架不报错，不等于它做了什么</span>。页面空白、请求成功、进程健康，这三件事可以同时成立 😑
