/* ============ 敌人制作器 ============
   战斗器里能现场捏敌人，但那边只有名字、HP、意图值、伤害骰四样。这一页负责更细的那部分：
   十个抗性系数，五类被动。做好导出 JSON，战斗器用同一个「导入」按钮读进去。

   引用 建卡器.js 只为了 SIN_ORDER / SIN_LABELS / ATTACK_MODES / sinIcon()。抄一份七罪名
   进来短期没事，以后加了罪孽就会不同步，所以照题库的路子把它当数据源引用。
   那边末尾的事件绑定包在 if(stageCard){…} 里，本页没有 #stageCard，它就退化成纯数据模块。

   ※ 抗性键、被动类别、导出字段这三样必须和 战斗器.js 对得上：
     RESIST_MODES / RESIST_SINS / PASSIVE_KINDS 在那边是权威定义，这里只是照着生成界面。
     改动任一边都要两边一起看。

   整个文件包在 IIFE 里：建卡器.js 有 150+ 个顶层声明，不隔离必然撞名。 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let seq = 0;
  const uid = () => ++seq;

  /* 与 战斗器.js 的 RESIST_MODES / RESIST_SINS 同源 */
  const MODES = { slash: "斩击", strike: "打击", pierce: "突刺" };
  const SINS = Object.fromEntries(SIN_ORDER.map(k => [k, SIN_LABELS[k]]));
  const RESIST_KEYS = { ...MODES, ...SINS };
  const KINDS = { mob: "杂兵", elite: "精英", boss: "BOSS" };
  const INTENTS = { attack: "攻击", buff: "增益", debuff: "减益" };

  /* 与 战斗器.js 的 PASSIVE_KINDS 同源。fields 决定这一类在界面上出哪几个输入框 */
  const PASSIVES = {
    roundStart: { label: "回合开始", hint: "每回合开始时结算一次",
                  fields: { heal: "恢复 HP", temp: "临时生命", addIntent: "多挂一条攻击意图（意图值）" } },
    damageCut:  { label: "减伤", hint: "在抗性之后生效",
                  fields: { flat: "每次受伤 -", cap: "单次受伤上限" } },
    immune:     { label: "免疫", hint: "勾上的那几项对它无效",
                  flags: { cancel: "免疫打断与驱散", intentDown: "免疫意图值削减", dmgTakenUp: "免疫本轮易伤" } },
    threshold:  { label: "血线触发", hint: "HP 首次跌破血线时触发一次，之后不再触发",
                  fields: { atPct: "血线 %", heal: "恢复 HP", temp: "临时生命",
                            allIntentUp: "全部攻击意图值 +", addIntent: "多挂一条攻击意图（意图值）" } },
    riposte:    { label: "反弹", hint: "被我方拼赢时反弹，单方面自动命中不算拼赢",
                  fields: { damage: "反弹伤害" } }
  };

  const STORE = "limbus-trpg-foes";   // 草稿。和角色卡、记录器的键都分开
  let S = { foes: [] };

  const newResist = () => Object.fromEntries(Object.keys(RESIST_KEYS).map(k => [k, 1]));
  const newIntent = () => ({ id: uid(), type: "attack", value: 7, dmgN: 1, dmgFaces: 6, dmgFlat: 2, note: "" });
  const newFoe = () => ({
    id: uid(), name: "敌人" + (S.foes.length + 1), kind: "mob",
    maxHp: 20, temp: 0, resist: newResist(), passives: [], intents: [newIntent()]
  });

  const find = (id) => S.foes.find(f => f.id === +id);
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ S, seq })); } catch (e) {} };
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || "null");
      if (d && d.S && Array.isArray(d.S.foes)) { S = d.S; seq = d.seq || 0; }
    } catch (e) {}
  }

  /* ---------- 渲染 ---------- */
  const num = (label, f, id, field, val, extra = "") => `
    <label class="ustat"><span>${label}</span>
      <input type="number" data-${f}="${field}" data-id="${id}" value="${val}" ${extra}></label>`;

  function resistBlock(f) {
    // .sin-icon 是 width:100%，靠容器定尺寸。裸放进标签里会撑成一整格，要套 .sin-icon-inline
    const cell = ([k, label]) => `
      <label class="ustat"><span>${k in SINS ? `<span class="sin-icon-inline">${sinIcon(k)}</span>` : ""}${label}</span>
        <input type="number" step="0.1" data-rf="${k}" data-id="${f.id}" value="${f.resist[k] ?? 1}"></label>`;
    return `<div class="fm-sec"><h4>抗性 <button class="btn ghost mini" data-resetres="${f.id}">全部设回 1</button></h4>
      <div class="fm-sub">攻击模式</div>
      <div class="unit-stats">${Object.entries(MODES).map(cell).join("")}</div>
      <div class="fm-sub">罪孽</div>
      <div class="unit-stats">${Object.entries(SINS).map(cell).join("")}</div></div>`;
  }

  function passiveBlock(f) {
    const rows = (f.passives || []).map(p => {
      const def = PASSIVES[p.kind];
      if (!def) return "";
      const inputs = Object.entries(def.fields || {}).map(([k, lb]) =>
        num(lb, "pf", p.id, k, p[k] ?? "")).join("");
      const flags = Object.entries(def.flags || {}).map(([k, lb]) => `
        <label class="fm-flag"><input type="checkbox" data-pflag="${k}" data-id="${p.id}"${p[k] ? " checked" : ""}>${lb}</label>`).join("");
      return `<div class="fm-passive">
        <div class="fm-phead"><span class="ptag">${def.label}</span>
          <input class="eff-in" data-pname="${p.id}" value="${esc(p.label || "")}" placeholder="被动名称，会写进战斗日志">
          <button class="btn ghost mini" data-pdel="${p.id}">✕</button></div>
        <p class="hint">${def.hint}</p>
        ${inputs ? `<div class="unit-stats">${inputs}</div>` : ""}
        ${flags ? `<div class="fm-flags">${flags}</div>` : ""}
      </div>`;
    }).join("");
    return `<div class="fm-sec"><h4>被动</h4>
      <div class="fm-add">
        ${Object.entries(PASSIVES).map(([k, v]) =>
          `<button class="btn ghost mini" data-padd="${k}" data-id="${f.id}">＋ ${v.label}</button>`).join("")}
      </div>
      ${rows || `<p class="hint">还没有被动。杂兵通常不需要，精英与 BOSS 各加一到两条就够。</p>`}</div>`;
  }

  function intentBlock(f) {
    return `<div class="fm-sec"><h4>意图 <button class="btn ghost mini" data-iadd="${f.id}">＋ 意图</button></h4>
      <div class="intents">${(f.intents || []).map(i => `
        <div class="intent i-${i.type}">
          <select data-if="type" data-fid="${f.id}" data-iid="${i.id}">
            ${Object.entries(INTENTS).map(([k, v]) =>
              `<option value="${k}"${i.type === k ? " selected" : ""}>${v}</option>`).join("")}
          </select>
          ${i.type === "attack" ? `
            <label class="ilab">意图值<input type="number" class="iv" data-if="value" data-fid="${f.id}" data-iid="${i.id}" value="${i.value}"></label>
            <span class="ilab dice">伤害
              <input type="number" class="iv sm" data-if="dmgN" data-fid="${f.id}" data-iid="${i.id}" value="${i.dmgN}" min="1" max="10">d<input
                     type="number" class="iv sm" data-if="dmgFaces" data-fid="${f.id}" data-iid="${i.id}" value="${i.dmgFaces}" min="2" max="100">+<input
                     type="number" class="iv sm" data-if="dmgFlat" data-fid="${f.id}" data-iid="${i.id}" value="${i.dmgFlat}">
              <b class="dice-range">${i.dmgN + i.dmgFlat}~${i.dmgN * i.dmgFaces + i.dmgFlat}</b></span>` : ""}
          <input class="inote" data-if="note" data-fid="${f.id}" data-iid="${i.id}" value="${esc(i.note)}" placeholder="备注">
          <button class="btn ghost mini" data-idel="${i.id}" data-fid="${f.id}" title="删除这条意图">✕</button>
        </div>`).join("") || `<p class="hint">没有意图的敌人只能被单方面攻击。</p>`}</div></div>`;
  }

  function render() {
    $("fmCount").textContent = S.foes.length ? `这场遭遇有 ${S.foes.length} 个敌人` : "还没有敌人";
    $("fmList").innerHTML = S.foes.map(f => `
      <div class="card fm-foe">
        <div class="fm-head">
          <input class="name-input" data-ff="name" data-id="${f.id}" value="${esc(f.name)}">
          <div class="kind-pick">${Object.entries(KINDS).map(([k, v]) =>
            `<button class="kd-btn${f.kind === k ? " on" : ""}" data-kind="${k}" data-id="${f.id}">${v}</button>`).join("")}</div>
          <button class="btn ghost mini" data-fdel="${f.id}">✕ 删除</button>
        </div>
        <div class="unit-stats">
          ${num("生命上限", "ff", f.id, "maxHp", f.maxHp, 'min="1"')}
          ${num("初始临时生命", "ff", f.id, "temp", f.temp)}
        </div>
        ${resistBlock(f)}
        ${passiveBlock(f)}
        ${intentBlock(f)}
      </div>`).join("") || `<p class="empty">还没有敌人。点右上角「＋ 新增敌人」。</p>`;
  }

  /* ---------- 导出与导入 ---------- */
  function buildExport() {
    return {
      元数据: { 系统: "Limbus Company TRPG", 类型: "敌人卡", 生成时间: new Date().toISOString() },
      敌人: S.foes.map(f => ({
        name: f.name, kind: f.kind, maxHp: f.maxHp, hp: f.maxHp, temp: f.temp,
        resist: { ...f.resist },
        // id 不导出，战斗器导入时重发，免得两份文件的 id 撞上
        passives: (f.passives || []).map(({ id, ...rest }) => rest),
        intents: (f.intents || []).map(({ id, ...rest }) => rest)
      }))
    };
  }

  $("btnExport").onclick = () => {
    if (!S.foes.length) { toast("还没有敌人可导出"); return; }
    const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `遭遇_${S.foes.length}人_LimbusTRPG.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出 JSON");
  };

  $("btnImport").onclick = () => $("fileInput").click();
  $("fileInput").onchange = (ev) => {
    const file = ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d.敌人) throw new Error("这不是敌人制作器导出的文件");
        for (const f of d.敌人) {
          S.foes.push({
            id: uid(), name: f.name || "敌人", kind: KINDS[f.kind] ? f.kind : "mob",
            maxHp: f.maxHp ?? 20, temp: f.temp || 0,
            resist: { ...newResist(), ...(f.resist || {}) },
            passives: (f.passives || []).map(p => ({ ...p, id: uid() })),
            intents: (f.intents || []).map(i => ({ ...newIntent(), ...i, id: uid() }))
          });
        }
        save(); render();
        toast(`已导入 ${d.敌人.length} 个敌人`);
      } catch (e) { toast("读取失败：" + e.message); }
    };
    r.readAsText(file);
  };

  $("btnAdd").onclick = () => { S.foes.push(newFoe()); save(); render(); };
  $("btnClear").onclick = () => {
    if (!S.foes.length || !confirm("清空这场遭遇的全部敌人？")) return;
    S.foes = []; save(); render(); toast("已清空");
  };

  /* ---------- 事件 ----------
     每次改动都重渲染，所以一律用事件委托挂在 document 上，不逐个绑 */
  const passiveOwner = (pid) => S.foes.find(f => (f.passives || []).some(p => p.id === +pid));
  const passiveOf = (pid) => { const f = passiveOwner(pid); return f && f.passives.find(p => p.id === +pid); };

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-fdel],[data-kind],[data-resetres],[data-padd],[data-pdel],[data-iadd],[data-idel]");
    if (!t) return;
    const d = t.dataset;
    if (d.fdel) { S.foes = S.foes.filter(f => f.id !== +d.fdel); }
    else if (d.kind) { const f = find(d.id); if (f) f.kind = d.kind; }
    else if (d.resetres) { const f = find(d.resetres); if (f) f.resist = newResist(); }
    else if (d.padd) { const f = find(d.id); if (f) (f.passives ||= []).push({ id: uid(), kind: d.padd, label: PASSIVES[d.padd].label }); }
    else if (d.pdel) { const f = passiveOwner(d.pdel); if (f) f.passives = f.passives.filter(p => p.id !== +d.pdel); }
    else if (d.iadd) { const f = find(d.iadd); if (f) f.intents.push(newIntent()); }
    else if (d.idel) { const f = find(d.fid); if (f) f.intents = f.intents.filter(i => i.id !== +d.idel); }
    save(); render();
  });

  document.addEventListener("input", (e) => {
    const el = e.target, d = el.dataset;
    let dirty = true;
    if (d.ff) { const f = find(d.id); if (f) f[d.ff] = d.ff === "name" ? el.value : (+el.value || 0); }
    else if (d.rf) { const f = find(d.id); if (f) f.resist[d.rf] = el.value === "" ? 1 : +el.value; }
    else if (d.pf) { const p = passiveOf(d.id); if (p) p[d.pf] = el.value === "" ? null : +el.value; }
    else if (d.pname) { const p = passiveOf(d.pname); if (p) p.label = el.value; }
    else if (d.if) {
      const f = find(d.fid), i = f && f.intents.find(x => x.id === +d.iid);
      if (i) i[d.if] = (d.if === "note" || d.if === "type") ? el.value : (+el.value || 0);
    } else dirty = false;
    if (!dirty) return;
    save();
    // 名字与备注是边打字边存的，重渲染会让光标跳走，所以这两个不重画
    if (!d.pname && d.ff !== "name" && d.if !== "note") render();
  });

  document.addEventListener("change", (e) => {
    const d = e.target.dataset;
    if (d.pflag) { const p = passiveOf(d.id); if (p) { p[d.pflag] = e.target.checked; save(); render(); } }
    else if (d.if === "type") { save(); render(); }
  });

  let toastTimer = null;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  load();
  if (!S.foes.length) S.foes.push(newFoe());
  render();
})();
