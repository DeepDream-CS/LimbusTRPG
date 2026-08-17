/* ============ 战斗计算器 ============
   全部数据来自建卡器导出的 JSON，本文件不复制规则表——
   卡片的基础伤害、拼点属性、命中次数都由导出里的结构化字段提供。

   核心规则（与建卡器一致）：
     拼点值 = 1D6 + 属性 + 拼点修正；拼点值 ≥ 意图值 即命中
     伤害   = 基础伤害 + (拼点值 - 意图值)
     单方面攻击（目标没有可拼点的攻击意图）：自动命中，差值 = 拼点值
     攻击意图被拼过一次就结算，无论我方成败
   聚光灯：每回合每人只能被选中一次；选中后按槽位出牌。
   卡组：整组打完才刷新；多重攻击会往组里塞一张普通攻击，使循环变长。 */

const $ = (id) => document.getElementById(id);
const uid = (() => { let n = 0; return () => ++n; })();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const state = { round: 1, players: [], enemies: [], log: [], spot: null };

/* ---------- 概率 ---------- */
const hitRate = (mod, dc) => clamp(7 - (dc - mod), 0, 6) / 6;
const margins = (mod, dc) => { const o = []; for (let d = 1; d <= 6; d++) if (d + mod >= dc) o.push(d + mod - dc); return o; };
const avgMargin = (mod, dc) => { const o = margins(mod, dc); return o.length ? o.reduce((a, b) => a + b, 0) / o.length : 0; };
const pct = (x) => Math.round(x * 100) + "%";
const d6 = () => 1 + Math.floor(Math.random() * 6);

/* ---------- 导入 ---------- */
/* 把建卡器的一份 JSON 变成一个可参战的角色 */
function playerFromJson(d) {
  const groups = {};
  for (const gid of ["a", "b"]) {
    const src = d.罪孽卡片?.[gid] || {};
    groups[gid] = {
      mode: d.攻击模式?.[gid.toUpperCase() + "组"] || null,
      cards: Object.values(src).filter(c => c.trait).map(c => ({ ...c, uid: uid() })),
      used: []
    };
  }
  const maxHp = d.衍生数值?.最大生命值 ?? 20;
  return {
    id: uid(),
    name: d.基本信息?.名字 || "无名",
    attrs: d.基础属性 || {},
    maxHp, hp: maxHp, temp: 0,
    pressure: d.sins?.sinPressure ?? 0,
    pressureCap: d.sins?.sinPressureCap ?? 3,
    clashMod: 0,               // 手动调整（增益/减益意图的影响先手动填）
    slots: [{ group: "a" }],   // 槽位数量 + 每槽用哪组
    groups,
    actedRound: 0,             // 最后一次被聚光灯选中的回合
    slotUsed: 0                // 本回合已用掉几个槽
  };
}

/* ---------- 卡组 ---------- */
const groupOf = (p, slotIdx) => p.groups[p.slots[slotIdx]?.group || "a"];
const availableCards = (g) => g.cards.filter(c => !g.used.includes(c.uid));

/* 打出一张牌：记为已用；整组打完则刷新（追加进来的卡会留下，循环因此变长） */
function consumeCard(g, card) {
  g.used.push(card.uid);
  if (g.used.length >= g.cards.length) { g.used = []; return true; }
  return false;
}
/* 多重攻击结算后往组里塞一张普通攻击 */
function addExtraCard(g, card) {
  if (!card.extraCard) return null;
  const c = {
    uid: uid(), sin: card.sin, sinLabel: card.sinLabel,
    level: "basic", levelLabel: "基础", trait: "attack", traitLabel: "攻击",
    baseDamage: null, hits: 1, clashAttr: card.clashAttr,
    effects: [card.extraCard.effect].concat(card.extraCard.granted
      ? [`${card.extraCard.granted.label}——${card.extraCard.granted.effect}`] : []),
    extraCard: null, addedBy: card.sinLabel + "·多重攻击"
  };
  // 追加卡的基础伤害写在 effect 文本里（"基础伤害 N + 差值"），取出来供计算用
  const m = /基础伤害\s*(\d+)/.exec(card.extraCard.effect);
  c.baseDamage = m ? +m[1] : null;
  g.cards.push(c);
  return c;
}

