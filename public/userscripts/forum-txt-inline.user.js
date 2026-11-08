// ==UserScript==
// @name         论坛 TXT 附件自动展开
// @namespace    darling.userscript.txt-inline
// @version      1.0.0
// @description  把页面里 txt 链接（含地址不带 .txt 的论坛附件链接）的内容直接展开在链接下方，无需下载
// @author       Darling
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

/*
 * 安装步骤
 * 1. 浏览器装 Tampermonkey。
 * 2. 新建脚本，把本文件内容整个粘进去，保存。
 * 3. 改上面那行 @match，换成你要生效的站点，例如：
 *      // @match        *://*.98t.la/*
 *    想一次写多个站点就写多行 @match。
 * 4. 打开帖子页刷新，txt 链接下方会自动出现内容框。
 *
 * 常见调整都在下面的 CONFIG 里。
 */

(function () {
  'use strict';

  /* ===================== 用户配置 ===================== */
  const CONFIG = {
    // 额外限制生效域名，例：['98t.la', '*.98t.la']。
    // 留空 [] 表示不限制，完全交给脚本头的 @match。
    domains: [],

    // 链接文字或网址里出现它，就认定为 txt 链接
    keyword: /\.txt\b/i,

    // true = 页面加载后自动读取并展开；false = 先显示占位，点「展开」才读取
    autoExpand: true,

    // 带上页面地址作为 Referer。个别论坛开了防盗链，缺 Referer 会返回 403
    sendReferer: true,

    maxBytes: 2 * 1024 * 1024, // 文件超过这个大小就截断
    maxChars: 300000,          // 最多渲染这么多字
    concurrency: 3,            // 同时发起的请求数
    collapsedHeight: 460,      // 内容区最大高度（px），超出后内部滚动
  };
  /* ==================================================== */

  /* ---------------- 域名过滤 ---------------- */
  function domainAllowed() {
    const list = CONFIG.domains;
    if (!list || !list.length) return true;
    const host = location.hostname.toLowerCase();
    return list.some(function (raw) {
      const d = String(raw).toLowerCase().trim().replace(/^\*?\.?/, '');
      if (!d) return false;
      return host === d || host.endsWith('.' + d);
    });
  }

  /* ---------------- 样式 ---------------- */
  const CSS = [
    '.tm-txt-box{',
    '  margin:8px 0 14px !important;',
    '  border:1px solid #d9dee6 !important;',
    '  border-radius:8px !important;',
    '  background:#fbfcfd !important;',
    '  color:#1f2328 !important;',
    '  font:13px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif !important;',
    '  overflow:hidden !important;',
    '  box-sizing:border-box !important;',
    '  width:auto !important;',
    '  max-width:100% !important;',
    '  text-align:left !important;',
    '  box-shadow:0 1px 2px rgba(0,0,0,.05) !important;',
    '}',
    '.tm-txt-box .tm-txt-head{',
    '  display:flex !important;',
    '  align-items:center !important;',
    '  gap:8px !important;',
    '  padding:7px 10px !important;',
    '  background:#f1f4f8 !important;',
    '  border-bottom:1px solid #e3e8ef !important;',
    '  flex-wrap:wrap !important;',
    '}',
    '.tm-txt-box .tm-txt-name{',
    '  color:#0b67d0 !important;',
    '  font-weight:600 !important;',
    '  text-decoration:none !important;',
    '  word-break:break-all !important;',
    '  max-width:100% !important;',
    '}',
    '.tm-txt-box .tm-txt-name:hover{ text-decoration:underline !important; }',
    '.tm-txt-box .tm-txt-meta{',
    '  color:#6b7480 !important;',
    '  font-size:12px !important;',
    '  white-space:nowrap !important;',
    '}',
    '.tm-txt-box .tm-txt-actions{',
    '  margin-left:auto !important;',
    '  display:inline-flex !important;',
    '  gap:6px !important;',
    '}',
    '.tm-txt-box button{',
    '  font:12px/1 "Microsoft YaHei",sans-serif !important;',
    '  padding:4px 9px !important;',
    '  border:1px solid #ccd4de !important;',
    '  border-radius:5px !important;',
    '  background:#fff !important;',
    '  color:#333b45 !important;',
    '  cursor:pointer !important;',
    '  box-shadow:none !important;',
    '  margin:0 !important;',
    '}',
    '.tm-txt-box button:hover{ background:#eef3fa !important; border-color:#9fb8d8 !important; }',
    '.tm-txt-box .tm-txt-body{',
    '  margin:0 !important;',
    '  padding:10px 12px !important;',
    '  background:transparent !important;',
    '  color:inherit !important;',
    '  font:12.5px/1.7 ui-monospace,SFMono-Regular,Consolas,"Microsoft YaHei",monospace !important;',
    '  white-space:pre-wrap !important;',
    '  word-break:break-word !important;',
    '  overflow:auto !important;',
    '  max-width:100% !important;',
    '  tab-size:4 !important;',
    '}',
    '.tm-txt-box[data-collapsed="true"] .tm-txt-body{ display:none !important; }',
    '.tm-txt-box[data-state="error"]{ border-color:#e6b8b8 !important; }',
    '.tm-txt-box[data-state="error"] .tm-txt-meta{ color:#c0392b !important; }',
    '.tm-txt-box[data-state="ok"] .tm-txt-meta{ color:#2e7d4f !important; }',
    '.tm-txt-box[data-state="loading"] .tm-txt-meta{ color:#8a6d1f !important; }',
    '@media (prefers-color-scheme: dark){',
    '  .tm-txt-box{ background:#1b1e23 !important; border-color:#323842 !important; color:#d5dae1 !important; }',
    '  .tm-txt-box .tm-txt-head{ background:#232830 !important; border-bottom-color:#323842 !important; }',
    '  .tm-txt-box .tm-txt-name{ color:#6cb6ff !important; }',
    '  .tm-txt-box .tm-txt-meta{ color:#9aa4b2 !important; }',
    '  .tm-txt-box button{ background:#2b313a !important; border-color:#3d4550 !important; color:#d5dae1 !important; }',
    '  .tm-txt-box button:hover{ background:#353d48 !important; border-color:#4d5866 !important; }',
    '  .tm-txt-box[data-state="ok"] .tm-txt-meta{ color:#5ec98a !important; }',
    '  .tm-txt-box[data-state="error"] .tm-txt-meta{ color:#ff8a80 !important; }',
    '}',
  ].join('\n');

  function injectStyle() {
    if (document.getElementById('tm-txt-inline-style')) return;
    if (typeof GM_addStyle === 'function') {
      GM_addStyle(CSS);
      return;
    }
    const el = document.createElement('style');
    el.id = 'tm-txt-inline-style';
    el.textContent = CSS;
    (document.head || document.documentElement).appendChild(el);
  }

  /* ---------------- 文本解码 ---------------- */
  const NativeTextDecoder = (function () {
    try { if (typeof TextDecoder === 'function') return TextDecoder; } catch (e) { /* ignore */ }
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow && typeof unsafeWindow.TextDecoder === 'function') {
        return unsafeWindow.TextDecoder;
      }
    } catch (e) { /* ignore */ }
    return null;
  })();

  function decodeWith(buffer, encoding, fatal) {
    if (!NativeTextDecoder) return null;
    try {
      return new NativeTextDecoder(encoding, fatal ? { fatal: true } : {}).decode(buffer);
    } catch (e) {
      return null;
    }
  }

  function decodeWithFileReader(buffer, encoding) {
    return new Promise(function (resolve) {
      try {
        const reader = new FileReader();
        reader.onload = function () { resolve(typeof reader.result === 'string' ? reader.result : ''); };
        reader.onerror = function () { resolve(''); };
        reader.readAsText(new Blob([buffer]), encoding);
      } catch (e) {
        resolve('');
      }
    });
  }

  async function decodeBuffer(buffer, contentType) {
    const bytes = new Uint8Array(buffer);
    const charsetMatch = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || '');
    const charset = charsetMatch ? charsetMatch[1] : '';

    // UTF-8 BOM
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      const r = decodeWith(bytes.subarray(3), 'utf-8');
      return r !== null ? r : await decodeWithFileReader(buffer, 'utf-8');
    }
    // UTF-16 BOM
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return decodeWith(bytes.subarray(2), 'utf-16le') || '';
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return decodeWith(bytes.subarray(2), 'utf-16be') || '';
    }
    // 服务器声明的编码
    if (charset) {
      const r = decodeWith(buffer, charset);
      if (r !== null) return r;
    }
    // 严格按 UTF-8 试一次，失败说明多半是 GBK
    const strict = decodeWith(buffer, 'utf-8', true);
    if (strict !== null) return strict;

    const gbk = decodeWith(buffer, 'gbk');
    if (gbk !== null) return gbk;
    return await decodeWithFileReader(buffer, 'gbk');
  }

  /* ---------------- 网络请求 ---------------- */
  function getHeader(headers, name) {
    if (!headers) return '';
    const re = new RegExp('^' + name + ':\\s*(.+)$', 'im');
    const m = re.exec(String(headers));
    return m ? m[1].trim() : '';
  }

  function rawRequest(url) {
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest === 'function') {
        const headers = { Accept: 'text/plain,*/*' };
        if (CONFIG.sendReferer) headers.Referer = location.href;

        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          responseType: 'arraybuffer',
          timeout: 25000,
          headers: headers,
          onload: function (res) {
            if (res.status >= 200 && res.status < 300) {
              resolve({
                data: res.response,
                contentType: getHeader(res.responseHeaders, 'content-type'),
                status: res.status,
              });
            } else {
              reject(new Error('服务器返回 HTTP ' + res.status));
            }
          },
          onerror: function () { reject(new Error('网络请求失败')); },
          ontimeout: function () { reject(new Error('请求超时')); },
        });
        return;
      }

      // 没有 GM_xmlhttpRequest 时的降级方案（同源可用）
      fetch(url, { credentials: 'include' })
        .then(function (resp) {
          if (!resp.ok) throw new Error('服务器返回 HTTP ' + resp.status);
          return resp.arrayBuffer().then(function (buf) {
            resolve({
              data: buf,
              contentType: resp.headers.get('content-type') || '',
              status: resp.status,
            });
          });
        })
        .catch(reject);
    });
  }

  const textCache = new Map();

  function fetchText(url) {
    if (textCache.has(url)) return textCache.get(url);

    const task = (async function () {
      const res = await rawRequest(url);

      // 极少数环境 responseType 不生效，直接给字符串
      if (typeof res.data === 'string') {
        return { text: res.data, size: res.data.length, truncated: false };
      }
      if (!res.data) throw new Error('没有拿到内容');

      let buffer = res.data;
      let truncated = false;
      if (buffer.byteLength > CONFIG.maxBytes) {
        buffer = buffer.slice(0, CONFIG.maxBytes);
        truncated = true;
      }

      const text = await decodeBuffer(buffer, res.contentType);

      if (looksLikeHtml(text, res.contentType)) {
        const err = new Error('返回的是网页，可能需要登录或权限不足');
        err.code = 'HTML';
        throw err;
      }

      return { text: text, size: buffer.byteLength, truncated: truncated };
    })();

    textCache.set(url, task);
    task.catch(function () { textCache.delete(url); });

    // 缓存上限，避免超长帖子堆积过多内容
    if (textCache.size > 200) {
      const oldest = textCache.keys().next().value;
      if (oldest !== undefined && oldest !== url) textCache.delete(oldest);
    }
    return task;
  }

  function looksLikeHtml(text, contentType) {
    if (/text\/html|application\/xhtml/i.test(contentType || '')) return true;
    const head = String(text || '').replace(/^\uFEFF/, '').trimStart().slice(0, 600).toLowerCase();
    return head.startsWith('<!doctype html') || head.startsWith('<html');
  }

  /* ---------------- 工具 ---------------- */
  function fmtSize(n) {
    if (typeof n !== 'number' || isNaN(n)) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function linkName(a) {
    let text = (a.textContent || '').replace(/\s+/g, ' ').trim();
    text = text.replace(/\s*\([^)]*\bBytes?\b[^)]*\)\s*$/i, '').trim();
    if (!text) {
      try {
        const name = decodeURIComponent(new URL(a.href, location.href).pathname.split('/').pop() || '');
        text = name || a.href;
      } catch (e) {
        text = a.href;
      }
    }
    if (text.length > 90) text = text.slice(0, 87) + '…';
    return text || '未命名.txt';
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { /* 降级 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  function openInNewTab(text) {
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (e) { /* ignore */ }
  }

  /* ---------------- 链接识别 ---------------- */
  function isTxtLink(a) {
    const href = a.getAttribute('href') || '';
    if (!href || /^javascript:/i.test(href) || href === '#') return false;
    const text = (a.textContent || '') + ' ' + (a.getAttribute('title') || '');
    return CONFIG.keyword.test(text) || CONFIG.keyword.test(href);
  }

  /* ---------------- 渲染 ---------------- */
  const BLOCK_TAGS = new Set([
    'P', 'DIV', 'LI', 'DD', 'DT', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'FIELDSET', 'MAIN', 'ASIDE', 'PRE',
  ]);
  const TABLE_TAGS = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH']);

  function placeBox(a, box) {
    let node = a.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      if (TABLE_TAGS.has(node.tagName)) {
        a.insertAdjacentElement('afterend', box);
        return;
      }
      if (BLOCK_TAGS.has(node.tagName)) {
        if (node.tagName === 'LI') node.appendChild(box);
        else node.insertAdjacentElement('afterend', box);
        return;
      }
      node = node.parentElement;
    }
    a.insertAdjacentElement('afterend', box);
  }

  function setState(box, state, metaText) {
    box.dataset.state = state;
    const meta = box.querySelector('.tm-txt-meta');
    if (metaText != null && meta) meta.textContent = metaText;
  }

  function buildBox(a, url) {
    const box = document.createElement('div');
    box.className = 'tm-txt-box';
    box.dataset.state = 'loading';
    box.dataset.collapsed = 'false';
    box._tmText = '';

    const head = document.createElement('div');
    head.className = 'tm-txt-head';

    const name = document.createElement('a');
    name.className = 'tm-txt-name';
    name.href = url;
    name.target = '_blank';
    name.rel = 'noopener noreferrer';
    name.textContent = linkName(a);
    name.title = url;

    const meta = document.createElement('span');
    meta.className = 'tm-txt-meta';
    meta.textContent = '读取中…';

    const actions = document.createElement('span');
    actions.className = 'tm-txt-actions';

    const btnToggle = document.createElement('button');
    btnToggle.type = 'button';
    btnToggle.textContent = '收起';

    const btnCopy = document.createElement('button');
    btnCopy.type = 'button';
    btnCopy.textContent = '复制';

    const btnOpen = document.createElement('button');
    btnOpen.type = 'button';
    btnOpen.textContent = '新标签';

    btnToggle.addEventListener('click', function () {
      if (box.dataset.state === 'idle') {
        box.dataset.collapsed = 'false';
        btnToggle.textContent = '收起';
        load(box, url);
        return;
      }
      const collapsed = box.dataset.collapsed === 'true';
      box.dataset.collapsed = collapsed ? 'false' : 'true';
      btnToggle.textContent = collapsed ? '收起' : '展开';
    });

    btnCopy.addEventListener('click', async function () {
      if (!box._tmText) return;
      const ok = await copyText(box._tmText);
      const old = btnCopy.textContent;
      btnCopy.textContent = ok ? '已复制' : '复制失败';
      setTimeout(function () { btnCopy.textContent = old; }, 1200);
    });

    btnOpen.addEventListener('click', function () {
      if (!box._tmText) return;
      openInNewTab(box._tmText);
    });

    actions.appendChild(btnToggle);
    actions.appendChild(btnCopy);
    actions.appendChild(btnOpen);
    head.appendChild(name);
    head.appendChild(meta);
    head.appendChild(actions);

    const body = document.createElement('pre');
    body.className = 'tm-txt-body';
    body.style.maxHeight = CONFIG.collapsedHeight + 'px';

    box.appendChild(head);
    box.appendChild(body);
    return box;
  }

  async function load(box, url) {
    const body = box.querySelector('.tm-txt-body');
    setState(box, 'loading', '读取中…');

    try {
      const result = await fetchText(url);
      let text = result.text;

      if (text.length > CONFIG.maxChars) {
        text = text.slice(0, CONFIG.maxChars);
        result.truncated = true;
      }
      box._tmText = text;
      body.textContent = text || '（空文件）';

      const parts = [fmtSize(result.size)];
      parts.push(text.length + ' 字');
      if (result.truncated) parts.push('已截断');
      setState(box, 'ok', parts.join(' · '));
    } catch (err) {
      const msg = (err && err.message) || '读取失败';
      setState(box, 'error', msg);
      body.textContent = '⚠ ' + msg + '\n\n可以直接点上面的文件名打开原链接查看。';
    }
  }

  /* ---------------- 任务队列 ---------------- */
  const queue = [];
  let running = 0;

  function enqueue(a) {
    queue.push(a);
    pump();
  }

  function pump() {
    while (running < CONFIG.concurrency && queue.length) {
      const a = queue.shift();
      running++;
      renderLink(a).catch(function () { /* ignore */ }).then(function () {
        running--;
        pump();
      });
    }
  }

  async function renderLink(a) {
    let url;
    try {
      const u = new URL(a.href, location.href);
      if (!/^https?:$/.test(u.protocol)) return;
      url = u.href;
    } catch (e) {
      return;
    }

    const box = buildBox(a, url);
    placeBox(a, box);

    if (CONFIG.autoExpand) {
      await load(box, url);
      return;
    }

    box.dataset.state = 'idle';
    box.dataset.collapsed = 'true';
    box.querySelector('.tm-txt-body').textContent = '（点「展开」读取内容，不自动请求）';
    box.querySelector('.tm-txt-meta').textContent = '未读取';
    box.querySelector('.tm-txt-actions button').textContent = '展开';
  }

  /* ---------------- 扫描页面 ---------------- */
  function scan(root) {
    const scope = root && root.nodeType === 1 ? root : document;
    const links = [];

    if (scope.matches && scope.matches('a[href]')) links.push(scope);
    if (scope.querySelectorAll) {
      const found = scope.querySelectorAll('a[href]');
      for (let i = 0; i < found.length; i++) links.push(found[i]);
    }

    for (let i = 0; i < links.length; i++) {
      const a = links[i];
      if (a.dataset.tmTxtBound === '1') continue;
      if (a.closest && a.closest('.tm-txt-box')) continue;
      if (!isTxtLink(a)) continue;
      a.dataset.tmTxtBound = '1';
      enqueue(a);
    }
  }

  function observe() {
    if (!document.body) return;
    let timer = null;
    const pending = new Set();

    const mo = new MutationObserver(function (mutations) {
      for (let i = 0; i < mutations.length; i++) {
        const added = mutations[i].addedNodes;
        for (let j = 0; j < added.length; j++) {
          const node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.closest && node.closest('.tm-txt-box')) continue;
          pending.add(node);
        }
      }
      if (!pending.size) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        const nodes = Array.from(pending);
        pending.clear();
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].isConnected) scan(nodes[i]);
        }
      }, 250);
    });

    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    if (!domainAllowed()) return;
    injectStyle();
    scan(document);
    observe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
