/* ============ 玩家卡牌记录器 ============
   给坐在 GM 对面的玩家用。上传建卡器导出的角色卡 JSON，两组卡摊开，
   点一下标记打出或弃掉，页面负责按规则算卡组循环，顺带记三个数值和一条出牌记录。

   它只吃导出的 JSON，卡面文字、罪孽名、等级全在里面，所以不引用 建卡器.js。
   题库页要读 SIN_TRAIT_QA 那些规则表才必须引用，这一页没有那个需要。

   ※ 卡组循环的 availableCards / consumeCard 与 战斗器.js:116 起的同名函数**必须一致**。
     两边算出来的剩余张数对不上，玩家和 GM 就会当场吵起来。改动时两边一起改。

   整个文件包在 IIFE 里，页面上没有别的脚本，但保持和题库同样的习惯。 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let seq = 0;
  const uid = () => `c${++seq}`;

  /* 图标文件名就是中文罪孽名。不直接用 sinLabel 拼路径，那是巧合不是约定 */
  const SIN_ICON = { wrath: "暴怒", lust: "色欲", sloth: "怠惰", gluttony: "暴食",
                     gloom: "忧郁", pride: "傲慢", envy: "嫉妒" };
  const sinIcon = (sin) => SIN_ICON[sin]
    ? `<img class="sin-icon" src="图片/${SIN_ICON[sin]}.png" alt="${SIN_ICON[sin]}" loading="lazy">` : "";

  const STORE = "limbus-trpg-tracker";   // 与建卡器的 limbus-trpg-character 分开，绝不互相覆盖

  let S = null;            // 当前状态，没导入角色时是 null
  let undoStack = [];      // 快照，上限 30

  /* ---------- 卡组循环（与 战斗器.js 同源，改动要同步） ---------- */
  const availableCards = (g) => g.cards.filter(c => !g.used.includes(c.uid));
  /* 打出和弃掉都算消耗。整组用完则刷新，弃牌因此会加速循环，
     这正是暴食「循环加速」的设计意图。 */
  function consumeCard(g, card) {
    if (!g.used.includes(card.uid)) g.used.push(card.uid);
    if (g.used.length >= g.cards.length) { g.used = []; return true; }
    return false;
  }
  /* 多重攻击结算后往组里塞一张普通攻击，循环因此变长。
     记录器只显示不算伤害，所以不需要战斗器那条取基础伤害的正则。 */
  function addExtraCard(g, card) {
    if (!card.extraCard) return null;
    const c = {
      uid: uid(), sin: card.sin, sinLabel: card.sinLabel,
      levelLabel: "基础", trait: "attack", traitLabel: "攻击", hits: 1,
      effects: [card.extraCard.effect].concat(card.extraCard.granted
        ? [`${card.extraCard.granted.label}　${card.extraCard.granted.effect}`] : []),
      extraCard: null, addedBy: `${card.sinLabel}·多重攻击`
    };
    g.cards.push(c);
    return c;
  }

  /* ---------- 导入 ---------- */
  function loadCharacter(d) {
    if (!d || !d.罪孽卡片) throw new Error("这不是建卡器导出的角色卡");
    const groups = {};
    for (const gid of ["a", "b"]) {
      groups[gid] = {
        mode: d.攻击模式?.[gid.toUpperCase() + "组"] || null,
        cards: Object.values(d.罪孽卡片[gid] || {})
          .filter(c => c.trait).map(c => ({ ...c, uid: uid() })),
        used: []
      };
    }
    const maxHp = d.衍生数值?.最大生命值 ?? 20;
    S = {
      name: d.基本信息?.名字 || "无名",
      maxHp, hp: maxHp, temp: 0,
      pressure: d.sins?.sinPressure ?? 0,
      pressureCap: d.sins?.sinPressureCap ?? 3,
      panic1: d.衍生数值?.第一混乱线 ?? Math.floor(maxHp / 2),
      panic2: d.衍生数值?.第二混乱线 ?? Math.floor(maxHp / 4),
      groups, round: 1, log: []
    };
    undoStack = [];
    save(); render();
    toast(`已导入「${S.name}」`);
  }
  window.loadCharacter = loadCharacter;   // 无头/浏览器验证用得上

  function readFile(f) {
    const r = new FileReader();
    r.onload = () => {
      try { loadCharacter(JSON.parse(r.result)); }
      catch (e) { toast("读取失败：" + e.message); }
    };
    r.readAsText(f);
  }

  /* ---------- 持久化 ---------- */
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ S, seq })); } catch (e) {}
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || "null");
      if (d && d.S && d.S.groups) { S = d.S; seq = d.seq || 0; }
    } catch (e) {}
  }

  /* ---------- 撤销 ----------
     整体快照而不是反向操作。「整组用完即刷新」会把 used 清空，
     反着推要还原刷新前的那一整串 uid，很容易错一步。 */
  function snapshot() {
    undoStack.push(JSON.stringify(S));
    if (undoStack.length > 30) undoStack.shift();
  }
  function undo() {
    if (!undoStack.length) { toast("没有可撤销的操作"); return; }
    S = JSON.parse(undoStack.pop());
    save(); render();
    toast("已撤销上一步");
  }

  /* ---------- 动作 ---------- */
  function useCard(gid, uidStr, kind) {
    const g = S.groups[gid];
    const card = g.cards.find(c => c.uid === uidStr);
    if (!card || g.used.includes(uidStr)) return;
    snapshot();
    const added = kind === "play" && card.hits > 1 ? addExtraCard(g, card) : null;
    const refreshed = consumeCard(g, card);
    S.log.unshift({
      round: S.round, kind, gid,
      name: `${card.sinLabel} · ${card.traitLabel}`,
      added: added ? `${added.sinLabel} · 普通攻击` : null,
      refreshed
    });
    save(); render();
  }

  function setVital(key, v) {
    const hi = key === "hp" ? S.maxHp : key === "pressure" ? S.pressureCap : 99;
    snapshot();
    S[key] = clamp(v, 0, hi);
    save(); render();
  }

  function nextRound() { snapshot(); S.round++; save(); render(); }

  function resetDeck() {
    if (!confirm("把两组卡都恢复成全部未使用，并清空出牌记录？角色和数值不动。")) return;
    snapshot();
    for (const gid of ["a", "b"]) {
      const g = S.groups[gid];
      g.cards = g.cards.filter(c => !c.addedBy);   // 多重攻击追加的那些一并去掉
      g.used = [];
    }
    S.log = []; S.round = 1;
    save(); render();
    toast("卡组已重置");
  }

  /* ---------- 渲染 ---------- */
  function vitalRow(key, label, cur, hi, note) {
    return `<div class="tr-vital">
      <span class="tr-vlab">${label}</span>
      <button class="btn ghost mini" data-vital="${key}" data-d="-1">−</button>
      <input type="number" class="tr-vin" data-vin="${key}" value="${cur}" min="0" max="${hi}">
      <span class="tr-vmax">/ ${hi}</span>
      <button class="btn ghost mini" data-vital="${key}" data-d="1">＋</button>
      ${note ? `<span class="tr-vnote">${note}</span>` : ""}
    </div>`;
  }

  function renderVitals() {
    if (!S) { $("trVitals").innerHTML = ""; return; }
    /* 混乱线直接改拼点骰，所以掉下去要看得见 */
    const panic = S.hp <= S.panic2 ? `<b class="tr-panic">已跌破第二混乱线（${S.panic2}），所有拼点骰 -2</b>`
                : S.hp <= S.panic1 ? `<b class="tr-panic">已跌破第一混乱线（${S.panic1}），所有拼点骰 -1</b>`
                : `混乱线 ${S.panic1} / ${S.panic2}`;
    $("trVitals").innerHTML = `<div class="tr-vitals">
      ${vitalRow("hp", "生命值", S.hp, S.maxHp, panic)}
      ${vitalRow("temp", "临时生命", S.temp, 99, "受到伤害时先扣这一格")}
      ${vitalRow("pressure", "罪孽压力", S.pressure, S.pressureCap,
        S.pressure >= S.pressureCap ? `<b class="tr-panic">压力已满，需要一次意志鉴定</b>` : "")}
    </div>`;
  }

  function cardBlock(gid, c, used) {
    const eff = (c.effects || []).map((e, i) =>
      `<div class="tr-eff${i ? " sub" : ""}">${i ? "▸ " : ""}${esc(e)}</div>`).join("");
    return `<div class="tr-card${used ? " tr-used" : ""}">
      <div class="tr-chead">
        <span class="sin-icon-inline">${sinIcon(c.sin)}</span>
        <b>${esc(c.sinLabel)} · ${esc(c.traitLabel)}</b>
        <span class="tr-lv">${esc(c.levelLabel || "")}</span>
        ${c.hits > 1 ? `<span class="tr-tag">${c.hits} 次攻击</span>` : ""}
        ${c.addedBy ? `<span class="tr-tag add">来自 ${esc(c.addedBy)}</span>` : ""}
        ${used ? `<span class="tr-tag used">已用</span>` : ""}
      </div>
      ${eff}
      ${used ? "" : `<div class="tr-acts">
        <button class="btn mini" data-use="${c.uid}" data-gid="${gid}" data-kind="play">打出</button>
        <button class="btn ghost mini" data-use="${c.uid}" data-gid="${gid}" data-kind="discard">弃掉</button>
      </div>`}
    </div>`;
  }

  function renderGroups() {
    if (!S) {
      $("trGroups").innerHTML = `<div class="card"><p class="empty">还没有导入角色。<br>
        把建卡器导出的 JSON 拖进来，或者点上面的「导入角色 JSON」。</p></div>`;
      return;
    }
    $("trGroups").innerHTML = ["a", "b"].map(gid => {
      const g = S.groups[gid], left = availableCards(g).length;
      const m = g.mode;
      if (!g.cards.length) return `<div class="card tr-group">
        <h3 class="sec-head">${gid.toUpperCase()}组</h3>
        <p class="empty">这一组没有卡片。</p></div>`;
      return `<div class="card tr-group">
        <h3 class="sec-head">${gid.toUpperCase()}组 · ${esc(m?.模式 || "未设定模式")}
          <span class="tr-count${left === 0 ? " full" : ""}">剩余 ${left} / ${g.cards.length} 张</span></h3>
        ${m ? `<p class="hint">拼点属性 ${esc(m.拼点属性)}　${esc(m.副效果)}</p>` : ""}
        <div class="tr-cards">${g.cards.map(c =>
          cardBlock(gid, c, g.used.includes(c.uid))).join("")}</div>
      </div>`;
    }).join("");
  }

  function renderLog() {
    if (!S || !S.log.length) { $("trLog").innerHTML = `<p class="empty">还没有出过牌。</p>`; return; }
    let last = null;
    $("trLog").innerHTML = S.log.map(e => {
      const head = e.round !== last ? `<div class="tr-lround">第 ${e.round} 回合</div>` : "";
      last = e.round;
      return head + `<div class="tr-lrow">
        <span class="tr-lkind ${e.kind}">${e.kind === "play" ? "打出" : "弃掉"}</span>
        <span class="tr-lname">${esc(e.name)}</span>
        <span class="tr-lgid">${e.gid.toUpperCase()}组</span>
        ${e.added ? `<span class="tr-lnote">追加「${esc(e.added)}」进本组</span>` : ""}
        ${e.refreshed ? `<span class="tr-lnote refresh">本组已用完，卡组刷新</span>` : ""}
      </div>`;
    }).join("");
  }

  function render() {
    $("trName").textContent = S ? S.name : "还没有导入角色";
    $("trRound").textContent = S ? S.round : 1;
    renderVitals(); renderGroups(); renderLog();
  }

  /* ---------- 事件 ---------- */
  $("btnImport").onclick = () => $("fileInput").click();
  $("fileInput").onchange = (ev) => {
    const f = ev.target.files[0];
    if (f) readFile(f);
    ev.target.value = "";
  };
  /* 拖进页面就导入，玩家不用先找按钮 */
  const drop = $("trDrop");
  let dragDepth = 0;
  document.addEventListener("dragenter", (e) => {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    if (++dragDepth === 1) drop.classList.add("on");
  });
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; drop.classList.remove("on"); } });
  document.addEventListener("drop", (e) => {
    e.preventDefault(); dragDepth = 0; drop.classList.remove("on");
    const f = e.dataTransfer?.files?.[0];
    if (f) readFile(f);
  });

  $("btnNextRound").onclick = () => { if (S) nextRound(); };
  $("btnUndo").onclick = () => { if (S) undo(); };
  $("btnResetDeck").onclick = () => { if (S) resetDeck(); };

  /* 卡片与计数器都是重渲染后重新生成的，所以用事件委托，不逐个绑 */
  document.addEventListener("click", (e) => {
    const use = e.target.closest("[data-use]");
    if (use) { useCard(use.dataset.gid, use.dataset.use, use.dataset.kind); return; }
    const v = e.target.closest("[data-vital]");
    if (v && S) setVital(v.dataset.vital, S[v.dataset.vital] + +v.dataset.d);
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-vin]");
    if (el && S) setVital(el.dataset.vin, parseInt(el.value, 10) || 0);
  });

  let toastTimer = null;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  load();
  render();
})();