/* ---------- 敌人与意图 ---------- */
const INTENT_TYPES = {
  attack: { label: "攻击", desc: "可拼点；被拼过一次即结算，无论我方成败" },
  buff: { label: "增益", desc: "敌方强化自身——用下方的修正框手动体现" },
  debuff: { label: "减益", desc: "削弱我方——用角色的拼点修正手动体现" }
};
const liveAttackIntents = (e) => e.intents.filter(i => i.type === "attack" && !i.resolved);

function newEnemy() {
  return { id: uid(), name: "敌人" + (state.enemies.length + 1), maxHp: 20, hp: 20, temp: 0, clashMod: 0, intents: [] };
}

/* ---------- 结算 ---------- */
/* 一次攻击的结算。intent 为 null 表示单方面攻击 */
function resolveAttack({ card, attrVal, playerMod, enemy, intent, roll }) {
  const mod = attrVal + playerMod;
  const base = card.baseDamage ?? 0;
  if (!intent) {
    // 单方面：自动命中，差值 = 拼点值
    const clashVal = roll + mod;
    return { oneSided: true, hit: true, roll, clashVal, dc: null, margin: clashVal, damage: base + clashVal };
  }
  const dc = intent.value + (enemy.clashMod || 0);
  const clashVal = roll + mod;
  const hit = clashVal >= dc;
  const margin = hit ? clashVal - dc : 0;
  return { oneSided: false, hit, roll, clashVal, dc, margin, damage: hit ? base + margin : 0 };
}

/* ---------- 渲染 ---------- */
function renderRound() {
  $("roundNo").textContent = state.round;
  const total = state.players.length;
  const done = state.players.filter(p => p.actedRound === state.round && p.slotUsed >= p.slots.length).length;
  $("roundTally").textContent = total ? `本回合 ${done} / ${total} 人已行动完` : "";
}

function renderPlayers() {
  if (!state.players.length) {
    $("players").innerHTML = `<p class="empty">尚未导入角色。<br>用建卡器的「导出 JSON」得到文件。</p>`; return;
  }
  $("players").innerHTML = state.players.map(p => `
    <div class="unit${state.spot === p.id ? " on" : ""}">
      <div class="unit-head">
        <b>${p.name}</b>
        <span class="unit-tag">${p.actedRound === state.round ? `已行动 ${p.slotUsed}/${p.slots.length}` : "待行动"}</span>
      </div>
      <div class="bar"><i style="width:${clamp(p.hp / p.maxHp * 100, 0, 100)}%"></i>
        <span>${p.hp} / ${p.maxHp}${p.temp ? ` (+${p.temp})` : ""}</span></div>
      <div class="unit-row">
        <label>HP<input type="number" data-pf="hp" data-id="${p.id}" value="${p.hp}"></label>
        <label>临时<input type="number" data-pf="temp" data-id="${p.id}" value="${p.temp}"></label>
      </div>
      <div class="unit-row">
        <label>压力<input type="number" data-pf="pressure" data-id="${p.id}" value="${p.pressure}"> / ${p.pressureCap}</label>
        <label title="增益/减益意图的影响先手动填在这里">拼点修正<input type="number" data-pf="clashMod" data-id="${p.id}" value="${p.clashMod}"></label>
      </div>
      <div class="unit-row">
        <label>槽位<input type="number" min="1" max="4" data-pf="slotCount" data-id="${p.id}" value="${p.slots.length}"></label>
        ${p.slots.map((sl, i) => `<label>槽${i + 1}
          <select data-slot="${i}" data-id="${p.id}">
            <option value="a"${sl.group === "a" ? " selected" : ""}>A组 ${p.groups.a.mode?.模式 || ""}</option>
            <option value="b"${sl.group === "b" ? " selected" : ""}>B组 ${p.groups.b.mode?.模式 || ""}</option>
          </select></label>`).join("")}
      </div>
      <div class="unit-row hint">${["a", "b"].map(g =>
        `${g.toUpperCase()}组 ${availableCards(p.groups[g]).length}/${p.groups[g].cards.length} 张可用`).join(" · ")}</div>
    </div>`).join("");

  $("players").querySelectorAll("[data-pf]").forEach(el => el.onchange = () => {
    const p = state.players.find(x => x.id === +el.dataset.id); if (!p) return;
    const v = +el.value || 0;
    if (el.dataset.pf === "slotCount") {
      const n = clamp(v, 1, 4);
      while (p.slots.length < n) p.slots.push({ group: "a" });
      p.slots.length = n;
    } else p[el.dataset.pf] = v;
    renderAll();
  });
  $("players").querySelectorAll("[data-slot]").forEach(el => el.onchange = () => {
    const p = state.players.find(x => x.id === +el.dataset.id);
    p.slots[+el.dataset.slot].group = el.value; renderAll();
  });
}

