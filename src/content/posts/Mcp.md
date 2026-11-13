---
title: "MCP还是我们的优先选择吗"
date: "2026-02-08"
updated: "2026-02-08"
slug: "Mcp"
description: "同一件事在微软、Anthropic、Cloudflare 那里的统计互相打架；省 token 的地方不在换壳，在决定读多少。"
tags: ["AI", "MCP", "CLI", "Agent"]
public: true
source: "001"
---

> metadata:
> title: MCP还是我们的优先选择吗
> slug: Mcp
> date: 2026-02-08
> updated: 2026-02-08
> tags: AI, MCP, CLI, Agent
> description: 同一件事在微软、Anthropic、Cloudflare 那里的统计互相打架；省 token 的地方不在换壳，在决定读多少。
> public: true

今天本来只是让 opencode 帮我调研爬虫。需求很具体：一套能长期跑下来的采集流程——主力是 MediaCrawler，通用网页（新闻、政策原文、招标公告）交给 Crawl4AI，需要登录态的时候再临时挂一个浏览器。

结果它在建议里夹了一条跟爬虫没什么直接关系的备注：

> 一个反直觉但重要的点：微软自己在 playwright-mcp 的 README 里说——现代 coding agent 更偏好 CLI + skill 而不是 MCP，因为 CLI 调用更省 token；MCP 只在「需要持续保持浏览器状态」的长任务里才划算。

（同一份建议后面还跟了句合规提醒，说这类工具适合自己研究和小规模采集，批量、商用、二次分发数据风险很高。这句我也记下了，但跟本文无关。）

我盯着那条备注看了半天。因为同一份建议里，它把「包成 skill，直接 `uv run main.py` 跑脚本」排在「上 playwright-mcp 走流程」前面。一个卖铲子的劝你别买铲子，这个动作本身值得看一眼。

## 一、我让它把依据摊开，原文其实写得很克制

我让它别只给结论，把 README 里那段贴出来。原文是「Playwright MCP vs Playwright CLI」这一节：

