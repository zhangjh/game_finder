/**
 * 本地游戏部署期脚本注入（方案 B2/B3 管道）。
 *
 * 作用：在构建本地目录（build-local-catalog 拷入 web/public/local-games/ 之后）
 * 对每个游戏的入口 HTML 做**零改源码、幂等**的注入，解决同源下跨游戏
 * localStorage key 冲突，并为后续 B3 逐游戏存档打点保留挂载面。
 *
 * 当前实现：
 *  - injectStorageNamespace()：注入「每游戏 localStorage 命名空间代理」。
 *    同源（playwhat.cc）下 432 个游戏共享同一 localStorage，34 个 key 已被
 *    多个游戏复用（如 __c2save_、bestScore、FlappyBirdBestScore），会互相覆盖。
 *    注入后游戏所有读写都以 `__gf:<gameDir>/:` 前缀隔离，互不干扰；父页
 *    按命名空间即可归属/收割每个游戏的存档（配合平台侧存档桥 B1）。
 *
 * 用法：
 *   node -e "import('./patch-local-games.mjs').then(m => console.log(m.injectStorageNamespace('<html>…</html>', 'collection-01/canvasplane').slice(0,80)))"
 *
 * 安全护栏：
 *  - marker 幂等：页面已含 __gfLocalGameNs 标记则不重复注入；
 *  - LOCAL_PATCH_DISABLE=1 可整体关闭（构建命令级兜底）；
 *  - 注入失败（非 HTML/编码异常）仅告警，不阻断构建。
 */
import fs from "node:fs";
import path from "node:path";

/** 注入后脚本特征标记（同时用于幂等判断） */
export const MARKER = "window.__gfLocalGameNs";

/**
 * 生成命名空间隔离脚本。
 * @param {string} namespace 游戏目录相对路径（如 collection-01/canvasplane），
 *                           前缀会按它做归属，必须与部署路径一致。
 * @returns {string} <script> 代码块
 */
export function buildNamespaceScript(namespace) {
  const ns = "__gf:" + namespace + ":";
  const esc = JSON.stringify(ns);
  return `<script>
(function () {
  // 本地游戏 localStorage 命名空间隔离（game_finder B2，构建期由平台注入）
  if (window.__gfLocalGameNs) return;
  var $raw = window.localStorage;
  var $ns = ${esc};
  function pre(k) { return k && k.indexOf($ns) === 0 ? k : $ns + k; }
  var $proxy = {
    get length() {
      var n = 0;
      for (var i = 0; i < $raw.length; i++) {
        var k = $raw.key(i);
        if (k && k.indexOf($ns) === 0) n++;
      }
      return n;
    },
    key: function (i) {
      var n = 0;
      for (var j = 0; j < $raw.length; j++) {
        var k = $raw.key(j);
        if (k && k.indexOf($ns) === 0) { if (n === i) return k.slice($ns.length); n++; }
      }
      return null;
    },
    getItem: function (k) { return $raw.getItem(pre(k)); },
    setItem: function (k, v) { $raw.setItem(pre(k), String(v)); },
    removeItem: function (k) { $raw.removeItem(pre(k)); },
    clear: function () {
      for (var j = 0; j < $raw.length; j++) {
        var k = $raw.key(j);
        if (k && k.indexOf($ns) === 0) $raw.removeItem(k);
      }
    }
  };
  try {
    Object.defineProperty(window, "localStorage", {
      get: function () { return $proxy; }, configurable: true
    });
  } catch (e) {
    try {
      Object.defineProperty(Window.prototype, "localStorage", {
        get: function () { return $proxy; }, configurable: true
      });
    } catch (e2) { /* 极旧浏览器：放弃隔离，直接暴露原生 storage */ }
  }
  window.__gfLocalGameNs = $ns;
})();
</script>`;
}

/**
 * 向入口 HTML 注入命名空间脚本（幂等）。
 * @param {string} html
 * @param {string} namespace 游戏部署相对目录
 * @returns {string} 注入后的 html（已有 MARKER 则原样返回）
 */
export function injectStorageNamespace(html, namespace) {
  if (!html || typeof html !== "string") return html;
  if (html.includes(MARKER)) return html; // 幂等
  const script = buildNamespaceScript(namespace);

  // 注入到 <head> 之后（head 内插到最前保证先于游戏脚本执行）；
  // 无 head 时插到第一个 <script> 前；都没有则直接置顶。
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const at = headMatch.index + headMatch[0].length;
    return html.slice(0, at) + script + html.slice(at);
  }
  const scriptMatch = html.match(/<script[^>]*>/i);
  if (scriptMatch && scriptMatch.index !== undefined) {
    return html.slice(0, scriptMatch.index) + script + html.slice(scriptMatch.index);
  }
  return script + html;
}

