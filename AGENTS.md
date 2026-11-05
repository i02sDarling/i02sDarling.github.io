## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

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