> This package provides MCP interface into Playwright. If you are using a **coding agent**, you might benefit from using the [CLI+SKILLS](https://github.com/microsoft/playwright-cli) instead.
>
> **CLI**: Modern **coding agents** increasingly favor CLI–based workflows exposed as SKILLs over MCP because CLI invocations are more token-efficient: they avoid loading large tool schemas and verbose accessibility trees into the model context, allowing agents to act through concise, purpose-built commands.

第一遍读我漏了三个词：**might**、**coding agent**、**token**。补上之后，这句话的意思其实是——「在你是个 coding agent 的前提下，为了 token，你可能更该用 CLI」，不是「MCP 不行」。

它甚至还留了后半句给我（后面会讲）。

## 二、再往下问一层，成本是两笔「税」

我不满足于「省 token」这三个字，让它拆开讲。拆完发现是两笔不同的开销。

第一笔是 **schema 税**。（MCP 是 Model Context Protocol，客户端把服务器每个能力注册成「工具」，模型按 JSON schema 直接调用。关键不在协议，在「注册」这个动作——说明书得先放进上下文，模型才知道有这个工具、参数怎么填。）

这笔开销是前置的、固定的：页面还没打开，token 已经花掉了。实测一个数：Playwright MCP 的 25 个工具定义，用 o200k_base 数，常驻约 3,747 tokens（`@playwright/mcp` 0.0.83，数的是 JSON 定义，换 tokenizer 会有偏差）。Anthropic 举的例子更狠：GitHub 35 个工具约 26K、Slack 11 个约 21K，五个服务器凑出 58 个工具、约 55K tokens，会话还没开始。

第二笔是 **快照税**。（accessibility tree 就是把页面结构压成一棵带引用编号的文本树，比如 `button "提交" [ref=e15]`，模型拿 `e15` 去点。比截图省，但终归是一整棵树。）这笔是每次动作后都要付的流量税。同一份实测里，一张 50 行的订单表格，完整快照 6,583 tokens。

关键点：上下文是累加的。第三步读的快照，第三十步还在窗口里跟着走。有人算过，30 步任务每步塞一份 6,583 tokens 的快照，到最后光页面数据就堆到 19 万 tokens，一个 200K 窗口基本填满。

> 这里有个特别容易混的点：prompt caching 让这些重复内容变便宜，但**不会让它不占地方**。缓存改价格，不改窗口占用。两件事经常被说成一件事。

而这两笔税，跟「任务做得对不对」一点关系都没有。它们是接口形态的固定开销。

## 三、CLI 真正动的不是命令长度，是「东西放在哪」

我让它跑一遍看看输出。CLI 跑完一条命令，返回的是这个：

```
> playwright-cli goto https://example.com
### Page
- Page URL: https://example.com/
- Page Title: Example Domain
### Snapshot
[Snapshot](.playwright-cli/page-2026-02-14T19-22-42-679Z.yml)
```

注意，它返回的不是页面，是一个磁盘上的文件路径。模型想看再去拿，而且能只拿一部分：

- `playwright-cli find "Add to cart"`——在快照里搜，返回匹配节点加前后 3 行，行为像 `grep -C`
- `playwright-cli snapshot --depth=4`——只截前四层，不够再往下要
- `playwright-cli snapshot e34`——只快照某个元素，不整页
- `--raw`——把状态和生成代码剥掉，直接管道给 `jq`、`diff`

所以它省的不太是「命令比工具调用短」（这块其实差不多），**它省的是把页面状态从「上下文里的内容」降级成「磁盘上的文件」**。内容一旦是文件，就能被寻址、被 grep、被 diff、被直接扔掉；上下文里只留指针。

README 那句总结用词很准：**「Token-efficient. Does not force page data into LLM.」**——不是「不传」，是「不**强制**传」。决定权回到模型手上。

## 四、另一半是 skill：把「知道怎么用」也做成按需

裸 CLI 有个新问题：模型不知道有哪些命令、参数怎么拼。补法两条，一条是让它读 `--help`，一条是给一份 skill。微软选的是后者，而且结构值得记，是三级展开的：

1. frontmatter 的 `name` 和 `description` 常驻上下文（几十个 token），只用来判断「这次要不要用这个 skill」
2. 命中之后才加载 `SKILL.md` 正文（playwright-cli 那份 493 行、约 15 KB）
3. 正文里再指向 `references/*.md`（测试生成、trace、视频录制、请求 mock……），真要做那件事才打开

所以「CLI + skill」不是两个东西凑一起，是分工：**CLI 负责把数据留在外面，skill 负责把知识按需拿进来。**

这两个词其实是同一件事的两面，Anthropic 管它叫 progressive disclosure。而 MCP 的默认接法是反过来的：先把所有说明书摊开，再让模型自己挑。

## 五、然后我去对了几篇文章和一堆统计

到这一步我已经信了。但我又去翻了几篇文章和几组 MCP 的 token 统计，发现数字互相打架——而且打架的方式比结论有用。

Playwright 团队 2026 年 2 月放过一组对比：同一个任务，MCP 约 114,000 tokens，CLI 约 26,800，差不多 4 倍。这组数字后来被引用得到处都是。

另一组是 2025 年 11 月的：UI Verify 用当时最新版复测（`@playwright/mcp` 0.0.84 / `@playwright/cli` 0.1.23），同一件事，结论是另一副样子：

| 做法 | MCP | CLI |
|---|---|---|
| 每步都读整页 | 163,786 | 163,804 |
| 只读需要的那一点 | 445 | 465 |
| 先在 shell 里 grep 再读 | — | 246 |

同一件事、同一代工具，第一行差 18 个 token。因为那次实验里 agent 每步都要完整快照——CLI 把快照写进文件，agent 又原样读回来了。文件在磁盘上，内容还是进了上下文。

**所以省 token 的动作发生在「决定读多少」那一步，不在「用 CLI 还是用 MCP」那一步。** 这组数据里，接口换了只挪动约 5%，读法换了挪动约 370 倍。

还有两个更反直觉的：

- Outpost 的对比里，CLI 结束时上下文只有 MCP 的一半，但 CLI 跑了 42 轮、MCP 15 轮，最后 CLI $0.54、MCP $0.39
- Dejo 在 19 个真实网站上跑，CLI 559K、MCP 409K——CLI 反而更多，因为工具调用次数更多（8.4 次 vs 6.5 次）

这两条不是说「CLI 输了」，它们在说：**接口只决定「一次交互搬多少数据」，不决定「要交互多少次」。** 轮次一多，输出 token、cache write、每轮重复的系统提示都跟着涨。token 总量和账单不是一回事。

> 需要单独标一下的疑似错误：很多二手文章把「CLI 比 MCP 省 4 倍」当通用结论。按上面这些数据，更像是「某次特定任务、特定读法下省 4 倍」。方向没错，倍数不能平移。

同一件事在别处也发生过，时间点还很集中：11 月 4 日 Anthropic 写 code execution with MCP，一个 Google Drive → Salesforce 的流程从 150,000 tokens 降到 2,000（-98.7%）；11 月 24 日发 Tool Search Tool，58 个工具约 55K 改成按需拉 3–5 个定义，总量约 8.7K（-85%）；Cloudflare 的 Code Mode 说在 2,500 个 endpoint 的 API 面上能到 99.9%。

（一个常见引用错误：98.7% 属于 11 月 4 日那篇，85% 属于 11 月 24 日那篇，两个数字经常被拼在一起引。而且 98.7% 是单个 workflow 的案例，不是基准中位数；Cloudflare 那个 99.9% 也是极值，一般场景它报 81%。）

三家在三个层面做同一件事：微软在浏览器这层，Anthropic 在协议接法这层，Cloudflare 在 API 这层。共同点就一句：**工具的定义和工具的返回，默认不该整段穿过模型上下文。**

## 六、边界已经写在 README 后半句里

被引用得少的那半句：

> MCP remains relevant for specialized agentic loops that benefit from persistent state, rich introspection, and iterative reasoning over page structure, such as exploratory automation, self-healing tests, or long-running autonomous workflows where maintaining continuous browser context outweighs token cost concerns.

翻成人话：MCP 赢在「持续状态 + 反复看同一棵树」。探索式自动化、自愈测试、长时间自己跑的流程——这类任务是「我得一直待在这页里，改一点、看一眼、再改一点」，那每次都把树搬进上下文就是它的功能，不是它的毛病。

CLI 赢在「打开、做完、关掉」。coding agent 恰好是这种：手上已经压着一堆代码、测试、diff，浏览器只是顺手用一下，用完不该留一坨页面快照在历史里。

还有个很少被提、但决定「能不能用」的差别：CLI 要 shell 权限（skill 的 frontmatter 里就写着 `allowed-tools: Bash(playwright-cli:*)`），MCP 不用。客户端不给 shell，那 MCP 就是唯一选项，省不省 token 都没得选。

回到开头那个爬虫场景，这条线就特别清楚：MediaCrawler 对我就是「打开、做完、关掉」，所以包成 skill、`uv run main.py --platform xhs --type search --keywords xxx`，输出到 `data/` 再转 CSV 最合适——模型根本不需要读它怎么实现。而「要登录态才用浏览器」这种活的，挂 chrome-devtools-mcp 或 playwright-mcp 调试一次流程就够，别拿它们批量抓取。

## 总结：三个方面评估

所以现在再看「这个能力该做成 MCP 还是 CLI + skill」，我不按「哪个新」「哪个流行」来判断，而是看三件事：

1. **说明书多大。** 工具数量乘参数复杂度。十个以内、参数简单，这条可以直接忽略。
2. **返回多大。** 返回一行文本，和返回一棵树、一张图、一个 10MB JSON，是两种设计。
3. **要不要跨调用保持状态。** 「点开这个菜单，下一步还在这菜单里」更像 MCP；「打开、做完、关闭」更像 CLI。

三个都小，随便。有一个大，就该考虑把「读多少」这个决定交给 agent。

我这次真正学到的，不是「CLI 比 MCP 好」，而是：**省 token 的地方不在换壳，在把「要不要读、读多少」从默认行为变成一次显式决定。** 页面数据可以留在文件里，工具说明可以留在 skill 里，中间结果可以留在 shell 管道里——只要它不穿过模型上下文，就几乎不花钱。

最后留个提醒：上面这些数字都绑着具体版本和具体任务（`@playwright/mcp` 0.0.84、`@playwright/cli` 0.1.23、Claude Code 2.1.316 之类），版本一换结论可能就变；README 里那个 might，是真的 might。该记的是「为什么」，不是「几倍」。