/**
 * B3 预留挂载点：按游戏目录特征做「引擎级 / 逐游戏」存档增强。
 * 目前仅提供引擎识别，具体存档补丁（棋盘/纸牌续玩）在拿到线上
 * 实际源码后于 build machine 上逐个补充，避免盲改。
 * @param {string} html
 * @param {string} dirAbs 游戏目录绝对路径
 * @returns {{ engine: string|null, html: string }} 识别出的引擎与（可能）改写后的 html
 */
export function detectEngine(html, dirAbs) {
  const blob = html + "\n" + readDirJsSnippet(dirAbs);
  if (/c2runtime|C2\.CreateRuntime|cr_createRuntime/.test(blob)) return "Construct2";
  if (/cc\.Director|cc\.game\.run|cocos2d/.test(blob)) return "Cocos2d-JS";
  if (/createjs|EaselJS/.test(blob)) return "CreateJS";
  if (/Phaser\./.test(blob)) return "Phaser";
  if (/egret\./.test(blob)) return "EGret";
  if (/mota|core\.legend|MotaJS/.test(blob)) return "Mota-js";
  return null;
}

/** 读取目录下少量 JS 供引擎识别（只取入口目录第一层，量小） */
function readDirJsSnippet(dirAbs) {
  if (!dirAbs || !fs.existsSync(dirAbs)) return "";
  try {
    const names = fs.readdirSync(dirAbs).slice(0, 8);
    let out = "";
    for (const n of names) {
      if (!/\.(js|html?)$/i.test(n)) continue;
      const p = path.join(dirAbs, n);
      try {
        if (fs.statSync(p).size < 512 * 1024) out += fs.readFileSync(p, "utf8") + "\n";
      } catch { /* ignore */ }
    }
    return out;
  } catch {
    return "";
  }
}

/* ===== B3：逐游戏「续玩」状态补丁（仅注入匹配目录的头部入口） =====
 *
 * 适用于"整局状态存在内存/DOM、刷新即丢"的游戏（如棋盘、纸牌）。
 * 注入代码零改游戏源码，通过公开 DOM/全局状态实现：
 *   采集：每次落子/移动/收牌后把完整局状态写入 localStorage（B2 命名空间内）
 *   恢复：平台 B1 把服务端快照写回 → 本脚本在游戏就绪后读回 → 复刻到内存并重绘。
 * 重启 = 平台清掉昨晚快照 key → 本脚本读不到 → 全新开局（天然兼容）。
 */
export const GAME_B3_DIRS = ["gobang", "chess", "spiderpoker"];

const B3_MARKER = "window.__gfB3";

// —— 五子棋：maps（16×16，0空 1白 2黑）+ isBlack，canvas 绘制 ——
function buildGobangScript() {
  return `<script>
(function () {
  if (window.__gfB3Gobang) return;
  window.__gfB3Gobang = true;
  var KEY = "gf-gobang-state";
  var ready = false;
  function persist() {
    try {
      if (!ready || !window.maps) return;
      localStorage.setItem(KEY, JSON.stringify({ maps: window.maps, black: window.isBlack, t: Date.now() }));
    } catch (e) {}
  }
  function redraw() {
    var can = document.getElementById("can");
    var ctx = can.getContext("2d");
    var len = window.maps.length;
    ctx.strokeStyle = "#333";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, can.width, can.height);
    for (var m = 0; m < len - 1; m++) {
      for (var n = 0; n < len - 1; n++) ctx.strokeRect(m * 40 + 20, n * 40 + 20, 40, 40);
    }
    for (var r = 0; r < len; r++) {
      if (!window.maps[r]) continue;
      for (var c = 0; c < len; c++) {
        var v = window.maps[r][c];
        if (!v) continue;
        var img = v === 2 ? window.black : window.white;
        if (img && (v === 1 || v === 2)) ctx.drawImage(img, c * 40, r * 40);
      }
    }
  }
  function restore() {
    var raw = localStorage.getItem(KEY);
    if (!raw) return;
    try {
      var st = JSON.parse(raw);
      if (!st || !st.maps || !st.maps.length) return;
      var rebuilt = [];
      for (var i = 0; i < st.maps.length; i++) {
        var row = st.maps[i];
        rebuilt.push(row && row.slice ? row.slice() : row);
      }
      window.maps = rebuilt;
      if (typeof st.black === "boolean") window.isBlack = st.black;
      var black = window.black, white = window.white;
      if (black && white && black.complete && white.complete) redraw();
      else {
        if (black && !black.complete) black.onload = redraw;
        if (white && !white.complete) white.onload = redraw;
        setTimeout(redraw, 600);
      }
    } catch (e) {}
  }
  function docReady() {
    if (ready || !window.maps || !window.maps.length) return;
    var can = document.getElementById("can");
    if (!can) return;
    ready = true;
    restore();
    var orig = can.onclick;
    can.onclick = function (e) {
      var r = orig ? orig.call(this, e) : undefined;
      persist();
      return r;
    };
  }
  if (document.addEventListener) {
    document.addEventListener("DOMContentLoaded", docReady);
    window.addEventListener("load", docReady);
  }
  setInterval(docReady, 150);
})();
</script>`;
}

