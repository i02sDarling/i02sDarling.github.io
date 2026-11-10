---
title: "隐藏的compact命令"
date: "2026-07-05"
updated: "2026-07-06"
slug: "yin-cang-de-ya-suo-ming-ling"
description: ""
tags: []
public: false
source: "隐藏的压缩命令"
---

> metadata:
> title: 隐藏的compact命令
> slug: yin-cang-de-ya-suo-ming-ling
> date: 2026-07-05
> updated: 2026-07-06
> public: false

# 不是 compact 用多了，是菜单把灰项删了

![](/images/yin-cang-de-ya-suo-ming-ling/a27bdc6766.webp)

输入框里敲 `/co`，下拉只剩两项——`/connect` 和 `/reload`。右边统计面板写着：消息数 80、助手消息 79、用户消息 0。

第一反应很自然：是不是 `/compact` 用太多次，被禁掉了？🤔

这个猜测挺合理。一个功能忽然从菜单里消失，最省事的解释就是「我用超了」。而且它和「压缩」确实有关系——只是关系不在次数上。

翻完源码和 issue，结论反过来了：**没有「compact 用多了就禁用」这种机制。** 是按钮自己被置灰，然后斜杠菜单把置灰项过滤掉，所以你看不见它。

## 一、代码里只有一行判断

客户端注册命令的时候，`session.compact` 带了一个 `disabled` 条件（`packages/app/src/session/commands/use-session-commands.tsx`）：

```ts
sessionCommand({
  id: "session.compact",
  slash: "compact",
  disabled: !sessionID || visibleUserMessages().length === 0,
  ...
})
```

关键在后半句：`visibleUserMessages().length === 0`。

它不看历史总共多少条，也不看压过几次，只看「现在这一页里，用户消息是不是 0 条」。前半句 `!sessionID` 是另一回事——没有会话就没什么可压的。

然后斜杠建议列表（`packages/app/src/composer/model.ts`）会把 disabled 的项直接扔掉：

```ts
command.options.filter(
  (item) => !item.disabled && !item.id.startsWith("suggested.") && item.slash
)
```

两件事连起来，因果就出来了：

1. 条件成立，`session.compact` 被标成 `disabled: true`
2. 菜单生成时执行 filter，灰项不进入候选列表
3. 你敲 `/co`，看到的自然只剩 `/connect` 和 `/reload`

不是禁用，是没显示。这两个词差别很大：禁用至少还留着一条灰线，让你知道「它存在，只是现在不能用」；过滤掉之后，你连它存在过都不知道 😑

| 命令 | 状态 | 你看到的结果 |
|---|---|---|
| `/connect` | 始终可用 | 在菜单里 |
| `/reload` | 始终可用 | 在菜单里 |
| `/compact` | `disabled: true` | 被 filter 掉，看不见 |

## 二、`visibleUserMessages()` 数的是「这一页」

这个名字很容易被读成「可见的用户消息」，然后理解成「所有用户消息」。不是。它只统计已经加载到客户端的那部分，具体有三层限制：

1. **只算已加载的。** 客户端不是一次把整段会话拉下来，默认只拉最近 20 条；时间线切成 compact 模式时是 40 条。更早的历史要往上滚才会加载。
2. **undo 会再筛一遍。** 如果暂存了 revert，`id ≥ revertMessageID` 的消息会被再过滤掉。
3. **它只数 user 角色。** assistant 和 tool 消息再多，也不改变这个判断。

所以「最近这一页里一条 user 消息都没有」完全可能发生。截图里那个数字就是证据：**用户消息 0**。条件成立，`/compact` 消失。

顺带解释一个看着奇怪的现象：为什么会有 79 条助手消息、0 条用户消息？两种路径都会造成这个结果——

- 压缩把唯一一轮对话整个收进了摘要，之后又跑了一大段纯 assistant / tool 调用；
- 或者根本没压缩，就是单轮特别长，几十条 tool 调用连着跑。

**截图看不出是哪一种**，这里上下文不足。但不管是哪一种，落到 `visibleUserMessages()` 上都一样：这一页的 user 消息数是 0。

