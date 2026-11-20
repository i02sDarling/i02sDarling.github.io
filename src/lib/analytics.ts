/**
 * 阅读量统计：GoatCounter。
 *
 * 这是个纯静态站（GitHub Pages），没有服务端可记账，所以「每篇文章多少人看过」
 * 只能交给外部服务。选 GoatCounter 的原因：无 Cookie、不采个人信息、免费额度
 * 够个人博客用，而且它提供一个能按任意路径取数的 JSON 接口。
 *
 * **博客页面本身不显示阅读量**（列表页、文章页都不加数字），只有统计在上报；
 * 数字放在本机工具 ip-studio 的「发布」页里看（`ip-studio/src/core/blogViews.ts`）。
 *
 * 配置（三步）：
 *   1. goatcounter.com 注册，站点码形如 `daling`；
 *   2. 站点设置里打开 “Allow adding visitor counts on your website”（默认关）；
 *   3. 仓库根目录 `.env` 写 `PUBLIC_GOATCOUNTER_CODE=daling`，
 *      线上则在 GitHub 仓库 Settings → Variables 里加同名变量 GOATCOUNTER_CODE
 *      （deploy.yml 会把它透传给构建）。
 *
 * 没配这个变量时：不加载统计脚本、一个请求都不发 ——
 * 别人 fork 这个仓库不会把访问记到你头上。
 */
const raw = (import.meta.env.PUBLIC_GOATCOUNTER_CODE ?? '').trim()

export const GOATCOUNTER_CODE = /^[a-z0-9][a-z0-9-]*$/i.test(raw) ? raw : ''

export const HAS_PAGEVIEWS = GOATCOUNTER_CODE !== ''

export const GOATCOUNTER_ORIGIN = HAS_PAGEVIEWS ? `https://${GOATCOUNTER_CODE}.goatcounter.com` : ''