// —— 中国象棋：map[y][x]（±1..7，0空），DOM 渲染，重绘走 showC() ——
function buildChessScript() {
  return `<script>
(function () {
  if (window.__gfB3Chess) return;
  window.__gfB3Chess = true;
  var KEY = "gf-chess-state";
  var ready = false;
  function persist() {
    try {
      if (!ready || !window.map) return;
      localStorage.setItem(KEY, JSON.stringify({ map: window.map, t: Date.now() }));
    } catch (e) {}
  }
  function restore() {
    var raw = localStorage.getItem(KEY);
    if (!raw) return;
    try {
      var st = JSON.parse(raw);
      if (!st || !st.map) return;
      var rebuilt = [];
      for (var y = 0; y < st.map.length; y++) {
        var row = st.map[y];
        rebuilt.push(row && row.slice ? row.slice() : row);
      }
      window.map = rebuilt;
      window.nowWho = -1;
      window.OnChoseNow = false;
      try { window.showC(); if (window.cleanSt) window.cleanSt(); } catch (e) {}
    } catch (e) {}
  }
  function docReady() {
    if (ready || !window.map || !window.map.length) return;
    if (typeof window.showC !== "function") return;
    ready = true;
    restore();
    var origMove = window.move;
    if (typeof origMove === "function") {
      window.move = function () {
        var r = origMove.apply(this, arguments);
        persist();
        return r;
      };
    }
  }
  if (document.addEventListener) {
    document.addEventListener("DOMContentLoaded", docReady);
    window.addEventListener("load", docReady);
  }
  setInterval(docReady, 150);
})();
</script>`;
}

// —— 蜘蛛纸牌：纯 DOM 布局（.pokerLi sort/card/groupTop/groupLeft/isOpen），
//     队列在 .pokerDeposit，pokerSendNum/pokerDifficult 为全局量 ——
function buildSpiderpokerScript() {
  return `<script>
(function () {
  if (window.__gfB3Spiderpoker) return;
  window.__gfB3Spiderpoker = true;
  var KEY = "gf-spiderpoker-state";
  var ready = false;
  function collect() {
    var state = { type: window.pokerData && window.pokerData.type, dif: window.pokerDifficult, sent: window.pokerSendNum, t: Date.now() };
    state.deposit = [];
    var dep = document.querySelectorAll("#pokerBox .pokerDeposit .pokerLi");
    for (var i = 0; i < dep.length; i++) {
      var d0 = dep[i], c0 = {};
      for (var j = 0; j < d0.attributes.length; j++) {
        var a = d0.attributes[j];
        c0[a.name] = a.value;
      }
      c0.html = '<div class="img"><img src="img/' + (d0.getAttribute("card") || "f-1") + '.png" name="face" /><img src="img/f-1.png" name="back" /></div>';
      state.deposit.push(c0);
    }
    state.lines = [];
    var lines = document.querySelectorAll("#pokerBox .pokerLine");
    for (var L = 0; L < lines.length; L++) {
      var arr = [];
      var lis = lines[L].querySelectorAll(".pokerLi");
      for (var k = 0; k < lis.length; k++) {
        var el2 = lis[k], c2 = {};
        for (var q = 0; q < el2.attributes.length; q++) {
          var b = el2.attributes[q];
          c2[b.name] = b.value;
        }
        c2.html = el2.outerHTML;
        arr.push(c2);
      }
      state.lines.push(arr);
    }
    return JSON.stringify(state);
  }
  function persist() {
    try {
      if (!ready) return;
      localStorage.setItem(KEY, collect());
    } catch (e) {}
  }
  function restore() {
    var raw = localStorage.getItem(KEY);
    if (!raw) return;
    var st;
    try { st = JSON.parse(raw); } catch (e) { return; }
    if (!st || !st.lines) return;
    var box = document.getElementById("pokerBox");
    box.innerHTML = "";
    var html = "";
    for (var b2 = 1; b2 <= 10; b2++) html += '<div class="pokerBr" style="left: ' + (120 * b2 - 100) + 'px" group="' + b2 + '"></div>';
    for (var b3 = 1; b3 <= 10; b3++) html += '<div class="pokerLine" style="left: ' + (120 * b3 - 100) + 'px" group="' + b3 + '"></div>';
    html += '<div class="pokerDeposit"></div><div class="pokerMoveGroup" style="display:none"></div><div class="pokerDoneGroup"></div>';
    box.innerHTML = html;
    if (st.type) { window.pokerData.type = st.type; window.pokerDifficult = st.dif || 1; }
    if (typeof st.sent === "number") window.pokerSendNum = st.sent;
    for (var d2 = 0; d2 < (st.deposit || []).length; d2++) {
      var dc = st.deposit[d2];
      box.querySelector(".pokerDeposit").insertAdjacentHTML("beforeend", mkCardHTML(dc));
    }
    for (var g = 0; g < 10; g++) {
      var lc = (st.lines[g] || []);
      var lineEl = box.querySelector('.pokerLine[group="' + (g + 1) + '"]');
      for (var m2 = 0; m2 < lc.length; m2++) lineEl.insertAdjacentHTML("beforeend", mkCardHTML(lc[m2]));
    }
    function mkCardHTML(c) {
      if (c.html) return c.html;
      return '<div class="pokerLi" isOpen="' + (c.isopen || c.isOpen || "no") + '" sort="' + c.sort + '" card="' + c.card + '" groupTop="' + c.grouptop + '" groupLeft="' + c.groupleft + '"><div class="img"><img src="img/' + c.card + '.png" name="face" /><img src="img/f-1.png" name="back" /></div></div>';
    }
    var alerts = document.querySelectorAll(".gAlert");
    for (var a2 = 0; a2 < alerts.length; a2++) {
      var el3 = alerts[a2];
      if (el3.parentNode) el3.parentNode.removeChild(el3);
    }
  }
  function docReady() {
    if (ready) return;
    if (typeof window.pokerSendNum !== "number") return;
    if (!document.getElementById("pokerBox")) return;
    if (window.pokerSendNum < 54) return;
    ready = true;
    restore();
    var box = document.getElementById("pokerBox");
    if (box) {
      var onAct = function () { setTimeout(persist, 50); };
      box.addEventListener("mouseup", onAct);
      box.addEventListener("click", onAct);
    }
  }
  if (document.addEventListener) {
    document.addEventListener("DOMContentLoaded", docReady);
    window.addEventListener("load", docReady);
  }
  setInterval(docReady, 300);
})();
</script>`;
}

