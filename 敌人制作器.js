/* ============ Limbus Company TRPG 2.0 · 30秒异想体与遭遇配怪器 ============
   引用 建卡器.js 的权威常量（SIN_ORDER / SIN_LABELS / PHYS_MODES / GM_SCALE_TABLE / PRESET_ENCOUNTERS）。
   全部包裹在 IIFE 内避免顶层命名空间碰撞。 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let seq = 1;
  const uid = () => ++seq;

  const STORE = "limbus-trpg-v2-foes";
  const RESIST_Cycle = ["normal", "weak", "endure", "immune"];
  const RESIST_LABEL = { normal: "普通", weak: "弱点(+2)", endure: "耐性(-2)", immune: "免疫(0)" };
  const ROLE_LABEL = {
    mob: "杂兵",
    elite: "精英",
    boss_body: "异想体·主躯干",
    boss_part: "异想体·可破坏部位"
  };
  const CYCLE_LABEL = { all: "每回合常驻", odd: "单数回合(1,3,5…)", even: "双数回合(2,4,6…)" };

  const ALL_RESIST_KEYS = [
    ...Object.values(PHYS_MODES).map(m => ({ k: m.key, label: m.label })),
    ...SIN_ORDER.map(s => ({ k: s, label: SIN_LABELS[s] }))
  ];

  let S = {
    title: "自定义遭遇",
    tier: "ZAYIN",
    slots: 3,
    rewardNote: "",
    enemies: []
  };

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._tm); toast._tm = setTimeout(() => t.classList.remove("show"), 2000);
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ S, seq })); } catch (e) {}
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || "null");
      if (raw && raw.S && Array.isArray(raw.S.enemies)) {
        S = Object.assign(S, raw.S);
        seq = raw.seq || 100;
      }
    } catch (e) {}
  }

  function makeIntent(name, power, dmg, opts = {}) {
    return {
      id: uid(),
      name: name || "猛击",
      cycle: opts.cycle || "all",
      kind: opts.kind || "attack",
      power: power ?? 6,
      dmg: dmg ?? 4,
      winPressure: opts.winPressure || 0,
      unbreakable: !!opts.unbreakable,
      buffPowerNext: opts.buffPowerNext || 0,
      note: opts.note || ""
    };
  }

  function addByTemplate(kind) {
    const sc = GM_SCALE_TABLE[S.tier] || GM_SCALE_TABLE.ZAYIN;
    const n = Math.max(1, S.slots || 3);
    if (kind === "mob") {
      S.enemies.push({
        id: uid(),
        name: `${S.tier} 杂兵 ${S.enemies.length + 1}`,
        role: "mob",
        maxHp: sc.mobHp,
        hasStagger: true,
        staggerLine: Math.floor(sc.mobHp / 2),
        breakStaggersBody: false,
        resists: { strike: "weak" },
        intents: [makeIntent("常规攻击", sc.light[0], sc.light[1])]
      });
    } else if (kind === "elite") {
      const hp = sc.eliteHpPerS * n;
      S.enemies.push({
        id: uid(),
        name: `${S.tier} 精英头目`,
        role: "elite",
        maxHp: hp,
        hasStagger: true,
        staggerLine: Math.floor(hp / 2),
        breakStaggersBody: false,
        resists: { pride: "weak", slash: "endure" },
        intents: [
          makeIntent("牵制斩", sc.light[0], sc.light[1]),
          makeIntent("强力重击", sc.heavy[0], sc.heavy[1], { winPressure: 1, note: "拼赢使目标压力+1" })
        ]
      });
    } else if (kind === "boss") {
      const bodyHp = sc.bossBodyPerS * n;
      const partHp = sc.bossPartPerS * n;
      S.enemies.push(
        {
          id: uid(),
          name: `异想体·主躯干`,
          role: "boss_body",
          maxHp: bodyHp,
          hasStagger: true,
          staggerLine: Math.floor(bodyHp / 2),
          breakStaggersBody: false,
          resists: { strike: "weak", slash: "endure" },
          intents: [
            makeIntent("压迫挥击", sc.light[0], sc.light[1]),
            makeIntent("精神冲击", sc.heavy[0], sc.heavy[1], { winPressure: 1 })
          ]
        },
        {
          id: uid(),
          name: `异想体·凶器部位（破坏使躯干混乱）`,
          role: "boss_part",
          maxHp: partHp,
          hasStagger: false,
          staggerLine: 0,
          breakStaggersBody: true,
          resists: { pierce: "weak", gloom: "weak" },
          intents: [
            makeIntent("异想蓄力", 0, 0, { cycle: "odd", kind: "buff", buffPowerNext: 2, note: "单数轮蓄力：未被抹除则下轮威力+2" }),
            makeIntent("处决杀招·红光", sc.ult[0], sc.ult[1], { cycle: "even", unbreakable: true, winPressure: 1, note: "双数轮红光大招" })
          ]
        }
      );
    }
    save(); render();
    toast("已按标准数值尺生成单位！");
  }

  function loadPreset(key) {
    const pre = PRESET_ENCOUNTERS.find(p => p.key === key);
    if (!pre) return;
    S.title = pre.title;
    S.tier = pre.tier;
    S.rewardNote = pre.rewardNote;
    S.enemies = pre.enemies.map(e => ({
      ...e,
      id: uid(),
      resists: { ...(e.resists || {}) },
      intents: (e.intents || []).map(i => ({ ...i, id: uid() }))
    }));
    save(); render();
    toast(`已载入预设遭遇：${pre.title}`);
  }

  function buildExportObj() {
    return {
      version: 2,
      元数据: { 系统: "Limbus Company TRPG 2.0", 类型: "遭遇卡", 生成时间: new Date().toISOString() },
      title: S.title || "未命名遭遇",
      tier: S.tier,
      rewardNote: S.rewardNote || "",
      enemies: S.enemies
    };
  }

  function buildEncounterText() {
    const lines = [`═══ 遭遇图鉴：${S.title || "未命名遭遇"} [${S.tier}] ═══`];
    if (S.rewardNote) lines.push(`★ ${S.rewardNote}`);
    for (const e of S.enemies) {
      const wk = ALL_RESIST_KEYS.filter(x => e.resists[x.k] === "weak").map(x => x.label);
      const ed = ALL_RESIST_KEYS.filter(x => e.resists[x.k] === "endure").map(x => x.label);
      const im = ALL_RESIST_KEYS.filter(x => e.resists[x.k] === "immune").map(x => x.label);
      const resTxt = [
        wk.length ? `弱:${wk.join("/")}(+2)` : null,
        ed.length ? `耐:${ed.join("/")}(-2)` : null,
        im.length ? `免:${im.join("/")}(0)` : null
      ].filter(Boolean).join(" ") || "全普通抗性";
      const stgTxt = e.hasStagger ? `混乱线 ${e.staggerLine}` : (e.breakStaggersBody ? "破坏→使主躯干立即混乱！" : "无独立混乱线");
      lines.push(`\n【${e.name}】(${ROLE_LABEL[e.role]}) HP ${e.maxHp}（${stgTxt}）｜${resTxt}`);
      for (const i of e.intents) {
        const cyc = i.cycle === "all" ? "" : `[${CYCLE_LABEL[i.cycle]}] `;
        if (i.kind === "buff") {
          lines.push(`  ▸ ${cyc}【${i.name} · 增益意图】${i.buffPowerNext ? `未被抹除则下轮攻击威力+${i.buffPowerNext}` : ""} ${i.note || ""}`);
        } else {
          lines.push(`  ▸ ${cyc}【${i.name}${i.unbreakable ? "·红光" : ""}】威力 ${i.power} / 伤害 ${i.dmg}${i.winPressure ? ` (拼赢压+${i.winPressure})` : ""}${i.note ? ` · ${i.note}` : ""}`);
        }
      }
    }
    return lines.join("\n");
  }

  function render() {
    $("encTitle").value = S.title || "";
    $("encReward").value = S.rewardNote || "";

    const sc = GM_SCALE_TABLE[S.tier];
    $("scaleBar").innerHTML = `
      <span class="badge">危险等级：
        <select id="selTier" style="width:auto;padding:3px 8px;display:inline-block">
          ${RISK_ORDER.map(rk => `<option value="${rk}"${S.tier === rk ? " selected" : ""}>${rk}</option>`).join("")}
        </select>
      </span>
      <span class="badge">我方总行动槽 S：
        <input type="number" id="inSlots" min="1" max="10" value="${S.slots}" style="width:58px;padding:3px 6px;display:inline-block">
      </span>
      <button class="btn mini" data-gen="mob">＋ 标准杂兵 (HP ${sc.mobHp} · 威力${sc.light[0]}/伤${sc.light[1]})</button>
      <button class="btn mini" data-gen="elite">＋ 标准精英 (HP ${sc.eliteHpPerS * S.slots})</button>
      <button class="btn primary mini" data-gen="boss">＋ 异想体双部位 Boss (躯干${sc.bossBodyPerS * S.slots}+部位${sc.bossPartPerS * S.slots})</button>
    `;

    $("presetBar").innerHTML = `<span style="font-size:12.5px;color:var(--muted);align-self:center">开箱即用预设遭遇：</span>` +
      PRESET_ENCOUNTERS.map(p => `<button class="btn ghost mini" data-pre="${p.key}">载入《${esc(p.title)}》</button>`).join("");

    if (!S.enemies.length) {
      $("foeList").innerHTML = `<div class="card"><p class="empty">当前遭遇还没有敌人。点击上方「＋ 标准杂兵 / 异想体双部位 Boss」1秒生成，或直接载入一套预设遭遇！</p></div>`;
    } else {
      $("foeList").innerHTML = S.enemies.map((e, idx) => `
        <div class="card" style="margin-bottom:14px;border-left:4px solid var(--danger)">
          <div class="sec-head" style="margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:240px">
              <span class="ptag warn">#${idx + 1}</span>
              <input type="text" data-ef="name" data-id="${e.id}" value="${esc(e.name)}" style="max-width:280px;font-weight:700">
              <select data-ef="role" data-id="${e.id}" style="width:auto;padding:6px 10px">
                ${Object.entries(ROLE_LABEL).map(([k, lb]) => `<option value="${k}"${e.role === k ? " selected" : ""}>${lb}</option>`).join("")}
              </select>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn ghost mini" data-del="${e.id}">✕ 删除单位</button>
            </div>
          </div>

          <div class="unit-stats" style="margin-bottom:12px">
            <label class="ustat"><span>最大 HP</span>
              <input type="number" min="1" data-ef="maxHp" data-id="${e.id}" value="${e.maxHp}"></label>
            <label class="ustat"><span>启用半血混乱线</span>
              <select data-ef="hasStagger" data-id="${e.id}">
                <option value="1"${e.hasStagger ? " selected" : ""}>启用（首次≤混乱线眩晕）</option>
                <option value="0"${!e.hasStagger ? " selected" : ""}>不启用（适合纯破坏部位）</option>
              </select></label>
            ${e.hasStagger ? `<label class="ustat"><span>混乱线数值</span>
              <input type="number" min="1" data-ef="staggerLine" data-id="${e.id}" value="${e.staggerLine}"></label>` : ""}
            ${e.role === "boss_part" ? `<label class="ustat"><span>部位破坏联动</span>
              <select data-ef="breakStaggersBody" data-id="${e.id}">
                <option value="1"${e.breakStaggersBody ? " selected" : ""}>破坏时令 Boss 主躯干立即混乱！</option>
                <option value="0"${!e.breakStaggersBody ? " selected" : ""}>仅废除本部位意图</option>
              </select></label>` : ""}
          </div>

          <div style="margin-bottom:12px">
            <span style="font-size:12px;color:var(--muted)">弱点与耐性（点击胶囊循环切换：普通 → 弱点+2 → 耐性-2 → 免疫0）：</span>
            <div class="resist-chips">
              ${ALL_RESIST_KEYS.map(r => {
                const st = e.resists[r.k] || "normal";
                return `<span class="rchip ${st === "normal" ? "" : st}" data-res="${e.id}:${r.k}">${r.label}：${RESIST_LABEL[st]}</span>`;
              }).join("")}
            </div>
          </div>

          <div>
            <div class="sec-head" style="margin-bottom:6px">
              <span style="font-size:13px;color:var(--accent-2);font-weight:700">意图列表</span>
              <button class="btn ghost mini" data-addint="${e.id}">＋ 新增意图</button>
            </div>
            <div class="intent-list">
              ${e.intents.map(i => `
                <div class="intent-pill ${i.kind === "buff" ? "buff" : ""}" style="text-decoration:none;opacity:1">
                  <input type="text" data-if="name" data-eid="${e.id}" data-iid="${i.id}" value="${esc(i.name)}" placeholder="招式名" style="width:130px;padding:4px 7px">
                  <select data-if="cycle" data-eid="${e.id}" data-iid="${i.id}" style="width:auto;padding:4px 6px">
                    ${Object.entries(CYCLE_LABEL).map(([ck, cl]) => `<option value="${ck}"${i.cycle === ck ? " selected" : ""}>${cl}</option>`).join("")}
                  </select>
                  <select data-if="kind" data-eid="${e.id}" data-iid="${i.id}" style="width:auto;padding:4px 6px">
                    <option value="attack"${i.kind === "attack" ? " selected" : ""}>攻击意图</option>
                    <option value="buff"${i.kind === "buff" ? " selected" : ""}>蓄力/增益意图</option>
                  </select>
                  ${i.kind === "attack" ? `
                    <label style="font-size:12px;color:var(--muted)">威力 <input type="number" data-if="power" data-eid="${e.id}" data-iid="${i.id}" value="${i.power}" style="width:54px;padding:3px 5px;display:inline-block"></label>
                    <label style="font-size:12px;color:var(--muted)">伤害 <input type="number" data-if="dmg" data-eid="${e.id}" data-iid="${i.id}" value="${i.dmg}" style="width:54px;padding:3px 5px;display:inline-block"></label>
                    <label style="font-size:12px;color:var(--muted)">拼赢加压 <input type="number" min="0" max="3" data-if="winPressure" data-eid="${e.id}" data-iid="${i.id}" value="${i.winPressure || 0}" style="width:46px;padding:3px 5px;display:inline-block"></label>
                    <label style="font-size:12px;color:var(--danger);cursor:pointer"><input type="checkbox" data-if="unbreakable" data-eid="${e.id}" data-iid="${i.id}"${i.unbreakable ? " checked" : ""}>红光</label>
                  ` : `
                    <label style="font-size:12px;color:var(--ok)">未被吞除则下轮威力+ <input type="number" min="0" max="6" data-if="buffPowerNext" data-eid="${e.id}" data-iid="${i.id}" value="${i.buffPowerNext || 0}" style="width:48px;padding:3px 5px;display:inline-block"></label>
                  `}
                  <input type="text" data-if="note" data-eid="${e.id}" data-iid="${i.id}" value="${esc(i.note || "")}" placeholder="备注说明" style="flex:1;min-width:110px;padding:4px 7px">
                  <button class="btn ghost mini" data-delint="${e.id}:${i.id}">✕</button>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `).join("");
    }

    $("selTier").onchange = (ev) => { S.tier = ev.target.value; save(); render(); };
    $("inSlots").onchange = (ev) => { S.slots = Math.max(1, Math.min(10, +ev.target.value || 3)); save(); render(); };
    document.querySelectorAll("[data-gen]").forEach(b => b.onclick = () => addByTemplate(b.dataset.gen));
    document.querySelectorAll("[data-pre]").forEach(b => b.onclick = () => loadPreset(b.dataset.pre));

    $("foeList").querySelectorAll("[data-ef]").forEach(el => el.onchange = () => {
      const e = S.enemies.find(x => x.id === +el.dataset.id); if (!e) return;
      const f = el.dataset.ef;
      if (f === "name" || f === "role") {
        e[f] = el.value;
        if (f === "role" && e.role === "boss_part") { e.hasStagger = false; e.breakStaggersBody = true; }
      } else if (f === "maxHp") {
        e.maxHp = Math.max(1, Math.round(+el.value || 1));
        e.staggerLine = Math.floor(e.maxHp / 2);
      } else if (f === "staggerLine") {
        e.staggerLine = Math.max(1, Math.min(e.maxHp, Math.round(+el.value || 1)));
      } else if (f === "hasStagger" || f === "breakStaggersBody") {
        e[f] = el.value === "1";
        if (f === "hasStagger" && e.hasStagger && !e.staggerLine) e.staggerLine = Math.floor(e.maxHp / 2);
      }
      save(); render();
    });

    $("foeList").querySelectorAll("[data-res]").forEach(el => el.onclick = () => {
      const [eid, rk] = el.dataset.res.split(":");
      const e = S.enemies.find(x => x.id === +eid); if (!e) return;
      const cur = e.resists[rk] || "normal";
      const next = RESIST_Cycle[(RESIST_Cycle.indexOf(cur) + 1) % RESIST_Cycle.length];
      if (next === "normal") delete e.resists[rk]; else e.resists[rk] = next;
      save(); render();
    });

    $("foeList").querySelectorAll("[data-del]").forEach(el => el.onclick = () => {
      S.enemies = S.enemies.filter(x => x.id !== +el.dataset.del);
      save(); render();
    });
    $("foeList").querySelectorAll("[data-addint]").forEach(el => el.onclick = () => {
      const e = S.enemies.find(x => x.id === +el.dataset.addint); if (!e) return;
      const sc2 = GM_SCALE_TABLE[S.tier];
      e.intents.push(makeIntent("新意图", sc2.light[0], sc2.light[1]));
      save(); render();
    });
    $("foeList").querySelectorAll("[data-delint]").forEach(el => el.onclick = () => {
      const [eid, iid] = el.dataset.delint.split(":").map(Number);
      const e = S.enemies.find(x => x.id === eid); if (!e) return;
      e.intents = e.intents.filter(x => x.id !== iid);
      save(); render();
    });
    $("foeList").querySelectorAll("[data-if]").forEach(el => el.onchange = () => {
      const e = S.enemies.find(x => x.id === +el.dataset.eid);
      const i = e?.intents.find(x => x.id === +el.dataset.iid);
      if (!i) return;
      const f = el.dataset.if;
      if (f === "unbreakable") i.unbreakable = el.checked;
      else if (f === "name" || f === "cycle" || f === "kind" || f === "note") i[f] = el.value;
      else i[f] = Math.max(0, Math.round(+el.value || 0));
      save(); render();
    });
  }

  $("encTitle").oninput = (ev) => { S.title = ev.target.value; save(); };
  $("encReward").oninput = (ev) => { S.rewardNote = ev.target.value; save(); };

  $("btnExport").onclick = () => {
    if (!S.enemies.length) { toast("请先至少添加 1 个敌人"); return; }
    const obj = buildExportObj();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${S.title || "遭遇"}_LimbusTRPG_v2.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出遭遇 JSON，可直接导入战斗器！");
  };

  $("btnCopyEncounter").onclick = () => {
    if (!S.enemies.length) { toast("当前没有敌人可复制"); return; }
    const txt = buildEncounterText();
    navigator.clipboard?.writeText(txt).then(() => toast("已复制群聊遭遇图鉴！")).catch(() => toast("复制失败"));
  };

  $("btnImport").onclick = () => $("fileInput").click();
  $("fileInput").onchange = (ev) => {
    const f = ev.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.enemies)) throw new Error("不是 2.0 遭遇 JSON");
        S.title = d.title || "导入遭遇";
        S.tier = d.tier || "ZAYIN";
        S.rewardNote = d.rewardNote || "";
        S.enemies = d.enemies.map(e => ({
          ...e, id: uid(),
          resists: { ...(e.resists || {}) },
          intents: (e.intents || []).map(i => ({ ...i, id: uid() }))
        }));
        save(); render();
        toast("已导入遭遇配置");
      } catch (err) { toast("导入失败：" + err.message); }
    };
    r.readAsText(f);
    ev.target.value = "";
  };

  $("btnClear").onclick = () => {
    if (!confirm("清空当前所有敌人？")) return;
    S.enemies = []; save(); render(); toast("已清空");
  };

  load();
  if (!S.enemies.length) loadPreset("redshoes"); else render();
})();