function renderEnemies() {
  if (!state.enemies.length) { $("enemies").innerHTML = `<p class="empty">尚未添加敌人。</p>`; return; }
  $("enemies").innerHTML = state.enemies.map(e => `
    <div class="unit foe">
      <div class="unit-head">
        <input class="name-input" data-ef="name" data-id="${e.id}" value="${e.name}">
        <button class="btn ghost mini" data-del="${e.id}">✕</button>
      </div>
      <div class="bar foe"><i style="width:${clamp(e.hp / e.maxHp * 100, 0, 100)}%"></i><span>${e.hp} / ${e.maxHp}</span></div>
      <div class="unit-row">
        <label>HP<input type="number" data-ef="hp" data-id="${e.id}" value="${e.hp}"></label>
        <label>上限<input type="number" data-ef="maxHp" data-id="${e.id}" value="${e.maxHp}"></label>
        <label>临时<input type="number" data-ef="temp" data-id="${e.id}" value="${e.temp}"></label>
        <label title="增益意图的影响先手动填在这里">意图修正<input type="number" data-ef="clashMod" data-id="${e.id}" value="${e.clashMod}"></label>
      </div>
      <div class="intents">
        ${e.intents.map(i => `
          <div class="intent i-${i.type}${i.resolved ? " done" : ""}">
            <select data-if="type" data-eid="${e.id}" data-iid="${i.id}">
              ${Object.entries(INTENT_TYPES).map(([k, v]) => `<option value="${k}"${i.type === k ? " selected" : ""}>${v.label}</option>`).join("")}
            </select>
            ${i.type === "attack" ? `<input type="number" class="iv" data-if="value" data-eid="${e.id}" data-iid="${i.id}" value="${i.value}" title="意图值">` : ""}
            <input class="inote" data-if="note" data-eid="${e.id}" data-iid="${i.id}" value="${i.note}" placeholder="备注">
            ${i.resolved ? `<span class="pill rej">已结算</span>` : ""}
            <button class="btn ghost mini" data-delint="${i.id}" data-eid="${e.id}">✕</button>
          </div>`).join("") || `<p class="hint">没有意图——我方攻击此敌人将是单方面攻击</p>`}
      </div>
      <button class="btn ghost mini" data-addint="${e.id}">＋ 意图</button>
    </div>`).join("");

  const find = (el) => state.enemies.find(x => x.id === +el.dataset.id || x.id === +el.dataset.eid);
  $("enemies").querySelectorAll("[data-ef]").forEach(el => el.onchange = () => {
    const e = find(el); if (!e) return;
    e[el.dataset.ef] = el.dataset.ef === "name" ? el.value : (+el.value || 0);
    renderAll();
  });
  $("enemies").querySelectorAll("[data-if]").forEach(el => el.onchange = () => {
    const e = find(el); const i = e.intents.find(x => x.id === +el.dataset.iid);
    i[el.dataset.if] = el.dataset.if === "value" ? (+el.value || 0) : el.value;
    renderAll();
  });
  $("enemies").querySelectorAll("[data-addint]").forEach(el => el.onclick = () => {
    const e = state.enemies.find(x => x.id === +el.dataset.addint);
    e.intents.push({ id: uid(), type: "attack", value: 7, note: "", resolved: false });
    renderAll();
  });
  $("enemies").querySelectorAll("[data-delint]").forEach(el => el.onclick = () => {
    const e = find(el); e.intents = e.intents.filter(x => x.id !== +el.dataset.delint); renderAll();
  });
  $("enemies").querySelectorAll("[data-del]").forEach(el => el.onclick = () => {
    state.enemies = state.enemies.filter(x => x.id !== +el.dataset.del); renderAll();
  });
}

