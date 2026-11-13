---
title: "如何阻止 AI 爬虫"
date: "2025-03-22"
updated: "2025-03-22"
slug: "ru-he-zu-zhi-ai-pa-chong-2"
description: "Anubis 不判断来的是不是机器人，它只给每个请求加一道要算一分多钟的算术题，把抓取的价格抬到买不起。"
tags: ["爬虫", "反爬", "工作量证明"]
public: true
source: "如何阻止 AI 爬虫"
---

> metadata:
> title: 如何阻止 AI 爬虫
> slug: ru-he-zu-zhi-ai-pa-chong-2
> date: 2025-03-22
> updated: 2025-03-22
> tags: 爬虫, 反爬, 工作量证明
> description: Anubis 不判断来的是不是机器人，它只给每个请求加一道要算一分多钟的算术题，把抓取的价格抬到买不起。
> public: true

一月写过 Chrome 的后门口令，说藏起来挡不住人；这次反过来，让访问变贵。

## 一句原话

2025 年 3 月 17 日，代码托管站 SourceHut 的站长 Drew DeVault 写了一篇：

> If you think these crawlers respect robots.txt then you are several assumptions of good faith removed from reality.

如果你以为这些爬虫会遵守 robots.txt，那你离现实还差好几层善意。

他给的细节比结论更硬：爬虫会去抓 `git blame`、每个仓库的每一页 log、每一次提交；请求来自数万个地址，大部分是住宅 IP，每个 IP 只发一个请求，UA 和真人重叠。代价是他每周 20% 到 100% 的时间都在处理这些流量，一周几十次短暂中断。

## 算术题

[Anubis](https://anubis.techaro.lol/) 的做法是一个反向代理：所有请求先经过它，页面上跑一段 JS，算这个：

```js
const hash = await sha256(`${challenge}${nonce}`);
```

`challenge` 由 IP、UA、当天日期、Anubis 的公钥拼成；`nonce` 从 1 开始递增，直到算出的哈希**前五位十六进制都是 0** 才放行。默认难度就是 5 位。

五个十六进制零，等于平均要试 16⁵ ≈ 105 万次。手机上实测 1 分 53 秒。通过之后服务器验一次哈希、写一个 Cookie，后续请求不再重复。代价是清楚的：真人等一两分钟，爬虫的每一页都要重算一遍。

<span class="hl-red">它不判断访客是不是机器人，只让「多拿一页」的边际成本从一毫秒变成一分钟。</span>

## 账本

| 数字 | 出处 | 说明 |
|---|---|---|
| 84,000 个请求 / 2.5 小时 | GNOME 管理员 Bart Piotrowski，2025-03 | 只有 3.2% 通过挑战 |
| 800GB/天 → 200GB/天 | Read the Docs，2025-03 | 屏蔽 AI 爬虫后省下约 $1,500/月 |

3.2% 这个比例是全文最不好看的数字：<span class="hl-red-bg">被算作访客的流量里，绝大多数从来没打算读这些页面。</span>

但代价也不是零。一个 GitLab 链接被贴进聊天室，几百人共用一个出口 IP，难度会被上调，真人跟着等一两分钟——Hacker News 上出现过同样的情况。

<!-- 图 1 | https://drewdevault.com/blog/Stop-externalizing-your-costs-on-me/ | 第二段里「20-100% of my time」与「tens of thousands of IP addresses」两句 | 证明压力来自分布式住宅 IP，不是几个大爬虫 -->
<!-- 图 2 | https://anubis.techaro.lol/ | 挑战页的计时截图 | 真人也要付这一两分钟 -->

## 边界

**一，SHA-256 是比特币的算法。** 矿机算这个比手机便宜几个数量级。挡得住「顺手抓一遍」的脚本，挡不住真正想要数据、愿意开机房的团队；<span class="hl-red">它提高的是价格，不是门槛。</span>

**二，这是一张给所有人开的税单。** 机器和人都要付，区别只是人付得起。站点越大、被转得越多，真人付得越多。

**三，只有一种站点用得上。** 大到值得被反复爬，又小到用不起 Cloudflare 那套商业防护的独立站。企业级服务要么已经有 CDN，要么不适合在前面再挂一层代理。

## 判据

先算账：被爬走的带宽值多少钱，加一道算术题会赶走多少真人。两边都能量出来，就不用靠感觉选边。

再认一件事：<span class="hl-red">反爬的胜负不在「识别」，在「定价」。</span>

识别出一条规则，就有一条绕过它的写法；改一次价格，所有请求都要重新算一遍。

至于来的是人还是机器 😑 那道算术题从头到尾没打算知道。
