/* ============ Limbus Company TRPG 2.0 · 群聊场控与自动战斗器 ============
   共用 建卡器.js 中的权威规则表（SIN_ORDER / SIN_LABELS / SIN_RESONANCE / PHYS_MODES / PRESET_ENCOUNTERS）。
   既可作为跑团群 GM 的回合面板与战报生成器（支持录入群友骰娘点数），也可一键全自动代投结算。 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const d6 = () => 1 + Math.floor(Math.random() * 6);
  let seq = 1;
  const uid = () => ++seq;

  const RESIST_KEY_LABELS = {
    slash: "斩击", strike: "打击", pierce: "突刺",
    ...SIN_LABELS
  };
  const ROLE_TAG = { mob: "杂兵", elite: "精英", boss_body: "主躯干", boss_part: "可破坏部位" };

  const S = {
    round: 1,
    roundResolved: false,
    encounterTitle: "",
    sinPool: Object.fromEntries(SIN_ORDER.map(k => [k, 0])),
    players: [],
    enemies: [],
    wires: [],
    log: [],
    openUnits: new Set()
  };

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._tm); toast._tm = setTimeout(() => t.classList.remove("show"), 2000);
  }

  function copyText(txt, okMsg) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(txt).then(() => toast(okMsg)).catch(() => fallbackCopy(txt, okMsg));
    } else fallbackCopy(txt, okMsg);
  }
  function fallbackCopy(txt, okMsg) {
    const ta = document.createElement("textarea");
    ta.value = txt; document.body.appendChild(ta);
    ta.select(); document.execCommand("copy");
    document.body.removeChild(ta);
    toast(okMsg);
  }

  /* ---------- 状态辅助 ---------- */
  const isDown = (u) => u.hp <= 0;
  const isStaggered = (u) => !isDown(u) && (u.staggeredUntilRound || 0) >= S.round;
  const livePlayers = () => S.players.filter(p => !isDown(p));
  const liveEnemies = () => S.enemies.filter(e => !isDown(e));
  const totalPoolCount = () => Object.values(S.sinPool).reduce((a, b) => a + b, 0);

  /* ---------- 角色与敌人构造 ---------- */
  function playerFromV2Json(d) {
    if (!d || d.version !== 2 || !Array.isArray(d.skills)) {
      throw new Error("请导入 2.0 版建卡器生成的角色 JSON");
    }
    const gifts = d.gear?.gifts || [];
    const hasAmpoule = gifts.some(g => g.stats?.kAmpoule);
    const hasCalm = gifts.some(g => g.stats?.firstEgoCalm);
    const p = {
      id: uid(),
      name: d.name || "无名罪人",
      title: d.title || "",
      tier: d.tier || "ZAYIN",
      uptie: d.uptie || 1,
      attrs: { ...d.attrs },
      maxHp: d.derived.maxHp,
      hp: d.derived.maxHp,
      shield: 0,
      staggerLine: d.derived.staggerLine,
      staggerTriggered: false,
      staggeredUntilRound: 0,
      pressure: 0,
      pressureCap: d.derived.pressureCap,
      breakdownPending: null, // "panic" | "corrosion" | null
      slots: d.derived.slots || 1,
      spectrum: { ...d.spectrum },
      skills: d.skills.map(s => ({ ...s })),
      cds: { s2: 0, s3: 0 },
      usedThisRound: new Set(),
      defense: { ...d.defense },
      passive: d.passive ? { ...d.passive } : null,
      egos: (d.egos || []).map(e => ({ ...e, cost: { ...e.cost } })),
      gear: d.gear || { weapon: { id: "wp_none", name: "无", stats: {} }, gifts: [] },
      kAmpouleLeft: hasAmpoule ? 1 : 0,
      firstEgoCalmLeft: hasCalm ? 1 : 0,
      roundPowerBonus: 0,
      roundDmgBonus: 0,
      hurtBonusDmg: 0,
      evadeKeep: 0,
      wonClashThisRound: false
    };
    return p;
  }

  function applyBattleStartPassives(p) {
    const lines = [];
    if (p.passive?.stats?.battleStartSin) {
      const sk = p.spectrum.core;
      S.sinPool[sk] += p.passive.stats.battleStartSin;
      lines.push(`${p.name} 的被动【${p.passive.label}】：公共罪孽池 +${p.passive.stats.battleStartSin} ${SIN_LABELS[sk]}`);
    }
    for (const gf of p.gear?.gifts || []) {
      if (gf.stats?.startSecSin) {
        const sk = p.spectrum.sec;
        S.sinPool[sk] += gf.stats.startSecSin;
        lines.push(`${p.name} 的饰品【${gf.name}】：公共罪孽池 +${gf.stats.startSecSin} ${SIN_LABELS[sk]}`);
      }
    }
    if (p.passive?.stats?.roundStartShield) {
      p.shield += p.passive.stats.roundStartShield;
      lines.push(`${p.name} 的被动【${p.passive.label}】：获得 ${p.passive.stats.roundStartShield} 点护盾`);
    }
    return lines;
  }

  function enemyFromDef(def) {
    const e = {
      id: uid(),
      name: def.name || "敌人",
      role: def.role || "mob",
      maxHp: Math.max(1, def.maxHp || 16),
      hp: Math.max(1, def.hp ?? def.maxHp ?? 16),
      shield: 0,
      hasStagger: def.hasStagger !== false,
      staggerLine: def.hasStagger !== false ? (def.staggerLine || Math.floor((def.maxHp || 16) / 2)) : 0,
      staggerTriggered: false,
      staggeredUntilRound: 0,
      breakStaggersBody: !!def.breakStaggersBody,
      resists: { ...(def.resists || {}) },
      intentTemplates: (def.intents || []).map(i => ({ ...i, id: uid() })),
      activeIntents: [],
      roundPowerDown: 0,
      gloomResDown: 0,
      roundVuln: 0,
      roundDmgDealtDown: 0,
      roundNoHeal: false,
      nextRoundPowerBonus: 0
    };
    refreshEnemyIntents(e);
    return e;
  }

  function refreshEnemyIntents(e) {
    if (isDown(e) || isStaggered(e)) {
      e.activeIntents = [];
      return;
    }
    const isOdd = S.round % 2 === 1;
    const carry = e.nextRoundPowerBonus || 0;
    e.nextRoundPowerBonus = 0;
    const matched = e.intentTemplates.filter(t =>
      t.cycle === "all" || (isOdd && t.cycle === "odd") || (!isOdd && t.cycle === "even")
    );
    e.activeIntents = matched.map(t => ({
      ...t,
      id: uid(),
      basePower: (t.power || 0) + (t.kind === "attack" ? carry : 0),
      resolved: false,
      cancelled: false,
      targetPlayerId: null
    }));
  }

  function effIntentPower(e, intent) {
    if (intent.kind !== "attack") return 0;
    const down = (e.roundPowerDown || 0) + (e.gloomResDown || 0);
    return Math.max(1, intent.basePower - down);
  }
  function effIntentDmg(e, intent) {
    return Math.max(1, (intent.dmg || 0) - (e.roundDmgDealtDown || 0));
  }

  /* ---------- 排线列表生成与校验 ---------- */
  function buildDefaultWires() {
    S.wires = [];
    for (const p of S.players) {
      if (isDown(p) || isStaggered(p)) continue;
      if (p.breakdownPending) {
        S.wires.push({
          id: uid(), playerId: p.id, slotIdx: 0,
          actionKey: p.breakdownPending, // "panic" | "corrosion"
          targetKey: "auto", allyId: null, manualRoll: ""
        });
        continue;
      }
      for (let s = 0; s < p.slots; s++) {
        const defTarget = pickAutoTargetForWire(S.wires);
        S.wires.push({
          id: uid(), playerId: p.id, slotIdx: s,
          actionKey: "s1",
          targetKey: defTarget,
          allyId: p.id,
          manualRoll: ""
        });
      }
    }
    reconcileWires();
  }

  function allOpenAttackIntents() {
    const list = [];
    for (const e of liveEnemies()) {
      if (isStaggered(e)) continue;
      for (const i of e.activeIntents) {
        if (i.kind === "attack" && !i.resolved) list.push({ e, i, key: `intent:${e.id}:${i.id}` });
      }
    }
    return list;
  }

  function pickAutoTargetForWire(existingWires) {
    const taken = new Set(existingWires.map(w => w.targetKey));
    const open = allOpenAttackIntents().find(x => !taken.has(x.key));
    if (open) return open.key;
    const firstFoe = liveEnemies()[0];
    return firstFoe ? `sneak:${firstFoe.id}` : "none";
  }

  function actionMeta(p, actionKey) {
    if (actionKey === "panic") return { kind: "panic", label: "【恐慌停动】", sin: null, needsTarget: false };
    if (actionKey === "corrosion") return { kind: "corrosion", label: "【E.G.O 侵蚀暴走】", sin: null, needsTarget: false };
    if (actionKey === "def") {
      return {
        kind: "def", label: `守备【${p.defense.label}】`,
        sin: p.defense.sin || null, genSin: p.defense.sin || null,
        defObj: p.defense, needsAlly: false
      };
    }
    if (actionKey.startsWith("ego:")) {
      const eg = p.egos[+actionKey.split(":")[1]] || p.egos[0];
      return {
        kind: "ego", label: `${eg.rank} E.G.O【${eg.name}】`,
        sin: eg.sin, genSin: null, egoObj: eg,
        supportOnly: !!eg.stats?.supportOnly, needsAlly: false
      };
    }
    const idx = actionKey === "s3" ? 2 : actionKey === "s2" ? 1 : 0;
    const sk = p.skills[idx];
    const needsAlly = sk.traits.some(t => t.stats?.allyBuff);
    return {
      kind: "skill", slotKey: sk.slot, label: `${sk.slotLabel}【${sk.name}】`,
      sin: sk.sin, genSin: sk.sin, skillObj: sk, needsAlly
    };
  }

  function reconcileWires() {
    // 清理已阵亡或混乱的角色排线
    S.wires = S.wires.filter(w => {
      const p = S.players.find(x => x.id === w.playerId);
      return p && !isDown(p) && !isStaggered(p);
    });
    const usedIntentKeys = new Set();
    const playerUsedActions = new Map(); // playerId -> Set of restricted keys (s2, s3, ego)

    for (const w of S.wires) {
      const p = S.players.find(x => x.id === w.playerId);
      if (p.breakdownPending) { w.actionKey = p.breakdownPending; w.targetKey = "auto"; continue; }
      if (w.actionKey === "panic" || w.actionKey === "corrosion") w.actionKey = "s1";

      // 冷却与同回合双槽防重校验
      const pSet = playerUsedActions.get(p.id) || new Set();
      playerUsedActions.set(p.id, pSet);
      if (w.actionKey === "s2" && (p.cds.s2 > 0 || pSet.has("s2"))) w.actionKey = "s1";
      if (w.actionKey === "s3" && (p.cds.s3 > 0 || pSet.has("s3"))) w.actionKey = "s1";
      if (w.actionKey.startsWith("ego:") && pSet.has("ego")) w.actionKey = "s1";
      if (w.actionKey === "s2" || w.actionKey === "s3") pSet.add(w.actionKey);
      if (w.actionKey.startsWith("ego:")) pSet.add("ego");

      const meta = actionMeta(p, w.actionKey);
      if (meta.supportOnly) { w.targetKey = "support"; continue; }

      // 目标校验（避免两人撞同一条敌方意图）
      const openIntents = allOpenAttackIntents();
      const foes = liveEnemies();
      if (!foes.length) { w.targetKey = "none"; continue; }

      if (w.targetKey?.startsWith("intent:")) {
        const valid = openIntents.some(x => x.key === w.targetKey) && !usedIntentKeys.has(w.targetKey);
        if (valid) {
          usedIntentKeys.add(w.targetKey);
        } else {
          const free = openIntents.find(x => !usedIntentKeys.has(x.key));
          if (free) { w.targetKey = free.key; usedIntentKeys.add(free.key); }
          else w.targetKey = meta.kind === "def" ? (p.defense.type === "block" ? "self_shield" : "none") : `sneak:${foes[0].id}`;
        }
      } else if (w.targetKey?.startsWith("sneak:")) {
        if (meta.kind === "def") {
          const free = openIntents.find(x => !usedIntentKeys.has(x.key));
          if (free) { w.targetKey = free.key; usedIntentKeys.add(free.key); }
          else w.targetKey = p.defense.type === "block" ? "self_shield" : "none";
        } else {
          const eid = +w.targetKey.split(":")[1];
          if (!foes.some(f => f.id === eid)) w.targetKey = `sneak:${foes[0].id}`;
        }
      } else if (w.targetKey === "self_shield") {
        if (meta.kind !== "def" || p.defense.type !== "block") {
          w.targetKey = pickAutoTargetForWire(S.wires.filter(x => x !== w));
          if (w.targetKey.startsWith("intent:")) usedIntentKeys.add(w.targetKey);
        }
      } else {
        const nextT = pickAutoTargetForWire([...usedIntentKeys].map(k => ({ targetKey: k })));
        w.targetKey = meta.kind === "def" && nextT.startsWith("sneak:")
          ? (p.defense.type === "block" ? "self_shield" : "none")
          : nextT;
        if (w.targetKey.startsWith("intent:")) usedIntentKeys.add(w.targetKey);
      }

      if (!livePlayers().some(a => a.id === w.allyId)) {
        const other = livePlayers().find(a => a.id !== p.id) || p;
        w.allyId = other.id;
      }
    }
  }

  /* 统计当前排线将触发的罪孽产出与共鸣 */
  function previewResonance() {
    const sinCounts = Object.fromEntries(SIN_ORDER.map(k => [k, 0]));
    const sinGen = Object.fromEntries(SIN_ORDER.map(k => [k, 0]));
    const egoSpend = Object.fromEntries(SIN_ORDER.map(k => [k, 0]));

    for (const w of S.wires) {
      const p = S.players.find(x => x.id === w.playerId);
      if (!p) continue;
      const m = actionMeta(p, w.actionKey);
      if (m.sin) sinCounts[m.sin]++;
      if (m.genSin) sinGen[m.genSin]++;
      if (m.kind === "ego" && m.egoObj?.cost) {
        for (const [k, v] of Object.entries(m.egoObj.cost)) egoSpend[k] = (egoSpend[k] || 0) + v;
      }
    }
    const activeRes = SIN_ORDER.filter(k => sinCounts[k] >= 2).map(k => ({
      sin: k, count: sinCounts[k], full: sinCounts[k] >= 3,
      info: SIN_RESONANCE[k]
    }));
    // 检查碎片是否够支付本轮所有 E.G.O（本轮普通技能入账后再扣 E.G.O，与第 3.2 步一致）
    const deficit = SIN_ORDER.filter(k => (S.sinPool[k] + sinGen[k]) < egoSpend[k])
      .map(k => `${SIN_LABELS[k]}缺${egoSpend[k] - (S.sinPool[k] + sinGen[k])}`);

    return { sinCounts, sinGen, egoSpend, activeRes, deficit };
  }

  /* ---------- 伤害、治疗、混乱与部位破坏核心函数 ---------- */
  function healPlayer(p, amount, noteLines) {
    if (amount <= 0 || isDown(p)) return 0;
    const bonus = p.passive?.stats?.healPlus || 0;
    const total = amount + bonus;
    const before = p.hp;
    p.hp = clamp(p.hp + total, 0, p.maxHp);
    const got = p.hp - before;
    if (got > 0 && noteLines) noteLines.push(`  ↳ ${p.name} 恢复 ${got} HP（${p.hp}/${p.maxHp}）`);
    return got;
  }

  function addPressure(p, delta, lines) {
    if (!delta || isDown(p)) return;
    p.pressure = clamp(p.pressure + delta, 0, p.pressureCap);
    if (delta > 0) {
      lines.push(`  ↳ ${p.name} 罪孽压力 +${delta}（${p.pressure}/${p.pressureCap}）`);
      if (p.pressure >= p.pressureCap && !p.breakdownPending) {
        const hasHighEgo = p.egos.some(e => e.rank !== "ZAYIN");
        p.breakdownPending = hasHighEgo ? "corrosion" : "panic";
        lines.push(`  ⚠ ${p.name} 压力已满！下回合将强制触发${hasHighEgo ? "【E.G.O 侵蚀】" : "【恐慌失控】"}！`);
      }
    } else {
      lines.push(`  ↳ ${p.name} 罪孽压力 ${delta}（${p.pressure}/${p.pressureCap}）`);
      if (p.pressure < p.pressureCap) p.breakdownPending = null;
    }
  }

  function hurtPlayer(p, rawDmg, lines, canTriggerStagger = true) {
    const dmg = Math.max(0, rawDmg);
    const abs = Math.min(p.shield || 0, dmg);
    p.shield = (p.shield || 0) - abs;
    const hpLoss = dmg - abs;
    p.hp = clamp(p.hp - hpLoss, 0, p.maxHp);
    lines.push(`  ↳ ${p.name} 承受 ${dmg} 点伤害${abs ? `（护盾抵消 ${abs}）` : ""}，剩余 HP ${p.hp}/${p.maxHp}`);
    if (hpLoss > 0 && p.hp > 0 && p.passive?.stats?.hurtDmg) {
      p.hurtBonusDmg = p.passive.stats.hurtDmg;
    }
    if (p.hp <= 0) {
      p.staggeredUntilRound = 0;
      p.breakdownPending = null;
      lines.push(`  ☠ ${p.name} 生命归零，重伤倒地退场！`);
      // 其余存活队友目睹倒地压力+1
      for (const ally of livePlayers()) {
        if (ally.id !== p.id) addPressure(ally, 1, lines);
      }
      return;
    }
    if (canTriggerStagger && !p.staggerTriggered && p.hp <= p.staggerLine) {
      if (p.kAmpouleLeft > 0) {
        p.kAmpouleLeft = 0;
        p.hp = clamp(p.hp + 10, 0, p.maxHp);
        const ampName = (p.gear?.gifts || []).find(g => g.stats?.kAmpoule)?.name || "应急再生注射剂";
        lines.push(`  💉 ${p.name} 自动触发【${ampName}】！立即恢复 10 HP（${p.hp}/${p.maxHp}）并免除本次混乱！`);
      } else {
        p.staggerTriggered = true;
        p.staggeredUntilRound = S.round + 1;
        lines.push(`  ⚡ ${p.name} 跌破混乱线（${p.staggerLine}），陷入【混乱】直到下回合结束！`);
      }
    }
  }

  function calcWeakMod(foe, mode, sin, ignoreResist) {
    if (foe.resists[mode] === "immune" || (sin && foe.resists[sin] === "immune")) {
      return { immune: true, mod: 0, tags: ["免疫(0)"] };
    }
    let mod = 0;
    const tags = [];
    const staggered = isStaggered(foe);
    for (const [k, lb] of [[mode, PHYS_MODES[mode]?.label], [sin, SIN_LABELS[sin]]]) {
      if (!k) continue;
      const r = foe.resists[k];
      if (r === "weak") { mod += 2; tags.push(`${lb}弱点+2`); }
      else if (r === "endure" && !ignoreResist && !staggered) { mod -= 2; tags.push(`${lb}耐性-2`); }
    }
    if (staggered) { mod += 3; tags.push("混乱易伤+3"); }
    if (foe.roundVuln) { mod += foe.roundVuln; tags.push(`本轮易伤+${foe.roundVuln}`); }
    return { immune: false, mod, tags };
  }

  function damageEnemy(foe, rawAmount, opts, lines, actor) {
    if (!foe || isDown(foe)) return { dealt: 0, killed: false, staggeredNow: false };
    const { mode = null, sin = null, ignoreResist = false, ignoreShield = false, trueDmg = false, staggerBoost = 0 } = opts || {};
    let finalDmg = 0;
    let tagNote = "";
    if (trueDmg) {
      finalDmg = Math.max(1, rawAmount + (isStaggered(foe) ? 3 : 0) + (foe.roundVuln || 0));
      tagNote = "无视耐性直伤";
    } else {
      const w = calcWeakMod(foe, mode, sin, ignoreResist);
      if (w.immune) {
        lines.push(`  ↳ ${foe.name} 对该属性免疫，受到 0 点伤害`);
        return { dealt: 0, killed: false, staggeredNow: false };
      }
      finalDmg = Math.max(1, rawAmount + w.mod);
      tagNote = w.tags.join("，");
    }

    let abs = 0;
    if (!ignoreShield && foe.shield > 0) {
      abs = Math.min(foe.shield, finalDmg);
      foe.shield -= abs;
    }
    const hpLoss = finalDmg - abs;
    foe.hp = clamp(foe.hp - hpLoss, 0, foe.maxHp);
    lines.push(`  ↳ ${foe.name} 受到 ${finalDmg} 点伤害${tagNote ? `（${tagNote}）` : ""}${abs ? `（护盾抵消 ${abs}）` : ""}，剩余 HP ${foe.hp}/${foe.maxHp}`);

    let killed = false, staggeredNow = false;
    if (foe.hp <= 0) {
      killed = true;
      foe.activeIntents.forEach(i => { i.resolved = true; i.cancelled = true; });
      if (foe.role === "boss_part") {
        lines.push(`  💥 部位破坏！【${foe.name}】被彻底击毁，其所属意图全部废除！`);
        if (foe.breakStaggersBody) {
          for (const body of liveEnemies().filter(x => x.role === "boss_body")) {
            body.staggeredUntilRound = S.round + 1;
            body.activeIntents.forEach(i => { if (!i.resolved) { i.resolved = true; i.cancelled = true; } });
            lines.push(`  ⚡ 联动重创：【${body.name}】因关键部位损毁当场陷入【混乱】，本轮未结算意图全部打断！`);
          }
        }
      } else {
        lines.push(`  ★ 【${foe.name}】被击倒！`);
      }
      if (actor) addPressure(actor, -1, lines);
    } else if (foe.hasStagger && !foe.staggerTriggered && !isStaggered(foe) && foe.hp <= (foe.staggerLine + staggerBoost)) {
      foe.staggerTriggered = true;
      foe.staggeredUntilRound = S.round + 1;
      staggeredNow = true;
      let interrupted = 0;
      foe.activeIntents.forEach(i => { if (!i.resolved) { i.resolved = true; i.cancelled = true; interrupted++; } });
      lines.push(`  ⚡ 【${foe.name}】跌破混乱线（${foe.staggerLine}${staggerBoost ? `+震击${staggerBoost}` : ""}），陷入【混乱】！${interrupted ? `当场打断 ${interrupted} 条未结算意图！` : ""}`);
    }
    return { dealt: finalDmg, killed, staggeredNow };
  }

  /* ---------- 结算整轮战斗 ---------- */
  function resolveCombatRound() {
    if (S.roundResolved) { toast("本回合已经结算完毕，请点「下一回合」"); return; }
    reconcileWires();
    const res = previewResonance();
    if (res.deficit.length) {
      toast(`公共罪孽池碎片不足以支付 E.G.O（${res.deficit.join("、")}），请调整排线或手加碎片`);
      return;
    }

    const roundLog = [];
    // 1. 罪孽碎片入池 & 共鸣生效
    const gainedTxt = [];
    for (const k of SIN_ORDER) {
      if (res.sinGen[k] > 0) {
        S.sinPool[k] += res.sinGen[k];
        gainedTxt.push(`${SIN_LABELS[k]}+${res.sinGen[k]}`);
      }
    }
    if (gainedTxt.length) roundLog.push(`【罪孽入池】${gainedTxt.join("，")}`);

    const resMap = new Map(); // sin -> stats
    for (const r of res.activeRes) {
      const st = r.full ? r.info.fullStats : r.info.stats;
      resMap.set(r.sin, st);
      roundLog.push(`★ 触发【${SIN_LABELS[r.sin]}${r.full ? "完全共鸣" : "共鸣"}】(${r.count}同色)：${r.full ? r.info.full : r.info.base}`);
      if (st.extraSin) {
        S.sinPool[r.sin] += st.extraSin;
        roundLog.push(`  ↳ 暴食共鸣额外产出 ${st.extraSin} 颗暴食碎片`);
      }
      if (r.sin === "lust") {
        for (const p of livePlayers()) {
          if (p.passive?.stats?.resCalm) addPressure(p, -1, roundLog);
        }
      }
    }

    // 忧郁共鸣：对本轮被忧郁技能指向的目标立即施加意图威力压制（同目标不叠加，取最高）
    if (resMap.has("gloom")) {
      const gDown = resMap.get("gloom").foePowerDown || 1;
      for (const w of S.wires) {
        const p = S.players.find(x => x.id === w.playerId);
        const m = p ? actionMeta(p, w.actionKey) : null;
        if (m?.sin === "gloom") {
          const foe = targetEnemyOfWire(w);
          if (foe) foe.gloomResDown = Math.max(foe.gloomResDown || 0, gDown);
        }
      }
    }

    // 2. 按排线顺序逐条执行玩家动作
    let teamCritUncap = false;
    S.wires.forEach((w, orderIdx) => {
      const p = S.players.find(x => x.id === w.playerId);
      if (!p || isDown(p) || isStaggered(p)) return;
      if (!liveEnemies().length) return;

      const meta = actionMeta(p, w.actionKey);

      // 2a. 恐慌或 E.G.O 侵蚀
      if (meta.kind === "panic") {
        roundLog.push(`【#${orderIdx + 1} ${p.name} · 恐慌失控】心智崩溃，本回合无法行动，回合末压力归零`);
        p.pressure = 0; p.breakdownPending = null;
        return;
      }
      if (meta.kind === "corrosion") {
        const hiEgo = p.egos[p.egos.length - 1];
        const tgtRoll = d6();
        const hitAlly = tgtRoll % 2 === 0 && livePlayers().length > 1;
        roundLog.push(`【#${orderIdx + 1} ${p.name} · E.G.O 侵蚀暴走！】强制无消耗释放【${hiEgo.name}】(敌我判定 1D6=${tgtRoll} → ${hitAlly ? "偶数轰队友！" : "奇数轰敌方！"})`);
        if (hitAlly) {
          const others = livePlayers().filter(a => a.id !== p.id);
          const victim = others[Math.floor(Math.random() * others.length)];
          hurtPlayer(victim, (hiEgo.baseDmg || 10) + 3, roundLog);
        } else {
          const foe = liveEnemies()[0];
          damageEnemy(foe, (hiEgo.baseDmg || 10) + 3, { mode: hiEgo.mode, sin: hiEgo.sin }, roundLog, p);
        }
        p.pressure = 0; p.breakdownPending = null;
        return;
      }

      // 共鸣即时个人收益（怠惰加盾、色欲回血）
      const rStat = meta.sin ? resMap.get(meta.sin) : null;
      if (rStat?.shield) {
        p.shield += rStat.shield;
        roundLog.push(`【#${orderIdx + 1} 共鸣】${p.name} 因怠惰共鸣获得 ${rStat.shield} 点护盾`);
      }
      if (rStat?.lustHeal) {
        const lowAlly = livePlayers().slice().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || p;
        healPlayer(lowAlly, rStat.lustHeal, roundLog);
      }

      // 2b. 守备动作
      if (meta.kind === "def") {
        resolveDefenseWire(w, orderIdx, p, roundLog);
        return;
      }

      // 2c. 扣除 E.G.O 碎片消耗与压力消耗
      let traits = [];
      let baseDmg = 0, clashBonus = 0, mode = "slash", sin = meta.sin, titleName = meta.label;
      if (meta.kind === "ego") {
        const eg = meta.egoObj;
        for (const [ck, cv] of Object.entries(eg.cost)) S.sinPool[ck] = Math.max(0, S.sinPool[ck] - cv);
        let pCost = eg.pressureCost || 0;
        if (pCost > 0 && p.firstEgoCalmLeft > 0) { p.firstEgoCalmLeft = 0; pCost = Math.max(0, pCost - 1); }
        if (p.passive?.stats?.spendSinShield) p.shield += p.passive.stats.spendSinShield;
        roundLog.push(`【#${orderIdx + 1} ${p.name} 显现 ${eg.rank} E.G.O「${eg.name}」】(消耗 ${ Object.entries(eg.cost).map(([k,v])=>SIN_LABELS[k]+"×"+v).join("+") })`);
        if (pCost > 0) addPressure(p, pCost, roundLog);
        if (eg.stats?.supportOnly) {
          if (eg.stats.teamShield) livePlayers().forEach(a => { a.shield += eg.stats.teamShield; });
          if (eg.stats.teamHeal) livePlayers().forEach(a => healPlayer(a, eg.stats.teamHeal, roundLog));
          if (eg.stats.teamPressureDown) livePlayers().forEach(a => addPressure(a, -eg.stats.teamPressureDown, roundLog));
          return;
        }
        traits = [{ label: eg.name, stats: eg.stats || {} }];
        baseDmg = eg.baseDmg; clashBonus = eg.clashBonus; mode = eg.mode;
      } else {
        const sk = meta.skillObj;
        p.usedThisRound.add(sk.slot);
        traits = sk.traits || [];
        baseDmg = sk.baseDmg; clashBonus = sk.clashBonus; mode = sk.mode;
      }

      // 定位目标与意图（若原定意图已因前位队友打进混乱/击杀而消失，自动转单方面偷袭存活敌人）
      let { foe, intent } = resolveWireTargetLive(w);
      if (!foe) return;
      const isClashing = !!intent;

      // 汇总打出即生效词条 & 投骰前修正
      let extraPwr = (p.roundPowerBonus || 0) + (rStat?.power || 0);
      let extraDmg = (p.roundDmgBonus || 0) + (p.hurtBonusDmg || 0) + (rStat?.dmg || 0);
      p.roundPowerBonus = 0; p.hurtBonusDmg = 0;
      if (p.passive?.stats?.lowHpDmg && p.hp <= p.staggerLine) extraDmg += p.passive.stats.lowHpDmg;
      if (isClashing && p.passive?.stats?.higherHpDmg && foe.hp > p.hp) extraDmg += p.passive.stats.higherHpDmg;

      let foePwrCut = 0, fixedRoll = null, marginCap = teamCritUncap ? 6 : 3, minMargin = 0, doubleMargin = false, unlimitMargin = false;
      let ignoreResist = false, ignoreShield = false, staggerBoost = 0;

      for (const t of traits) {
        const st = t.stats || {};
        if (!traitCondMet(st.cond, { p, foe, isClashing, orderIdx })) continue;

        if (st.selfHpCost) {
          if (p.hp > st.selfHpCost) {
            p.hp -= st.selfHpCost;
            roundLog.push(`  ▸ 【${t.label}】${p.name} 自损 ${st.selfHpCost} HP（${p.hp}/${p.maxHp}）换取爆发`);
          } else continue;
        }
        if (st.selfPressureCost) {
          if (p.pressure + st.selfPressureCost < p.pressureCap) {
            addPressure(p, st.selfPressureCost, roundLog);
          } else continue;
        }
        if (st.spendPool) {
          let spent = 0;
          const order = SIN_ORDER.slice().sort((a, b) => (a === p.spectrum.core ? 1 : -1) - (b === p.spectrum.core ? 1 : -1));
          for (const sk of order) {
            while (spent < st.spendPool.max && S.sinPool[sk] > 0) {
              S.sinPool[sk]--; spent++;
            }
          }
          if (spent > 0) {
            extraPwr += spent * (st.spendPool.perPower || 0);
            extraDmg += spent * (st.spendPool.perDmg || 0);
            if (st.spendPool.perHeal) healPlayer(p, spent * st.spendPool.perHeal, roundLog);
            if (p.passive?.stats?.spendSinShield) p.shield += p.passive.stats.spendSinShield;
            roundLog.push(`  ▸ 【${t.label}】消耗 ${spent} 颗罪孽碎片强化本次行动`);
          }
        }
        if (st.useBestAttr) {
          const best = Math.max(...Object.values(p.attrs));
          const curAttr = p.attrs[PHYS_MODES[mode]?.attr] || 1;
          extraPwr += Math.max(0, best - curAttr);
        }
        if (st.selfShield) { p.shield += st.selfShield; roundLog.push(`  ▸ 【${t.label}】${p.name} 获得 ${st.selfShield} 点护盾`); }
        if (st.teamShield) { livePlayers().forEach(a => { a.shield += st.teamShield; }); roundLog.push(`  ▸ 【${t.label}】全队获得 ${st.teamShield} 点护盾`); }
        if (st.selfHealStart) healPlayer(p, st.selfHealStart, roundLog);
        if (st.selfPressureDelta && !st.teamHeal) addPressure(p, st.selfPressureDelta, roundLog);
        if (st.foeDmgDealtDown) foe.roundDmgDealtDown = (foe.roundDmgDealtDown || 0) + st.foeDmgDealtDown;
        if (st.allFoePowerDown) liveEnemies().forEach(e => { e.roundPowerDown = (e.roundPowerDown || 0) + st.allFoePowerDown; });
        if (st.gainSameSin) S.sinPool[sin] += st.gainSameSin;
        if (st.gainCoreSin) S.sinPool[p.spectrum.core] += st.gainCoreSin;
        if (st.allyBuff) {
          const ally = livePlayers().find(a => a.id === +w.allyId) || p;
          if (st.allyBuff.shield) ally.shield += st.allyBuff.shield;
          if (st.allyBuff.power) ally.roundPowerBonus = (ally.roundPowerBonus || 0) + st.allyBuff.power;
          if (st.allyBuff.dmg) ally.roundDmgBonus = (ally.roundDmgBonus || 0) + st.allyBuff.dmg;
          roundLog.push(`  ▸ 【${t.label}】支援 ${ally.name}`);
        }
        if (st.stripAll) {
          foe.shield = 0;
          foe.activeIntents.filter(i => i.kind === "buff" && !i.resolved).forEach(i => { i.resolved = true; i.cancelled = true; });
        }
        if (st.eatBuffOrShield) {
          const bf = foe.activeIntents.find(i => i.kind === "buff" && !i.resolved);
          if (bf || foe.shield > 0) {
            if (bf) { bf.resolved = true; bf.cancelled = true; }
            foe.shield = 0;
            roundLog.push(`  ▸ 【${t.label}】吞除 ${foe.name} 的增益/护盾！`);
            healPlayer(p, st.eatBuffOrShield.heal, roundLog);
          } else {
            extraDmg += st.eatBuffOrShield.altDmg || 0;
          }
        }

        extraPwr += st.power || 0;
        extraDmg += st.dmg || 0;
        if (st.staggerExtraDmg && isStaggered(foe)) extraDmg += st.staggerExtraDmg;
        if (st.dmgFromShield) extraDmg += Math.min(st.dmgFromShield, p.shield || 0);
        foePwrCut += st.foePowerDown || 0;
        if (st.fixedRoll != null) fixedRoll = st.fixedRoll;
        if (st.marginCap) marginCap = Math.max(marginCap, st.marginCap);
        if (st.minMargin) minMargin = Math.max(minMargin, st.minMargin);
        if (st.doubleMargin) doubleMargin = true;
        if (st.unlimitMargin) unlimitMargin = true;
        if (st.ignoreResist) ignoreResist = true;
        if (st.ignoreShield) ignoreShield = true;
        staggerBoost += st.staggerLineBoost || 0;
      }

      // 执行拼点或单方面偷袭
      let hit = false, wonClash = false, margin = 0, myTotal = 0;
      if (isClashing) {
        const mRoll = +w.manualRoll;
        const die = fixedRoll != null ? fixedRoll : (mRoll >= 1 && mRoll <= 6 ? mRoll : d6());
        myTotal = die + clashBonus + extraPwr;
        const foeVal = Math.max(1, effIntentPower(foe, intent) - foePwrCut);
        intent.resolved = true;

        if (myTotal > foeVal) {
          hit = true; wonClash = true;
          margin = Math.max(minMargin, myTotal - foeVal);
          const effM = unlimitMargin ? margin : Math.min(margin, marginCap);
          const marginAdd = doubleMargin ? effM * 2 : effM;
          let firstWinAdd = 0;
          if (!p.wonClashThisRound && p.passive?.stats?.firstWinDmg) {
            p.wonClashThisRound = true; firstWinAdd = p.passive.stats.firstWinDmg;
          }
          const giftMarginAdd = (margin >= 2 && (p.gear?.gifts || []).some(g => g.stats?.margin2BonusDmg)) ? 2 : 0;
          extraDmg += marginAdd + firstWinAdd + giftMarginAdd;
          roundLog.push(`【#${orderIdx + 1} ${p.name}】${titleName} 拉线拼点【${foe.name}·${intent.name}】：` +
            `${fixedRoll != null ? `固定骰${die}` : `1D6(${die})`}+${clashBonus + extraPwr} = ${myTotal} > 威力 ${foeVal} → 拼赢（差值+${marginAdd}）！`);
          if (sin === "gloom" && p.passive?.stats?.gloomWinWeak) foe.roundDmgDealtDown += p.passive.stats.gloomWinWeak;
        } else if (myTotal === foeVal) {
          roundLog.push(`【#${orderIdx + 1} ${p.name}】${titleName} 对拼【${foe.name}·${intent.name}】：` +
            `1D6(${die})+${clashBonus + extraPwr} = ${myTotal} = 威力 ${foeVal} → 兵刃相撞拼平，双方无伤！`);
        } else {
          const loseDiff = Math.min(3, foeVal - myTotal);
          const foeDmg = effIntentDmg(foe, intent) + loseDiff;
          roundLog.push(`【#${orderIdx + 1} ${p.name}】${titleName} 对拼【${foe.name}·${intent.name}】：` +
            `1D6(${die})+${clashBonus + extraPwr} = ${myTotal} < 威力 ${foeVal} → 拼点落败！`);
          hurtPlayer(p, foeDmg, roundLog);
          addPressure(p, 1 + (intent.winPressure || 0), roundLog);
        }
        // 无论成败触发的迟缓
        for (const t of traits) {
          if (t.stats?.foeOtherPowerDownAlways) foe.roundPowerDown += t.stats.foeOtherPowerDownAlways;
        }
      } else {
        hit = true;
        roundLog.push(`【#${orderIdx + 1} ${p.name}】${titleName} 单方面偷袭【${foe.name}】→ 自动命中！`);
      }

      if (!hit || isDown(p)) return;

      // 饕餮盛宴类「若击杀给奖励；否则本次伤害+N」严格二选一判定
      let noKillAlt = 0;
      let usedNoKillBranch = false;
      for (const t of traits) {
        const alt = t.stats?.onKillOrStagger?.altDmgIfNoKill;
        if (alt) {
          const wCheck = calcWeakMod(foe, mode, sin, ignoreResist);
          const estNormal = wCheck.immune ? 0 : Math.max(1, baseDmg + extraDmg + wCheck.mod);
          const needToKill = foe.hp + (ignoreShield ? 0 : (foe.shield || 0));
          if (estNormal < needToKill) {
            noKillAlt += alt;
            usedNoKillBranch = true;
          }
        }
      }
      const dmgRes = damageEnemy(foe, baseDmg + extraDmg + noKillAlt, { mode, sin, ignoreResist, ignoreShield, staggerBoost }, roundLog, p);

      // 色欲被动命中回血 & 嫉妒共鸣追伤
      if (sin === "lust" && p.passive?.stats?.sinHitHeal) healPlayer(p, p.passive.stats.sinHitHeal, roundLog);
      if (rStat?.trueDmg && !isDown(foe)) {
        roundLog.push(`  ▸ 嫉妒共鸣追加雷击：`);
        damageEnemy(foe, rStat.trueDmg, { trueDmg: true }, roundLog, p);
      }

      // 命中后词条结算
      for (const t of traits) {
        const st = t.stats || {};
        if (st.winOnly && !wonClash) continue;
        if (st.selfHeal) {
          const hVal = (st.staggerHeal && isStaggered(foe)) ? st.staggerHeal : st.selfHeal;
          healPlayer(p, hVal, roundLog);
        }
        if (st.teamHeal) {
          livePlayers().forEach(a => healPlayer(a, st.teamHeal, roundLog));
          if (st.selfPressureDelta) addPressure(p, st.selfPressureDelta, roundLog);
        }
        if (st.teamPressureDown) livePlayers().forEach(a => addPressure(a, -st.teamPressureDown, roundLog));
        if (st.allyOrSelfPressureDown) {
          const stressed = livePlayers().slice().sort((a, b) => b.pressure - a.pressure)[0] || p;
          if (stressed.pressure > 0) addPressure(stressed, -st.allyOrSelfPressureDown, roundLog);
        }
        if (st.trueBonusDmg && !isDown(foe)) damageEnemy(foe, st.trueBonusDmg, { trueDmg: true }, roundLog, p);
        if (st.splashOne) {
          const other = liveEnemies().find(e => e.id !== foe.id);
          if (other) { roundLog.push(`  ▸ 【${t.label}】波及 ${other.name}：`); damageEnemy(other, st.splashOne, { mode, sin }, roundLog, p); }
        }
        if (st.splashAll) {
          liveEnemies().filter(e => e.id !== foe.id).forEach(other => {
            roundLog.push(`  ▸ 【${t.label}】横扫 ${other.name}：`);
            damageEnemy(other, st.splashAll, { mode, sin }, roundLog, p);
          });
        }
        if (st.splashAllTrue) {
          liveEnemies().forEach(other => {
            roundLog.push(`  ▸ 【${t.label}】精神冲击 ${other.name}：`);
            damageEnemy(other, st.splashAllTrue, { trueDmg: true }, roundLog, p);
          });
        }
        if (st.foeVuln && !isDown(foe)) foe.roundVuln += st.foeVuln;
        if (st.allFoeVuln) liveEnemies().forEach(e => { e.roundVuln += st.allFoeVuln; });
        if (st.foeNoHeal && !isDown(foe)) foe.roundNoHeal = true;
        if (st.foePowerDownHit && !isDown(foe)) foe.roundPowerDown += st.foePowerDownHit;
        if (st.breakExtraIntent && !isDown(foe)) {
          if (foe.role === "boss_body") {
            foe.roundPowerDown += 2;
            roundLog.push(`  ▸ 【${t.label}】震慑主躯干，其余意图威力 -2`);
          } else {
            const extraInt = foe.activeIntents.find(i => !i.resolved && !i.unbreakable);
            if (extraInt) { extraInt.resolved = true; extraInt.cancelled = true; roundLog.push(`  ▸ 【${t.label}】强行震碎了【${extraInt.name}】！`); }
          }
        }
        if (st.severWeakIntent && margin >= st.severWeakIntent && !isDown(foe)) {
          const weakInt = foe.activeIntents.find(i => !i.resolved && !i.unbreakable && effIntentPower(foe, i) < myTotal);
          if (weakInt) { weakInt.resolved = true; weakInt.cancelled = true; roundLog.push(`  ▸ 【${t.label}】顺势一闪斩断了【${weakInt.name}】！`); }
        }
        if (st.onKillOrStagger && !usedNoKillBranch && (dmgRes.killed || (!st.onKillOrStagger.altDmgIfNoKill && dmgRes.staggeredNow))) {
          if (st.onKillOrStagger.heal) healPlayer(p, st.onKillOrStagger.heal, roundLog);
          if (st.onKillOrStagger.coreSin) S.sinPool[p.spectrum.core] += st.onKillOrStagger.coreSin;
        }
        if (st.refundSin) S.sinPool[p.spectrum.core] += st.refundSin;
        if (st.teamCritUncap) teamCritUncap = true;
        if (st.teamNextBuff) {
          livePlayers().forEach(a => {
            if (a.id !== p.id) {
              a.roundPowerBonus += st.teamNextBuff.power || 0;
              a.roundDmgBonus += st.teamNextBuff.dmg || 0;
            }
          });
          roundLog.push(`  ▸ 【${t.label}】全队后续行动拼点+${st.teamNextBuff.power}、伤害+${st.teamNextBuff.dmg}`);
        }
      }
    });

    // 3. 收尾：结算未被拉线的敌方剩余意图
    for (const foe of liveEnemies()) {
      if (isStaggered(foe)) continue;
      for (const i of foe.activeIntents) {
        if (i.resolved) continue;
        i.resolved = true;
        if (i.kind === "buff") {
          foe.nextRoundPowerBonus = (foe.nextRoundPowerBonus || 0) + (i.buffPowerNext || 0);
          roundLog.push(`【敌方蓄力】${foe.name} 完成【${i.name}】${i.buffPowerNext ? `，下回合攻击威力 +${i.buffPowerNext}` : ""}！`);
          continue;
        }
        const targets = livePlayers();
        if (!targets.length) break;
        const victim = targets.find(x => x.id === i.targetPlayerId)
          || targets.slice().sort((a, b) => (b.hp + b.shield) - (a.hp + a.shield))[0];
        const pwr = effIntentPower(foe, i);
        const outDmg = effIntentDmg(foe, i);
        if (victim.evadeKeep > 0) {
          if (victim.evadeKeep >= pwr) {
            roundLog.push(`【敌方未接线攻击】${foe.name}【${i.name}】(威力${pwr}) → 被 ${victim.name} 保留的闪避值(${victim.evadeKeep})潇洒连闪躲过！`);
            continue;
          } else {
            roundLog.push(`【敌方未接线攻击】${foe.name}【${i.name}】(威力${pwr}) 突破了 ${victim.name} 的闪避保留值(${victim.evadeKeep})！`);
            victim.evadeKeep = 0;
          }
        } else {
          roundLog.push(`【敌方未接线攻击】${foe.name}【${i.name}】无人接线，直接命中 ${victim.name}（固定伤害 ${outDmg}）！`);
        }
        hurtPlayer(victim, outDmg, roundLog);
      }
    }

    S.roundResolved = true;
    S.log.unshift({ round: S.round, title: `═══ 第 ${S.round} 回合交锋战报 ═══`, lines: roundLog });
    renderAll();
    toast(`第 ${S.round} 回合结算完成！可复制战报发群，或点「下一回合」`);
  }

  function resolveDefenseWire(w, orderIdx, p, roundLog) {
    const df = p.defense;
    const fullHpBonus = (p.hp >= p.maxHp && p.passive?.stats?.fullHpDefBonus) ? p.passive.stats.fullHpDefBonus : 0;
    const bonus = df.bonus + fullHpBonus + (p.roundPowerBonus || 0);
    p.roundPowerBonus = 0;
    const { foe, intent } = resolveWireTargetLive(w);

    if (df.type === "block") {
      const mRoll = +w.manualRoll;
      const die = mRoll >= 1 && mRoll <= 6 ? mRoll : d6();
      const gain = die + bonus;
      p.shield += gain;
      if (intent && foe) {
        intent.resolved = true;
        const inc = effIntentDmg(foe, intent);
        roundLog.push(`【#${orderIdx + 1} ${p.name} · 守备格挡】1D6(${die})+${bonus} = 获得 ${gain} 点护盾，稳稳接下【${foe.name}·${intent.name}】(伤害 ${inc})！`);
        hurtPlayer(p, inc, roundLog);
      } else {
        roundLog.push(`【#${orderIdx + 1} ${p.name} · 原地格挡】1D6(${die})+${bonus} = 架起 ${gain} 点本回合护盾！`);
      }
    } else if (df.type === "evade") {
      if (!intent || !foe) {
        const mRoll = +w.manualRoll;
        const die = mRoll >= 1 && mRoll <= 6 ? mRoll : d6();
        p.evadeKeep = die + bonus;
        roundLog.push(`【#${orderIdx + 1} ${p.name} · 预备闪避】1D6(${die})+${bonus} = 保留闪避点数 ${p.evadeKeep} 应对后续单方面攻击`);
        return;
      }
      intent.resolved = true;
      const mRoll = +w.manualRoll;
      const die = mRoll >= 1 && mRoll <= 6 ? mRoll : d6();
      const evVal = die + bonus;
      const foeVal = effIntentPower(foe, intent);
      if (evVal >= foeVal) {
        p.evadeKeep = evVal;
        roundLog.push(`【#${orderIdx + 1} ${p.name} · 守备闪避】1D6(${die})+${bonus} = ${evVal} ≥ 【${foe.name}·${intent.name}】(威力${foeVal}) → 无伤闪避，且保留闪避值 ${evVal}！`);
      } else {
        const inc = effIntentDmg(foe, intent);
        roundLog.push(`【#${orderIdx + 1} ${p.name} · 守备闪避】1D6(${die})+${bonus} = ${evVal} < 【${foe.name}·${intent.name}】(威力${foeVal}) → 闪避失败！`);
        hurtPlayer(p, inc, roundLog);
      }
    } else {
      // 反击
      p.shield += bonus;
      if (intent && foe) {
        intent.resolved = true;
        const inc = effIntentDmg(foe, intent);
        roundLog.push(`【#${orderIdx + 1} ${p.name} · 守备反击】架起 ${bonus} 点护盾硬吃【${foe.name}·${intent.name}】(伤害 ${inc})！`);
        hurtPlayer(p, inc, roundLog);
        if (!isDown(p)) {
          roundLog.push(`  ▸ ${p.name} 反手重击【${foe.name}】：`);
          damageEnemy(foe, df.counterDmg + fullHpBonus, { trueDmg: true }, roundLog, p);
        }
      } else {
        roundLog.push(`【#${orderIdx + 1} ${p.name} · 守备反击】未接到攻击，保留 ${bonus} 点本回合护盾`);
      }
    }
  }

  function targetEnemyOfWire(w) {
    if (!w.targetKey) return null;
    if (w.targetKey.startsWith("intent:") || w.targetKey.startsWith("sneak:")) {
      const eid = +w.targetKey.split(":")[1];
      return S.enemies.find(e => e.id === eid && !isDown(e)) || null;
    }
    return null;
  }

  function resolveWireTargetLive(w) {
    if (w.targetKey?.startsWith("intent:")) {
      const [, eidStr, iidStr] = w.targetKey.split(":");
      const foe = S.enemies.find(e => e.id === +eidStr);
      if (!foe || isDown(foe)) {
        const alt = liveEnemies()[0] || null;
        return { foe: alt, intent: null };
      }
      const intent = (!isStaggered(foe) && foe.activeIntents.find(i => i.id === +iidStr && !i.resolved && i.kind === "attack")) || null;
      return { foe, intent };
    }
    if (w.targetKey?.startsWith("sneak:")) {
      const eid = +w.targetKey.split(":")[1];
      const foe = S.enemies.find(e => e.id === eid && !isDown(e)) || liveEnemies()[0] || null;
      return { foe, intent: null };
    }
    return { foe: null, intent: null };
  }

  function traitCondMet(cond, { p, foe, isClashing, orderIdx }) {
    if (!cond) return true;
    if (cond === "hpBelowStagger") return p.hp <= p.staggerLine;
    if (cond === "hpAboveStagger") return p.hp > p.staggerLine;
    if (cond === "fullOrShield") return p.hp >= p.maxHp || (p.shield || 0) > 0;
    if (cond === "clashed") return isClashing;
    if (cond === "poolAtLeast3") return totalPoolCount() >= 3;
    if (cond === "notFirstSlot") return orderIdx > 0;
    if (cond === "foeHpAboveSelf") return foe && foe.hp > p.hp;
    return true;
  }

  /* ---------- 推进下一回合 ---------- */
  function nextRound() {
    S.round++;
    S.roundResolved = false;

    for (const p of S.players) {
      p.shield = 0;
      p.roundPowerBonus = 0;
      p.roundDmgBonus = 0;
      p.hurtBonusDmg = 0;
      p.evadeKeep = 0;
      p.wonClashThisRound = false;
      if (p.cds.s2 > 0) p.cds.s2--;
      if (p.cds.s3 > 0) p.cds.s3--;
      if (p.usedThisRound.has("s2")) p.cds.s2 = 1;
      if (p.usedThisRound.has("s3")) p.cds.s3 = p.skills[2]?.cd || 2;
      p.usedThisRound.clear();
      if (!isDown(p) && !isStaggered(p) && p.passive?.stats?.roundStartShield) {
        p.shield += p.passive.stats.roundStartShield;
      }
    }

    for (const e of S.enemies) {
      e.shield = 0;
      e.roundPowerDown = 0;
      e.gloomResDown = 0;
      e.roundVuln = 0;
      e.roundDmgDealtDown = 0;
      e.roundNoHeal = false;
      refreshEnemyIntents(e);
    }

    buildDefaultWires();
    renderAll();
    toast(`进入第 ${S.round} 回合！敌方意图与技能冷却已刷新`);
  }

  /* ---------- 生成发往跑团群的纯文本面板 ---------- */
  function buildGroupBoardText() {
    const lines = [];
    lines.push(`══════ 第 ${S.round} 回合${S.encounterTitle ? ` · ${S.encounterTitle}` : ""} ══════`);
    const poolBits = SIN_ORDER.filter(k => S.sinPool[k] > 0).map(k => `${SIN_LABELS[k]}×${S.sinPool[k]}`);
    lines.push(`【公共罪孽池】${poolBits.length ? poolBits.join("  ") : "空（打出技能即 +1 对应碎片）"}`);
    lines.push(``);

    if (!liveEnemies().length) {
      lines.push(`【敌方】全部敌人已被镇压！战斗胜利！`);
    } else {
      let idxNo = 1;
      for (const e of liveEnemies()) {
        const wk = Object.entries(e.resists).filter(([, v]) => v === "weak").map(([k]) => RESIST_KEY_LABELS[k]);
        const ed = Object.entries(e.resists).filter(([, v]) => v === "endure").map(([k]) => RESIST_KEY_LABELS[k]);
        const im = Object.entries(e.resists).filter(([, v]) => v === "immune").map(([k]) => RESIST_KEY_LABELS[k]);
        const resTxt = [
          wk.length ? `弱:${wk.join("/")}(+2)` : null,
          ed.length ? `耐:${ed.join("/")}(-2)` : null,
          im.length ? `免:${im.join("/")}(0)` : null
        ].filter(Boolean).join(" ");
        const stg = isStaggered(e)
          ? "【★混乱破防中：无法行动 / 受伤+3】"
          : (e.hasStagger ? `混乱线 ${e.staggerLine}${e.staggerTriggered ? "(已触发过)" : ""}` : (e.breakStaggersBody ? "破坏→主躯干混乱!" : "无混乱线"));
        lines.push(`【${e.name}】HP ${e.hp}/${e.maxHp} (${stg})${resTxt ? ` | ${resTxt}` : ""}`);
        if (!isStaggered(e)) {
          for (const i of e.activeIntents) {
            if (i.resolved) continue;
            if (i.kind === "buff") {
              lines.push(`  ▸ 意图${idxNo++} [${i.name} · 增益] ${i.note || (i.buffPowerNext ? `未被吞除则下轮威力+${i.buffPowerNext}` : "")}`);
            } else {
              lines.push(`  ▸ 意图${idxNo++} [${i.name}${i.unbreakable ? "·红光" : ""}] 威力 ${effIntentPower(e, i)} / 伤害 ${effIntentDmg(e, i)}${i.winPressure ? ` (拼赢压+${i.winPressure})` : ""}`);
            }
          }
        }
      }
    }

    if (S.players.length) {
      lines.push(``);
      lines.push(`【罪人状态】`);
      for (const p of S.players) {
        if (isDown(p)) { lines.push(`· [${p.name} | ☠重伤退场]`); continue; }
        const cdArr = [p.cds.s2 ? `二(${p.cds.s2})` : null, p.cds.s3 ? `三(${p.cds.s3})` : null].filter(Boolean);
        const flags = [
          isStaggered(p) ? "⚡混乱停动" : null,
          p.breakdownPending === "corrosion" ? "⚠下轮侵蚀" : (p.breakdownPending === "panic" ? "⚠下轮恐慌" : null),
          p.slots >= 2 ? "2槽" : null
        ].filter(Boolean).join(" ");
        lines.push(`· [${p.name} | HP ${p.hp}/${p.maxHp}(混${p.staggerLine})${p.shield ? ` +盾${p.shield}` : ""} | 压 ${p.pressure}/${p.pressureCap} | CD:${cdArr.join("/") || "无"}${flags ? ` | ${flags}` : ""}]`);
      }
    }
    return lines.join("\n");
  }

  /* ---------- 示例三人队与预设遭遇快速载入 ---------- */
  function loadDemoParty() {
    const mk = (cfg) => {
      const saved = JSON.stringify(state);
      Object.assign(state, defaultState(), cfg);
      const out = buildData();
      Object.assign(state, JSON.parse(saved));
      return playerFromV2Json(out);
    };
    S.players = [
      mk({
        name: "默尔索", title: "N公司大锤", tier: "ZAYIN", uptie: 2,
        attrs: { 力量: 3, 灵巧: 1, 认知: 1, 体魄: 3, 意志: 3, 共感: 1 },
        spectrum: { core: "sloth", sec: "wrath", pot: "pride", rej: "lust" },
        skills: {
          s1: { name: "沉稳铁拳", mode: "strike", traitId: "pr_l1" },
          s2: { name: "钉锤重砸", mode: "strike", traitId: "wr_c1", extraLightId: "wr_l1" },
          s3: { name: "处决重碾", mode: "strike", coreId: "sl_c3", aceId: "sl_a1", s4Awaken: "power" }
        },
        defense: "block", passiveId: "sl_p1",
        zayinEgo: { name: "他人的锁链", mode: "strike", secSinSlot: "pot", optId: "sl_e1" }
      }),
      mk({
        name: "浮士德", title: "脑叶本部", tier: "ZAYIN", uptie: 2,
        attrs: { 力量: 1, 灵巧: 2, 认知: 3, 体魄: 2, 意志: 2, 共感: 2 },
        spectrum: { core: "gloom", sec: "gluttony", pot: "envy", rej: "wrath" },
        skills: {
          s1: { name: "弱点剖析", mode: "pierce", traitId: "en_l2" },
          s2: { name: "样本吞噬", mode: "slash", traitId: "gl_c3", extraLightId: "gl_l1" },
          s3: { name: "沉沦解构", mode: "pierce", coreId: "gm_c1", aceId: "gm_a1", s4Awaken: "power" }
        },
        defense: "evade", passiveId: "gm_p1",
        zayinEgo: { name: "表征放射器", mode: "pierce", secSinSlot: "pot", optId: "gm_e1" }
      }),
      mk({
        name: "堂吉诃德", title: "五协会收尾人", tier: "ZAYIN", uptie: 2,
        attrs: { 力量: 2, 灵巧: 3, 认知: 3, 体魄: 2, 意志: 1, 共感: 1 },
        spectrum: { core: "pride", sec: "gloom", pot: "lust", rej: "sloth" },
        skills: {
          s1: { name: "疾风刺", mode: "pierce", traitId: "lu_l1" },
          s2: { name: "正义冷刺", mode: "pierce", traitId: "gm_c2", extraLightId: "gm_l1" },
          s3: { name: "吾名堂吉诃德！", mode: "slash", coreId: "pr_c2", aceId: "pr_a1", s4Awaken: "power" }
        },
        defense: "evade", passiveId: "pr_p1",
        zayinEgo: { name: "拉·桑乔之血", mode: "pierce", secSinSlot: "pot", optId: "pr_e1" }
      })
    ];
    const startLogs = S.players.flatMap(applyBattleStartPassives);
    if (startLogs.length) S.log.unshift({ round: S.round, title: "【开场被动与饰品】", lines: startLogs });
    buildDefaultWires();
    renderAll();
    toast("已载入示例三人罪人小队！");
  }

  function loadEncounterByKey(key) {
    const pre = PRESET_ENCOUNTERS.find(p => p.key === key);
    if (!pre) return;
    S.round = 1;
    S.roundResolved = false;
    S.encounterTitle = pre.title;
    SIN_ORDER.forEach(k => S.sinPool[k] = 0);
    S.enemies = pre.enemies.map(enemyFromDef);
    const startLogs = [];
    S.players.forEach(p => {
      const gifts = p.gear?.gifts || [];
      p.hp = p.maxHp; p.shield = 0; p.pressure = 0; p.breakdownPending = null;
      p.staggerTriggered = false; p.staggeredUntilRound = 0;
      p.cds = { s2: 0, s3: 0 }; p.usedThisRound.clear();
      p.kAmpouleLeft = gifts.some(g => g.stats?.kAmpoule) ? 1 : 0;
      p.firstEgoCalmLeft = gifts.some(g => g.stats?.firstEgoCalm) ? 1 : 0;
      startLogs.push(...applyBattleStartPassives(p));
    });
    S.log = startLogs.length ? [{ round: 1, title: "【开场被动与饰品】", lines: startLogs }] : [];
    buildDefaultWires();
    renderAll();
    toast(`已载入遭遇：${pre.title}`);
  }

  /* ---------- 界面渲染 ---------- */
  function hpBarHtml(hp, maxHp, shield, staggerLine, isFoe) {
    const pct = clamp(hp / Math.max(1, maxHp) * 100, 0, 100);
    const stPct = staggerLine > 0 ? clamp(staggerLine / Math.max(1, maxHp) * 100, 0, 100) : 0;
    return `<div class="bar${isFoe ? " foe" : ""}">
      <i style="width:${pct}%"></i>
      ${stPct > 0 ? `<b class="stagger-tick" style="left:${stPct}%" title="混乱线 ${staggerLine}"></b>` : ""}
      <span>${hp} / ${maxHp}${shield ? ` (+盾${shield})` : ""}${staggerLine ? ` · 混${staggerLine}` : ""}</span>
    </div>`;
  }

  function renderSinPool() {
    $("sinPoolBar").innerHTML = `<b style="font-size:13.5px;color:var(--accent-2);margin-right:4px">公共罪孽池</b>` +
      SIN_ORDER.map(k => `<div class="sin-pool-item sin-${k}">
        <span class="sin-icon-inline" style="margin-right:2px">${sinIcon(k)}</span>
        <span>${SIN_LABELS[k]}</span>
        <button data-pool="${k}:-1">−</button>
        <b>${S.sinPool[k]}</b>
        <button data-pool="${k}:1">+</button>
      </div>`).join("") +
      `<span style="margin-left:auto;font-size:12px;color:var(--muted)">合计 <b>${totalPoolCount()}</b> 颗碎片</span>`;

    $("sinPoolBar").querySelectorAll("[data-pool]").forEach(b => b.onclick = () => {
      const [k, d] = b.dataset.pool.split(":");
      S.sinPool[k] = Math.max(0, S.sinPool[k] + (+d));
      renderAll();
    });
  }

  function renderUnits() {
    $("roundNo").textContent = S.round;
    $("roundHint").textContent = S.roundResolved
      ? "本回合已结算完毕 · 点击右侧「下一回合 →」继续"
      : `排线准备中 · 存活罪人 ${livePlayers().length} 人 · 存活敌方单位 ${liveEnemies().length} 个`;

    // Players
    if (!S.players.length) {
      $("playerList").innerHTML = `<p class="empty">尚未导入角色。点击右上角「⚡ 载入示例三人队」立即体验，或导入建卡器 JSON。</p>`;
    } else {
      $("playerList").innerHTML = S.players.map(p => {
        const open = S.openUnits.has("p" + p.id);
        return `<div class="unit ally${isStaggered(p) ? " staggered" : ""}${isDown(p) ? " downed" : ""}">
          <div class="unit-head">
            <b>${esc(p.name)}</b>
            <span class="risk risk-${p.tier}">${p.tier}</span>
            ${isDown(p) ? `<span class="ptag warn">☠ 倒地</span>` : ""}
            ${isStaggered(p) ? `<span class="ptag warn">⚡ 混乱中</span>` : ""}
            ${p.breakdownPending ? `<span class="ptag warn">⚠ 下轮${p.breakdownPending === "corrosion" ? "侵蚀" : "恐慌"}</span>` : ""}
            <span style="margin-left:auto;font-size:12px;color:var(--muted)">压 ${p.pressure}/${p.pressureCap} · ${p.slots}槽</span>
            <button class="btn ghost mini" data-tog="p${p.id}">${open ? "▲" : "⚙"}</button>
            <button class="btn ghost mini" data-delp="${p.id}" title="移除">✕</button>
          </div>
          ${hpBarHtml(p.hp, p.maxHp, p.shield, p.staggerLine, false)}
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;font-size:11.5px;color:var(--muted)">
            <span class="ptag mute">一:${esc(p.skills[0].name)}(${p.skills[0].sinLabel})</span>
            <span class="ptag ${p.cds.s2 ? "warn" : "mute"}">二:${esc(p.skills[1].name)}${p.cds.s2 ? `[CD:${p.cds.s2}]` : ""}</span>
            <span class="ptag ${p.cds.s3 ? "warn" : "mute"}">三:${esc(p.skills[2].name)}${p.cds.s3 ? `[CD:${p.cds.s3}]` : ""}</span>
            <span class="ptag mute">守:${p.defense.label}</span>
          </div>
          ${open ? `<div class="unit-stats">
            <label class="ustat"><span>当前 HP</span><input type="number" data-pf="hp" data-id="${p.id}" value="${p.hp}"></label>
            <label class="ustat"><span>护盾</span><input type="number" data-pf="shield" data-id="${p.id}" value="${p.shield}"></label>
            <label class="ustat"><span>罪孽压力</span><input type="number" data-pf="pressure" data-id="${p.id}" value="${p.pressure}"></label>
            <label class="ustat"><span>行动槽</span><input type="number" min="1" max="3" data-pf="slots" data-id="${p.id}" value="${p.slots}"></label>
          </div>` : ""}
        </div>`;
      }).join("");
    }

    // Enemies
    if (!S.enemies.length) {
      $("enemyList").innerHTML = `<p class="empty">场上没有敌人。选择预设遭遇点「👹 载入遭遇」或导入配怪器 JSON。</p>`;
    } else {
      $("enemyList").innerHTML = S.enemies.map(e => {
        const open = S.openUnits.has("e" + e.id);
        const resTags = Object.entries(e.resists).map(([k, v]) =>
          `<span class="ptag ${v === "weak" ? "warn" : "mute"}">${RESIST_KEY_LABELS[k]}${v === "weak" ? "弱+2" : v === "endure" ? "耐-2" : "免疫"}</span>`
        ).join("");
        return `<div class="unit foe${isStaggered(e) ? " staggered" : ""}${isDown(e) ? " downed" : ""}">
          <div class="unit-head">
            <b>${esc(e.name)}</b>
            <span class="ptag mute">${ROLE_TAG[e.role] || "敌人"}</span>
            ${isDown(e) ? `<span class="ptag warn">已击破</span>` : ""}
            ${isStaggered(e) ? `<span class="ptag warn">⚡ 混乱破防(+3易伤)</span>` : ""}
            ${e.roundVuln ? `<span class="ptag warn">易伤+${e.roundVuln}</span>` : ""}
            ${(e.roundPowerDown + e.gloomResDown) ? `<span class="ptag">威力-${e.roundPowerDown + e.gloomResDown}</span>` : ""}
            <button class="btn ghost mini" style="margin-left:auto" data-tog="e${e.id}">${open ? "▲" : "⚙"}</button>
            <button class="btn ghost mini" data-dele="${e.id}">✕</button>
          </div>
          ${hpBarHtml(e.hp, e.maxHp, e.shield, e.hasStagger ? e.staggerLine : 0, true)}
          ${resTags ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">${resTags}</div>` : ""}
          <div class="intent-list">
            ${isDown(e) ? "" : isStaggered(e) ? `<div class="hint" style="color:#f2c40f">处于【混乱】状态，本回合无意图且受到伤害 +3</div>`
              : e.activeIntents.map(i => `<div class="intent-pill ${i.kind === "buff" ? "buff" : ""}${i.resolved ? " done" : ""}">
                <b>${esc(i.name)}${i.unbreakable ? "·红光" : ""}</b>
                ${i.kind === "attack"
                  ? `<span style="color:var(--accent-2)">威力 <b>${effIntentPower(e, i)}</b> / 伤 <b>${effIntentDmg(e, i)}</b></span>`
                  : `<span style="color:var(--ok)">蓄力增益${i.buffPowerNext ? `(下轮+${i.buffPowerNext})` : ""}</span>`}
                ${i.note ? `<small style="color:var(--muted)">${esc(i.note)}</small>` : ""}
              </div>`).join("")}
          </div>
          ${open ? `<div class="unit-stats">
            <label class="ustat"><span>当前 HP</span><input type="number" data-ef="hp" data-id="${e.id}" value="${e.hp}"></label>
            <label class="ustat"><span>最大 HP</span><input type="number" data-ef="maxHp" data-id="${e.id}" value="${e.maxHp}"></label>
            <label class="ustat"><span>本轮易伤+</span><input type="number" data-ef="roundVuln" data-id="${e.id}" value="${e.roundVuln}"></label>
            <label class="ustat"><span>本轮威力-</span><input type="number" data-ef="roundPowerDown" data-id="${e.id}" value="${e.roundPowerDown}"></label>
          </div>` : ""}
        </div>`;
      }).join("");
    }

    document.querySelectorAll("[data-tog]").forEach(b => b.onclick = () => {
      const k = b.dataset.tog;
      S.openUnits.has(k) ? S.openUnits.delete(k) : S.openUnits.add(k);
      renderUnits();
    });
    document.querySelectorAll("[data-delp]").forEach(b => b.onclick = () => {
      S.players = S.players.filter(x => x.id !== +b.dataset.delp);
      reconcileWires(); renderAll();
    });
    document.querySelectorAll("[data-dele]").forEach(b => b.onclick = () => {
      S.enemies = S.enemies.filter(x => x.id !== +b.dataset.dele);
      reconcileWires(); renderAll();
    });
    document.querySelectorAll("[data-pf]").forEach(el => el.onchange = () => {
      const p = S.players.find(x => x.id === +el.dataset.id); if (!p) return;
      const f = el.dataset.pf, v = Math.round(+el.value || 0);
      if (f === "hp") p.hp = clamp(v, 0, p.maxHp);
      else if (f === "shield") p.shield = Math.max(0, v);
      else if (f === "pressure") p.pressure = clamp(v, 0, p.pressureCap);
      else if (f === "slots") { p.slots = clamp(v, 1, 3); if (!S.roundResolved) buildDefaultWires(); }
      renderAll();
    });
    document.querySelectorAll("[data-ef]").forEach(el => el.onchange = () => {
      const e = S.enemies.find(x => x.id === +el.dataset.id); if (!e) return;
      const f = el.dataset.ef, v = Math.round(+el.value || 0);
      if (f === "maxHp") { e.maxHp = Math.max(1, v); e.hp = clamp(e.hp, 0, e.maxHp); }
      else if (f === "hp") e.hp = clamp(v, 0, e.maxHp);
      else e[f] = Math.max(0, v);
      reconcileWires(); renderAll();
    });
  }

  function renderWorkbench() {
    reconcileWires();
    if (S.roundResolved) {
      $("resBanner").innerHTML = `<div class="res-banner">✔ 第 ${S.round} 回合所有排线与敌方剩余意图已结算完毕。可复制右侧战报发群，随后点击 <b>「下一回合 →」</b>。</div>`;
      $("wireRows").innerHTML = "";
      $("wireActions").innerHTML = `<button class="btn primary big" id="btnNextInline">进入第 ${S.round + 1} 回合 →</button>`;
      $("btnNextInline").onclick = nextRound;
      return;
    }

    if (!livePlayers().length || !liveEnemies().length) {
      $("resBanner").innerHTML = "";
      $("wireRows").innerHTML = `<p class="empty">${!livePlayers().length ? "请先导入或载入至少 1 名存活罪人。" : "场上没有存活敌人，载入一套新遭遇即可开战！"}</p>`;
      $("wireActions").innerHTML = "";
      return;
    }

    const res = previewResonance();
    const resPills = res.activeRes.map(r =>
      `<span class="ptag sin-${r.sin}" style="border-color:var(--sin-c)">★ ${SIN_LABELS[r.sin]}${r.full ? "完全共鸣" : "共鸣"}(${r.count})：${r.full ? r.info.full : r.info.base}</span>`
    ).join("");
    const genPills = SIN_ORDER.filter(k => res.sinGen[k] > 0).map(k => `${SIN_LABELS[k]}+${res.sinGen[k]}`).join(" ");

    $("resBanner").innerHTML = `<div class="res-banner">
      <b>本轮排线预览：</b>
      <span>产出碎片 <b>${genPills || "无"}</b></span>
      ${resPills || `<span style="color:var(--muted)">（凑齐 ≥2 个同色技能即可点亮当回合罪孽共鸣）</span>`}
      ${res.deficit.length ? `<span class="ptag warn">⚠ E.G.O 碎片不足：${res.deficit.join("、")}</span>` : ""}
    </div>`;

    const openIntents = allOpenAttackIntents();
    const foes = liveEnemies();

    $("wireRows").innerHTML = S.wires.map((w, idx) => {
      const p = S.players.find(x => x.id === w.playerId);
      const meta = actionMeta(p, w.actionKey);

      if (meta.kind === "panic" || meta.kind === "corrosion") {
        return `<div class="wire-row" style="border-color:var(--danger)">
          <div class="wire-order"><b>#${idx + 1}</b></div>
          <div><b>${esc(p.name)}</b></div>
          <div style="grid-column:3 / -1;color:var(--danger)"><b>${meta.label}</b>（满压力失控强制结算，结束后压力清零）</div>
        </div>`;
      }

      // 构建技能下拉选项
      const usedByOtherSlot = new Set(
        S.wires.filter(o => o !== w && o.playerId === p.id).map(o => o.actionKey.startsWith("ego:") ? "ego" : o.actionKey)
      );
      const actionOpts = [
        `<option value="s1"${w.actionKey === "s1" ? " selected" : ""}>一技能·${esc(p.skills[0].name)} (${p.skills[0].modeLabel}/${p.skills[0].sinLabel} · 1D6+${p.skills[0].clashBonus} 伤${p.skills[0].baseDmg})</option>`,
        `<option value="s2"${w.actionKey === "s2" ? " selected" : ""}${p.cds.s2 || usedByOtherSlot.has("s2") ? " disabled" : ""}>二技能·${esc(p.skills[1].name)} (${p.skills[1].modeLabel}/${p.skills[1].sinLabel} · 1D6+${p.skills[1].clashBonus} 伤${p.skills[1].baseDmg})${p.cds.s2 ? ` [冷却${p.cds.s2}]` : ""}</option>`,
        `<option value="s3"${w.actionKey === "s3" ? " selected" : ""}${p.cds.s3 || usedByOtherSlot.has("s3") ? " disabled" : ""}>三技能·${esc(p.skills[2].name)} (${p.skills[2].modeLabel}/${p.skills[2].sinLabel} · 1D6+${p.skills[2].clashBonus} 伤${p.skills[2].baseDmg})${p.cds.s3 ? ` [冷却${p.cds.s3}]` : ""}</option>`,
        `<option value="def"${w.actionKey === "def" ? " selected" : ""}>守备·${p.defense.label}${p.defense.sinLabel ? `(${p.defense.sinLabel})` : ""} (${p.defense.type === "counter" ? `盾${p.defense.bonus}/反${p.defense.counterDmg}` : `1D6+${p.defense.bonus}`})</option>`,
        ...p.egos.map((eg, ei) => `<option value="ego:${ei}"${w.actionKey === `ego:${ei}` ? " selected" : ""}${usedByOtherSlot.has("ego") ? " disabled" : ""}>[${eg.rank} E.G.O] ${esc(eg.name)} (耗 ${Object.entries(eg.cost).map(([k,v])=>SIN_LABELS[k]+"×"+v).join("+")} · 1D6+${eg.clashBonus})</option>`)
      ].join("");

      // 构建目标下拉选项
      const takenOthers = new Set(S.wires.filter(o => o !== w).map(o => o.targetKey));
      let targetOpts = "";
      if (meta.supportOnly) {
        targetOpts = `<option value="support" selected>全队支援（免拼点直接生效）</option>`;
      } else {
        targetOpts += openIntents.map(x => {
          const taken = takenOthers.has(x.key);
          return `<option value="${x.key}"${w.targetKey === x.key ? " selected" : ""}${taken ? " disabled" : ""}>⚔ 拉线接：${esc(x.e.name)}【${esc(x.i.name)}】(威力${effIntentPower(x.e, x.i)}/伤${effIntentDmg(x.e, x.i)})${taken ? " [队友已接]" : ""}</option>`;
        }).join("");
        if (meta.kind !== "def") {
          targetOpts += foes.map(f =>
            `<option value="sneak:${f.id}"${w.targetKey === `sneak:${f.id}` ? " selected" : ""}>🗡 单方面偷袭：${esc(f.name)} (HP ${f.hp}/${f.maxHp}${isStaggered(f) ? "·混乱中" : ""})</option>`
          ).join("");
        } else if (p.defense.type === "block") {
          targetOpts += `<option value="self_shield"${w.targetKey === "self_shield" ? " selected" : ""}>🛡 原地架盾（不接攻击，仅叠本轮护盾）</option>`;
        }
      }

      const traitSummary = meta.kind === "skill"
        ? meta.skillObj.traits.map(t => `【${esc(t.label)}】${esc(t.effect)}`).join("；")
        : meta.kind === "ego" ? esc(meta.egoObj.effect) : esc(p.defense.effect);

      return `<div class="wire-row">
        <div class="wire-order">
          <b>#${idx + 1}</b>
          <div class="ord-btns">
            <button data-move="${idx}:-1" ${idx === 0 ? "disabled" : ""} title="前移顺位">↑</button>
            <button data-move="${idx}:1" ${idx === S.wires.length - 1 ? "disabled" : ""} title="后移顺位">↓</button>
          </div>
        </div>
        <div>
          <span class="sin-icon-inline">${meta.sin ? sinIcon(meta.sin) : ""}</span>
          <b>${esc(p.name)}</b>${p.slots >= 2 ? ` <small style="color:var(--muted)">(槽${w.slotIdx + 1})</small>` : ""}
        </div>
        <div><select data-wact="${w.id}">${actionOpts}</select></div>
        <div><select data-wtgt="${w.id}">${targetOpts}</select></div>
        <div>
          <input type="number" min="1" max="6" placeholder="骰点(自动)" data-wroll="${w.id}" value="${esc(w.manualRoll)}" title="可填入跑团群骰娘投出的 1~6 裸骰值；留空则系统自动随机投 1D6">
        </div>
        <div class="wire-sub">
          <span>${traitSummary}</span>
          ${meta.needsAlly ? `<label style="margin-left:auto;color:var(--accent-2)">支援队友：
            <select data-wally="${w.id}" style="width:auto;padding:2px 6px;font-size:12px;display:inline-block">
              ${livePlayers().map(a => `<option value="${a.id}"${w.allyId === a.id ? " selected" : ""}>${esc(a.name)}</option>`).join("")}
            </select></label>` : ""}
        </div>
      </div>`;
    }).join("");

    $("wireActions").innerHTML = `
      <button class="btn primary big" id="btnResolveAll" ${res.deficit.length ? "disabled" : ""}>⚔ 按顺位结算本轮全部交锋</button>
    `;

    $("wireRows").querySelectorAll("[data-move]").forEach(b => b.onclick = () => {
      const [i, dir] = b.dataset.move.split(":").map(Number);
      const j = i + dir;
      if (j < 0 || j >= S.wires.length) return;
      [S.wires[i], S.wires[j]] = [S.wires[j], S.wires[i]];
      renderWorkbench();
    });
    $("wireRows").querySelectorAll("[data-wact]").forEach(el => el.onchange = () => {
      const w = S.wires.find(x => x.id === +el.dataset.wact);
      if (w) { w.actionKey = el.value; renderAll(); }
    });
    $("wireRows").querySelectorAll("[data-wtgt]").forEach(el => el.onchange = () => {
      const w = S.wires.find(x => x.id === +el.dataset.wtgt);
      if (w) { w.targetKey = el.value; renderAll(); }
    });
    $("wireRows").querySelectorAll("[data-wally]").forEach(el => el.onchange = () => {
      const w = S.wires.find(x => x.id === +el.dataset.wally);
      if (w) { w.allyId = +el.value; }
    });
    $("wireRows").querySelectorAll("[data-wroll]").forEach(el => el.oninput = () => {
      const w = S.wires.find(x => x.id === +el.dataset.wroll);
      if (w) w.manualRoll = el.value.trim();
    });
    const btnGo = $("btnResolveAll");
    if (btnGo) btnGo.onclick = resolveCombatRound;
  }

  function renderBoardAndLog() {
    $("boardTextPreview").value = buildGroupBoardText();
    if (!S.log.length) {
      $("logBox").innerHTML = `<p class="empty">还没有交锋战报。排好线后点击「⚔ 按顺位结算本轮全部交锋」即可生成。</p>`;
    } else {
      $("logBox").innerHTML = S.log.map(l =>
        `<div class="logrow"><b>${esc(l.title)}</b>${l.lines.map(x => `<br>${esc(x)}`).join("")}</div>`
      ).join("");
    }
  }

  function renderAll() {
    renderSinPool();
    renderUnits();
    renderWorkbench();
    renderBoardAndLog();
  }

  /* ---------- 顶栏事件绑定 ---------- */
  $("btnCopyBoard").onclick = () => copyText(buildGroupBoardText(), "已复制群聊回合面板，可直接粘贴发群！");
  $("btnCopyBoard2").onclick = () => copyText(buildGroupBoardText(), "已复制群聊回合面板！");
  $("btnCopyLog").onclick = () => {
    if (!S.log.length) { toast("暂无战报可复制"); return; }
    const latest = S.log[0];
    copyText([latest.title, ...latest.lines].join("\n"), "已复制最新一轮战报！");
  };
  $("btnClearLog").onclick = () => { S.log = []; renderBoardAndLog(); };
  $("btnNextRound").onclick = nextRound;
  $("btnResetAll").onclick = () => {
    if (!confirm("确定清空整场战斗记录与双方单位吗？")) return;
    S.round = 1; S.roundResolved = false;
    S.players = []; S.enemies = []; S.wires = []; S.log = [];
    SIN_ORDER.forEach(k => S.sinPool[k] = 0);
    renderAll(); toast("战场已重置");
  };

  $("btnDemoParty").onclick = loadDemoParty;
  $("btnLoadPreset").onclick = () => loadEncounterByKey($("presetEncSel").value);
  $("btnQuickMob").onclick = () => {
    S.enemies.push(enemyFromDef({
      name: `增援杂兵 ${S.enemies.length + 1}`, role: "mob", maxHp: 14, hasStagger: true, staggerLine: 7,
      resists: { strike: "weak" },
      intents: [{ name: "突袭", cycle: "all", kind: "attack", power: 6, dmg: 4 }]
    }));
    if (!S.roundResolved && S.wires.length === 0) buildDefaultWires();
    renderAll();
  };

  $("btnImport").onclick = () => $("fileInput").click();
  $("fileInput").onchange = (ev) => {
    const files = [...(ev.target.files || [])];
    let done = 0;
    files.forEach(f => {
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (Array.isArray(d.enemies)) {
            S.encounterTitle = d.title || "导入遭遇";
            S.enemies = d.enemies.map(enemyFromDef);
            toast(`已导入遭遇「${S.encounterTitle}」（${S.enemies.length} 个单位）`);
          } else {
            const p = playerFromV2Json(d);
            S.players.push(p);
            const initLines = applyBattleStartPassives(p);
            if (initLines.length) S.log.unshift({ round: S.round, title: `【入场被动 · ${p.name}】`, lines: initLines });
            toast(`已导入罪人「${p.name}」`);
          }
        } catch (err) { toast("导入失败：" + err.message); }
        if (++done === files.length) {
          buildDefaultWires();
          renderAll();
        }
      };
      r.readAsText(f);
    });
    ev.target.value = "";
  };

  // 开箱即用默认载入示例三人队 + 红舞鞋 Boss，方便用户一打开就能体验全套 2.0 机制
  loadDemoParty();
  loadEncounterByKey("redshoes");

  // 暴露无头测试钩子
  window.__combatV2 = { S, playerFromV2Json, enemyFromDef, buildDefaultWires, resolveCombatRound, nextRound, buildGroupBoardText, renderAll };
})();