/* 聚光灯：先选人，再逐槽出牌 */
let pending = null;   // {playerId, slotIdx, cardUid, enemyId, intentId|null}

function renderSpot() {
  const pickable = state.players.filter(p => p.actedRound !== state.round);
  $("spotPick").innerHTML = !state.players.length
    ? `<p class="empty">先导入角色。</p>`
    : `<div class="gender-row">${state.players.map(p => {
        const done = p.actedRound === state.round;
        return `<div class="opt${state.spot === p.id ? " sel" : ""}${done ? " done" : ""}" data-spot="${p.id}">
          ${p.name}<br><small>${done ? `本回合已行动` : `${p.slots.length} 槽`}</small></div>`;
      }).join("")}</div>
      ${pickable.length ? "" : `<p class="hint">本回合所有人都行动过了，点「下一回合」。</p>`}`;
  $("spotPick").querySelectorAll("[data-spot]").forEach(el => el.onclick = () => {
    const p = state.players.find(x => x.id === +el.dataset.spot);
    if (p.actedRound === state.round && p.slotUsed >= p.slots.length) { toast(`${p.name} 本回合已行动完`); return; }
    state.spot = p.id; pending = null; renderAll();
  });

  const p = state.players.find(x => x.id === state.spot);
  if (!p) { $("spotBody").innerHTML = ""; return; }
  if (p.actedRound !== state.round) { p.actedRound = state.round; p.slotUsed = 0; }

  if (p.slotUsed >= p.slots.length) {
    $("spotBody").innerHTML = `<div class="attr-help">${p.name} 的 ${p.slots.length} 个槽都用完了。选下一个人，或进入下一回合。</div>`;
    return;
  }
  const slotIdx = p.slotUsed, g = groupOf(p, slotIdx), avail = availableCards(g);
  const sel = pending && pending.playerId === p.id ? pending : null;
  const card = sel ? g.cards.find(c => c.uid === sel.cardUid) : null;

  $("spotBody").innerHTML = `
    <div class="attr-help">
      <b>${p.name}</b> · 槽 ${slotIdx + 1} / ${p.slots.length} · 使用 <b>${p.slots[slotIdx].group.toUpperCase()}组</b>
      （${g.mode ? `${g.mode.模式} · 拼点属性 ${g.mode.拼点属性} · ${g.mode.副效果}` : "未设定模式"}）
      <br>本组剩余 <b>${avail.length}</b> / ${g.cards.length} 张${avail.length === 0 ? "——打完即刷新" : ""}
    </div>
    <label class="field"><span class="lab">选择卡片</span>
      <div class="card-pick">${avail.map(c => `
        <div class="pick${card && card.uid === c.uid ? " sel" : ""}" data-card="${c.uid}">
          <b>${c.sinLabel} · ${c.traitLabel}</b><small>${c.levelLabel}${c.addedBy ? ` · 由${c.addedBy}追加` : ""}</small>
          <div class="pick-eff">${c.effects[0] || ""}</div>
        </div>`).join("") || `<p class="hint">本组已空，打出任意一张后会刷新。</p>`}</div>
    </label>
    ${card ? renderTargetPicker(p, card, sel) : ""}`;

  $("spotBody").querySelectorAll("[data-card]").forEach(el => el.onclick = () => {
    pending = { playerId: p.id, slotIdx, cardUid: +el.dataset.card, enemyId: null, intentId: null };
    renderAll();
  });
  bindTargetPicker(p, card, sel);
}

