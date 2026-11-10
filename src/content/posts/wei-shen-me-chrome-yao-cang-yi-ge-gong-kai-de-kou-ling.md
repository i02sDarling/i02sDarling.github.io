---
title: "为什么 Chrome 要藏一个公开的口令"
date: "2025-01-22"
updated: "2025-01-22"
slug: "wei-shen-me-chrome-yao-cang-yi-ge-gong-kai-de-kou-ling"
description: "Chromium 2018 年因为博客传播换过一次 SSL 后门口令，又用 base64 包了一层，可下一行就是 atob。它挡住的从来不是读源码的人。"
tags: ["Chrome", "安全", "浏览器"]
group: "实习"
public: false
source: "未命名"
---

> metadata:
> title: 为什么 Chrome 要藏一个公开的口令
> slug: wei-shen-me-chrome-yao-cang-yi-ge-gong-kai-de-kou-ling
> date: 2025-01-22
> updated: 2025-01-22
> tags: Chrome, 安全, 浏览器
> group: 实习
> description: Chromium 2018 年因为博客传播换过一次 SSL 后门口令，又用 base64 包了一层，可下一行就是 atob。它挡住的从来不是读源码的人。
> public: false

![](/images/wei-shen-me-chrome-yao-cang-yi-ge-gong-kai-de-kou-ling/274865fe4a.webp)

Chrome 的证书错误页上没有输入框。

页面是红的，写着「您的连接不是私密连接」，下面一般会有「高级」和「继续前往」。但如果你什么都不点，只保持页面焦点，直接盲敲 `thisisunsafe` 这十二个字符，页面会自己变成正常内容。没有回显，没有输入框，中途错一个字符就从头再数。

我第一次看到这段描述，脑子里跳出来的是魂斗罗的 `↑ ↑ ↓ ↓ ← → ← → B A`。一个浏览器为什么要留作弊码？

