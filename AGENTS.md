## Development

**人**在编辑器里开发，用前台模式（跟着终端一起关）：

```
npm run dev          # 先 astro dev stop 清掉残留，再前台起服务
```

前台进程挂在当前终端上，关掉 VS Code / 终端就一起结束。

**agent** 需要跨多次工具调用保持服务时才用后台模式：

```
npm run dev:bg       # astro dev --background
npm run dev:stop     # 用完必须停，否则会留一个脱离终端的孤儿进程
npm run dev:status
```

`astro dev --background` 内部是 `spawn(..., { detached: true })` + `child.unref()`，
进程被**故意**从启动它的终端上摘下来了，所以关 VS Code 它不会退出；下次再起一台
就会因为 4321 被占而落到 4322，变成两个实例。`npm run dev` 的 `predev` 会先把
残留的那台停掉，因此人永远最多只会有一台。

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## 文章排印（强制）

文章正文的排版语汇（加粗提色、衬线引用、链接下划线、标题 `#` 锚点、外链图标、行内高亮、文末终端导航）以 **`D:\Darling\Darling\AGENTS.md` 的「文章正文排印」章节**为准，改样式前先读那一节。

## 并行开发（多 agent · git worktree）

总则见全局 `~/.config/opencode/AGENTS.md`。本仓库约定：

- 任务规划 md 放 `worktree/<task-id>.md`，**只在 main 的仓库根目录读写**；任何 `task/*` 分支不得改动 `worktree/`。
- 认领后在主工作副本（仓库根目录）执行 `git worktree add .worktrees/<task-id> -b task/<task-id>`，工作副本在 `.worktrees/`（已 gitignore）。
- 收尾在 main 上：合并 → README 登记已完成 → 删 `worktree/<task-id>.md` → `git worktree remove .worktrees/<task-id>`。