/**
 * 按游戏目录名注入对应 B3 续玩补丁（幂等，未知目录返回原样）。
 * @param {string} html
 * @param {string|null} dirBase 游戏目录名（gobang/chess/spiderpoker）
 */
export function injectB3(html, dirBase) {
  if (!dirBase || !html || typeof html !== "string") return html;
  if (html.includes(B3_MARKER)) return html; // 幂等
  let script = null;
  if (dirBase === "gobang") script = buildGobangScript();
  else if (dirBase === "chess") script = buildChessScript();
  else if (dirBase === "spiderpoker") script = buildSpiderpokerScript();
  if (!script) return html;
  // B3 插到 </head> 前（B2 命名空间脚本插在 <head> 之后 → B2 先执行，先装好
  // localStorage 代理，B3 后续运行期引用时拿到隔离视图）。
  const endHead = html.match(/<\/head\s*>/i);
  if (endHead && endHead.index !== undefined) {
    return html.slice(0, endHead.index) + script + html.slice(endHead.index);
  }
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const at = headMatch.index + headMatch[0].length;
    return html.slice(0, at) + script + html.slice(at);
  }
  return html + script;
}

/**
 * 对单个入口 HTML 执行完整补丁流水线：
 *   B2 命名空间隔离（全部本地游戏）+ B3 逐游戏续玩（仅 gobang/chess/spiderpoker）。
 * @param {string} html
 * @param {object} opts { namespace, dirAbs }
 * @returns {{html: string, patched: boolean, engine: string|null, b3: string|null}}
 */
export function patchEntry(html, { namespace, dirAbs = null }) {
  const engine = detectEngine(html, dirAbs);
  let out = injectStorageNamespace(html, namespace);
  let b3 = null;
  if (dirAbs) {
    const base = path.basename(dirAbs.trim().replace(/\/+$/, ""));
    if (GAME_B3_DIRS.includes(base)) {
      const withB3 = injectB3(out, base);
      if (withB3 !== out) {
        out = withB3;
        b3 = base;
      }
    }
  }
  return { html: out, patched: out !== html, engine, b3 };
}

/**
 * 小工具：直接对文件执行注入（供构建脚本外壳调用 / 手工补丁）。
 * @param {string} fileAbs
 * @param {string} namespace
 */
export function patchFile(fileAbs, namespace) {
  const raw = fs.readFileSync(fileAbs, "utf8");
  const out = patchEntry(raw, { namespace, dirAbs: path.dirname(fileAbs) });
  if (out.patched) {
    fs.writeFileSync(fileAbs, out.html, "utf8");
    return out;
  }
  return out;
}