## 三、为什么大家会以为是「用多了」

因为这个说法不是空穴来风，它抓住了一个真实存在的间接关系。

OpenCode 2.x 有一条改动：会话历史从「最近一次完成的 compaction」开始（CHANGELOG #59020）。也就是说，压缩之后你看到的那段历史，是从压缩点往后重新开始的。

如果压缩时把唯一一轮对话整个压进了摘要，而之后的窗口里全是 assistant / tool 消息，那么「已加载的这一页」里就真的没有 user 消息了。

注意这里的区别：

- compaction 影响的是「这一页里有什么」
- 「用多了被禁用」说的是「允许你压几次」

前者成立，后者不存在。现象对上了，归因错位了。这也是这个误会传得这么快的原因——它有一个真实的触发路径，只是解释跑偏了一层。

## 四、服务端确实没有次数限制

如果真是配额机制，服务端应该能拒绝你。翻下来，只有两种拒绝：

- `compaction.unavailable: "Nothing to compact yet"`——没有可总结的文本（比如只剩 checkpoint 自己），不是次数上限
- compaction 请求本身太大，无法再进一步缩减

官方文档还写了一句很直白的话：**Manual compaction always works**（手动压缩永远可用）。

> 需要单独提一下的疑似错误：「compact 用多了会被禁用」这个说法和上面两条证据直接冲突。但我不打算把它调和成「某种情况下也算对」——现象是真的，机制不是那个。真实机制是客户端的一行 `disabled` 判断，加一次菜单过滤。

## 五、`/reload` 看起来能修，但它不是解药

`/reload` 做的事情是：让服务端重建、客户端数据层刷新、会话视图重新挂载。

效果和「切到 Changes 再切回 Session」是同一类副作用——都是把这份视图重新算一遍。

它看起来像「压缩被重置了」，其实只是那个 `length === 0` 的判断被重新执行了一次，而这次加载进来的窗口里刚好有 user 消息。

换句话说，它治的是「这份数据没被重算」，不是「次数被清零」。这点很重要，不然下次换个场景，你会以为同一个按钮失灵了。

## 六、现在能怎么救

按代价从轻到重排：

| 做法 | 说明 |
|---|---|
| 切 tab（Session → Changes → 回 Session） | 最轻，官方 issue 里验证有效 |
| 切到别的会话再切回来 | 同上，本质是重新挂载视图 |
| 往上滚动加载更多历史 | 把 user 消息加载回来，条件不再是 0 |
| `/redo` | 如果暂存了 undo，先把 revert 清掉 |
| 直接调 API | `POST /api/session/{id}/compact` |
| 用 TUI | TUI 里有独立的 `/compact` 识别，不受这个判断影响 |

**有一个动作千万别做：菜单里没有 `/compact` 的时候，直接敲回车发出去。**

它不会被当成命令，会被当成普通聊天文本发给模型。结果是一轮白烧的 token，而且这段「/compact」还会留在会话里，污染上下文。

## 七、这套说法在哪一版成立

- 当前版本：Desktop **2.2.6**
- 这个判断条件在 dev 分支目前仍然存在
- GitHub issue **#51638**（Desktop/Web：`/compact` 从斜杠菜单消失）仍是 **open**；2.2.4 / 2.2.5 都有复现
- #60841、#61246 都被判为它的重复并关闭

想彻底修的话，方向是把 `disabled` 从 `visibleUserMessages().length === 0` 改成 `messages().length === 0`，或者干脆允许任何时候压缩。

（说明：这篇里的两段代码和 issue 号都来自这次对话提供的调研结论。本地没有那份仓库，我没有重新跑一遍源码；要动手改构建，建议先按路径核对。）


## 总结：三个方面

所以现在再遇到「某个命令忽然不见了」，我会先看三件事：

1. **它的 `disabled` 条件是什么。** 大多数「消失」其实是「没通过判断」，不是「权限被收回」。
2. **它数的是全部历史，还是当前加载的这一页。** 差这一个词，结论能完全反过来。
3. **它是修好了，还是重新算了一遍。** `/reload` 属于后者，记住这点就不会把它当万能药。