function renderTargetPicker(p, card, sel) {
  const enemy = state.enemies.find(e => e.id === sel.enemyId);
  const intent = enemy ? enemy.intents.find(i => i.id === sel.intentId) : null;
  const attrVal = card.clashAttr ? (p.attrs[card.clashAttr] ?? 0) : 0;
  const mod = attrVal + p.clashMod;

  let preview = "";
  if (enemy) {
    const live = liveAttackIntents(enemy);
    if (intent) {
      const dc = intent.value + enemy.clashMod;
      preview = `拼点值 = 1D6 + ${card.clashAttr}(${attrVal})${p.clashMod ? ` + 修正${p.clashMod}` : ""} 对 意图值 ${dc}
        <br>命中率 <b>${pct(hitRate(mod, dc))}</b> · 命中时差值均值 ${avgMargin(mod, dc).toFixed(1)}
        ${card.baseDamage != null ? `<br>命中伤害 ≈ <b>${(card.baseDamage + avgMargin(mod, dc)).toFixed(1)}</b>（基础 ${card.baseDamage} + 差值）` : ""}`;
    } else if (!live.length) {
      preview = `<b>单方面攻击</b>——该敌人没有可拼点的攻击意图，自动命中，<b>差值 = 拼点值</b>
        ${card.baseDamage != null ? `<br>期望伤害 ≈ <b>${(card.baseDamage + 3.5 + mod).toFixed(1)}</b>` : ""}
        ${card.hits > 1 ? `<br><span style="color:var(--danger)">注意：多重攻击的单方面那次不计差值</span>` : ""}`;
    } else preview = `<span class="hint">请选择要拼的意图</span>`;
  }

  return `
    <label class="field"><span class="lab">选择目标</span>
      <div class="gender-row">${state.enemies.map(e => `
        <div class="opt${sel.enemyId === e.id ? " sel" : ""}" data-foe="${e.id}">${e.name}<br>
          <small>${e.hp}/${e.maxHp} · ${liveAttackIntents(e).length ? `${liveAttackIntents(e).length} 个待拼意图` : "无待拼意图"}</small></div>`).join("")
        || `<p class="hint">先添加敌人。</p>`}</div>
    </label>
    ${enemy ? `<label class="field"><span class="lab">对抗哪个意图</span>
      <div class="gender-row">
        ${liveAttackIntents(enemy).map(i => `<div class="opt${sel.intentId === i.id ? " sel" : ""}" data-intent="${i.id}">
          攻击意图 ${i.value + enemy.clashMod}<br><small>${i.note || "—"}</small></div>`).join("")}
        <div class="opt${sel.intentId === null && liveAttackIntents(enemy).length === 0 ? " sel" : ""}" data-intent="none">单方面攻击<br><small>不拼点</small></div>
      </div></label>` : ""}
    ${preview ? `<div class="attr-help">${preview}</div>` : ""}
    ${card.effects.length > 1 ? `<div class="attr-help"><b>卡面特效（需自行结算）</b>${card.effects.slice(1).map(e => `<br>▸ ${e}`).join("")}</div>` : ""}
    ${enemy ? `<div class="export-row">
      <button class="btn primary" id="btnRoll">🎲 投骰结算</button>
      <label class="manual">手动指定骰值 <input type="number" id="manualRoll" min="1" max="6" placeholder="1-6"></label>
    </div>` : ""}`;
}

function bindTargetPicker(p, card, sel) {
  if (!card) return;
  $("spotBody").querySelectorAll("[data-foe]").forEach(el => el.onclick = () => {
    pending.enemyId = +el.dataset.foe;
    const e = state.enemies.find(x => x.id === pending.enemyId);
    const live = liveAttackIntents(e);
    pending.intentId = live.length ? live[0].id : null;   // 默认选第一个待拼意图
    renderAll();
  });
  $("spotBody").querySelectorAll("[data-intent]").forEach(el => el.onclick = () => {
    pending.intentId = el.dataset.intent === "none" ? null : +el.dataset.intent;
    renderAll();
  });
  const btn = $("btnRoll");
  if (btn) btn.onclick = () => doResolve(p, card, sel);
}