这个问题的答案在 [Thomas Countz 2025 年 7 月那篇文章](https://thomascountz.com/2025/07/17/chromes-ssl-bypass-cheatcode) 里，他翻了 Chromium 的提交历史。但真正让我停下来重读的，是 2018 年那次改动给出的理由：

<span class="hl-red">它被换掉，是因为博客和社交媒体上写它的人太多了。</span>

## 四代口令

同一个功能，十二年里被改过四次名字：

| 时间 | 源码里的写法 | 字符数 | 有据可查的理由 |
|---|---|---|---|
| 2014-08-11 | `'danger'` | 6 | 无。Gerrit 只说是合并 `safe_browsing/` 与 `ssl/` 两套重复代码的副产物 |
| 2015 | `'badidea'` | 7 | 无 |
| 2018-01-03 | `'thisisnotsafe'` | 13 | 被博客和社媒传播得太广，轮换以防滥用 |
| 2018-01-10 | `window.atob('dGhpc2lzdW5zYWZl')` | 12 | 无。从改法看是混淆 |

四次改动里，只有一次留下了理由，就是 2018 年 1 月 3 日那次，Chromium 的 Gerrit #843085：

> The security interstitial bypass keyword hasn't changed in two years and awareness of the bypass has been increased in blogs and social media. Rotate the keyword to help prevent misuse.

翻译过来是这个绕过关键词两年没变过，而博客和社交媒体上对它的讨论变多了，所以要轮换关键词，降低被滥用的可能。

七天后，1 月 10 日，它又被改了一次。新的写法是：

```js
var BYPASS_SEQUENCE = window.atob('dGhpc2lzdW5zYWZl');
```

解一下：

```bash
$ echo dGhpc2lzdW5zYWZl | base64 -d
thisisunsafe
```

就是同一个词，换了个壳。

## 轮换不是加密

这里有个容易混的地方：**这次改动不是加密，是轮换。**

加密需要密钥，而密钥不能跟密文放在一起。base64 不需要密钥，`window.atob` 就在同一行把它解开，浏览器还替你主动执行了这个解码动作。任何人打开 DevTools、看一眼源码，看到的仍然是同一个词。

它改变的只有一件事：<span class="hl-red-bg">你用 grep 搜 `thisisunsafe` 搜不到了。</span>

所以那次提交真正的作用，不是把口令藏起来，是让 2018 年 1 月之前所有博客里写的旧口令作废。这是密钥轮换的标准动作——可密钥轮换的前提是「新密钥没人知道」，而落在一个随页面一起下发、由 `atob` 当场解开的字符串上，这个前提从头就不成立。

混淆的收益可以算得很清楚：它把**发现成本**从零抬到「打开 DevTools 看一眼」，把**利用成本**始终留在零。对读过源码的人，这次轮换连三十秒都没挡住；对三年前收藏了那篇博客的人，它确实起效了。

至于「不被写进博客」这个目标，从 2018 年那次提交之后就没再达成过。口令没变，讨论它的人只增不减。

## 没接上的摩擦

同一个文件里还有一段代码，跟这个「秘密」形成了很奇怪的对照。

```js
const PROCEED_CLICKJACKING_DELAY = 500;
```

点「继续前往」按钮之前，必须等 500 毫秒，从页面加载或重新获得焦点算起。`clickjackingDelayHasPassed()` 在按钮的点击处理里被调用，没过时间就不发命令。

而键盘那条通道是这样的：

```js
if (keyPressState === BYPASS_SEQUENCE.length) {
  sendCommand(SecurityInterstitialCommandId.CMD_PROCEED);
  keyPressState = 0;
}
```

没有延迟，没有焦点校验，没有任何等待。**同一个文件，两条通往 `CMD_PROCEED` 的路，一条要等半秒，一条零等待。**

那 500 毫秒防的是点击劫持：攻击者在页面上盖一层透明按钮，骗你点下去。而防点击劫持的思路——加一道让人过不去的摩擦——恰好也是 2014 年 Google 研究「怎么让用户不要无视 SSL 警告」时用的思路。

那篇论文叫 *Experimenting At Scale With Google Chrome's SSL Warning*（Felt 等，2014），摘要里写得很直白：目标是减少点穿警告的用户，他们考察的因素是「the use of imagery, extra steps before the user can proceed, and style choices」。

三项全是界面层的摩擦，没有一项是把绕过方法藏起来。

藏口令既不是加摩擦也不是降摩擦，它只是让查文档的人多花三十秒。更微妙的是，加摩擦这件事本身也会被后门抵消——你加了 500 毫秒，然后留了一条零延迟的键盘通道在旁边。

这段代码还有一个细节，我觉得比 base64 更能说明它的处境。`handleKeypress` 上方的注释从 2014 年写到现在一直是：

```js
/**
 * This allows errors to be skippped by typing a secret phrase into the page.
 * @param {string} e The key that was just pressed.
 */
```

`skippped`，多了一个 p。<span class="hl-red">这个拼写错误从 2014 年活到了现在，中间经历三次口令轮换、一次「混淆」改造，没人顺手改掉它。</span>

我今天重新拉了 Chromium `main` 分支上这份文件（`components/security_interstitials/core/browser/resources/interstitial_large.js`，13904 字节，blob `5f42174`）：`atob` 那行没动，注释没动，`skippped` 也没动。一个每天被轮换关键词、被担心滥用的安全机制，注释里的拼写错误留了十二年。它对 review 流量的吸引力，大概和它对攻击者的吸引力差不多。

## 官方替代路径

源码注释在 `atob` 上面两行，其实已经把态度说清楚了：

```js
// HTTPS errors are serious and should not be ignored. For testing purposes,
// other approaches are both safer and have fewer side-effects.
// See https://goo.gl/ZcZixP for more details.
```

翻译：HTTPS 错误是严重的，不应该被忽略；测试用途的话，其他方式既更安全，副作用也更少。

那个链接指向一份叫 *Deprecating Powerful Features on Insecure Origins* 的文档，里面给的开发方式是：

- `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
- 或者启动参数 `--unsafely-treat-insecure-origin-as-secure="http://example.com"`

这两条对开发者成立，对普通用户不成立：改 flags 要重启浏览器，改启动参数要改快捷方式。路上任何一步都比敲十二个字符麻烦。

于是形成了一种很奇怪的分层：

| 路径 | 谁用 | 门槛 | 副作用 |
|---|---|---|---|
| 点「高级 → 继续前往」 | 所有人 | 低 | 只这一次 |
| 敲 `thisisunsafe` | 知道这件事的人 | 低（但要先知道） | 只这一次，无提示 |
| 改 flags / 启动参数 | 开发者 | 高 | 会话级，可审计 |

中间那一行是最尴尬的：它比公开的按钮更容易，只是没人告诉你它存在。**警告页真正要拦的人，恰好是绕过它门槛最低的那批人。**

## 适用边界

- 它只对 SSL interstitial 生效。不是通用后门，跳不过登录，也跳不过付费墙。
- 只影响当前这一次导航。下一次访问还会再警告。
- 可恢复：点地址栏的「不安全」，选「重新启用警告」。
- 目标是 Chromium 系的这份 interstitial 资源；同仓库构建出来的浏览器都带着它，改不改是各家自己的事。
- 它设计给测试用。在别人的设备、共享的机器上敲它，等于替下一个使用者把唯一一次提示关掉了。

## 复现

1. 打开 `https://expired.badssl.com/`。这是一个专门提供过期证书的测试站。
2. 看到「您的连接不是私密连接」，错误码 `NET::ERR_CERT_DATE_INVALID`。**不要点「高级」，不要点任何东西。**
3. 保持页面焦点，盲敲 `thisisunsafe`（全程不会有任何回显）。
4. 期望：页面自动刷新成 `expired.badssl.com` 的正常内容，地址栏显示「不安全」。

第 2 步是整件事的关键。点了「继续前往」再敲，你验证的是按钮，不是作弊码。

![](/images/wei-shen-me-chrome-yao-cang-yi-ge-gong-kai-de-kou-ling/3b50bee137.webp)

<!-- 图 2 | https://expired.badssl.com/ | 整屏红色警告，地址栏要露出「不安全」和锁图标 | 复现的起点，也是第 2 步的对照 -->
<!-- 录屏 1 | 复现 | 从地址栏出现红色警告开始，到页面内容加载完成 | 8 秒够，别把 DNS 等待和输入法录进去 -->

## 它到底在藏什么

回到标题那个问题。Chrome 藏这个口令，藏的不是秘密，是门槛。

它防三件事：随手点过去的人、照着三年前的博客敲的人、以及误触。它防不了读源码的人，也防不了脚本——脚本要的只是那十二个字符，`sendCommand` 也不验证敲的是人还是 `dispatchEvent`。

如果哪天它真的被当成秘密保护起来，靠的一定不是 base64，而是把测试用的逃生门从正式版里拿掉。在那之前，每一次「轮换关键词以防滥用」，都只是让新写的那篇博客比旧的那篇更值钱一点。

我最后停在那行注释上。`skippped`，多了一个 p，十二年没人改。

倒是让我想起另一件事：我自己站点页脚挂着一句话，演示站只跑 http，从 https 跳过去时会提示「不安全」，这是正常的。

写那句话的时候我没觉得有什么，还觉得挺贴心。
 
现在再看，它和 `thisisunsafe` 干的是同一件事——都是请人绕过一次真实的警告，区别只在版本号。