function doResolve(p, card, sel) {
  const enemy = state.enemies.find(e => e.id === sel.enemyId);
  const intent = enemy.intents.find(i => i.id === sel.intentId) || null;
  const manual = +$("manualRoll")?.value;
  const attrVal = card.clashAttr ? (p.attrs[card.clashAttr] ?? 0) : 0;
  const lines = [];
  let total = 0;

  for (let h = 0; h < (card.hits || 1); h++) {
    const roll = manual >= 1 && manual <= 6 ? manual : d6();
    // 多重攻击的第二次若打在没有意图的目标上，按卡面规则不计差值
    const useIntent = h === 0 ? intent : (intent && !intent.resolved ? intent : null);
    const r = resolveAttack({ card, attrVal, playerMod: p.clashMod, enemy, intent: useIntent, roll });
    let dmg = r.damage;
    if (card.hits > 1 && r.oneSided) dmg = card.baseDamage ?? 0;   // 单方面不计差值
    total += dmg;
    lines.push(`第${h + 1}击 1D6=${roll} → 拼点值 ${r.clashVal}` +
      (r.oneSided ? `（单方面，自动命中）` : ` 对 意图值 ${r.dc} → ${r.hit ? "命中" : "未命中"}`) +
      ` · 伤害 ${dmg}`);
    if (useIntent) useIntent.resolved = true;   // 拼过一次即结算，无论成败
  }

  // 结算伤害：先扣临时生命
  const absorbed = Math.min(enemy.temp || 0, total);
  enemy.temp = (enemy.temp || 0) - absorbed;
  enemy.hp = clamp(enemy.hp - (total - absorbed), 0, enemy.maxHp);

  // 多重攻击往卡组塞一张普通攻击
  const g = groupOf(p, sel.slotIdx);
  const added = card.hits > 1 ? addExtraCard(g, card) : null;
  const refreshed = consumeCard(g, card);
  p.slotUsed++;
  pending = null;

  pushLog(`【第${state.round}回合】${p.name} 用「${card.sinLabel}·${card.traitLabel}(${card.levelLabel})」攻击 ${enemy.name}`,
    lines.concat([
      `合计伤害 ${total}${absorbed ? `（临时生命吸收 ${absorbed}）` : ""}，${enemy.name} 剩余 ${enemy.hp}/${enemy.maxHp}`,
      added ? `※ 多重攻击：一张「${added.sinLabel} · 普通攻击」已加入 ${sel.slotIdx !== undefined ? p.slots[sel.slotIdx].group.toUpperCase() : ""}组` : null,
      refreshed ? `※ 该组已打完，卡组刷新` : null
    ].filter(Boolean)));
  renderAll();
}

function pushLog(title, lines) { state.log.unshift({ title, lines }); state.log = state.log.slice(0, 40); }
function renderLog() {
  $("log").innerHTML = state.log.length
    ? state.log.map(l => `<div class="logrow"><b>${l.title}</b>${l.lines.map(x => `<br>${x}`).join("")}</div>`).join("")
    : `<p class="empty">还没有记录。</p>`;
}

function renderAll() { renderRound(); renderPlayers(); renderEnemies(); renderSpot(); renderLog(); }

/* ---------- 交互 ---------- */
$("btnImport").onclick = () => $("fileInput").click();
$("fileInput").onchange = (ev) => {
  const files = [...ev.target.files];
  let done = 0;
  files.forEach(f => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d.基础属性) throw new Error("不是建卡器导出的角色卡");
        state.players.push(playerFromJson(d));
        toast(`已导入「${d.基本信息?.名字 || "无名"}」`);
      } catch (e) { toast("读取失败：" + e.message); }
      if (++done === files.length) renderAll();
    };
    r.readAsText(f);
  });
  ev.target.value = "";
};
$("btnAddEnemy").onclick = () => { state.enemies.push(newEnemy()); renderAll(); };
$("btnNextRound").onclick = () => {
  state.round++;
  state.players.forEach(p => { p.slotUsed = 0; });
  // 新回合敌人重新起意图：已结算的标记清掉，由 GM 决定是否调整
  state.enemies.forEach(e => e.intents.forEach(i => { i.resolved = false; }));
  state.spot = null; pending = null;
  pushLog(`—— 进入第 ${state.round} 回合 ——`, ["所有人可再次行动；敌方意图重置为未结算"]);
  renderAll();
};
$("btnResetAll").onclick = () => {
  if (!confirm("清空所有角色、敌人和日志，重新开始一场战斗？")) return;
  state.round = 1; state.players = []; state.enemies = []; state.log = []; state.spot = null; pending = null;
  renderAll(); toast("已重置");
};

let toastTimer = null;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

renderAll();
