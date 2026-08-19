/* ============ 战斗计算器 ============
   全部数据来自建卡器导出的 JSON，本文件不复制规则表——
   卡片的基础伤害、拼点属性、命中次数、非攻击卡的结构化数值(stats)都由导出提供。

   核心规则（与建卡器一致）：
     拼点值 = 1D6 + 属性 + 各项修正；拼点值 ≥ 意图值 即成功，差值 = 拼点值 - 意图值
     攻击   伤害 = 基础伤害 + 差值；攻击意图被拼过一次就结算，无论我方成败
     接线   防御/援护/反击在自己的行动里主动打出，接下敌方某条攻击意图。
            每轮限接一次，不占行动槽——接完仍可正常出牌。
            接的那一击不必打向自己：叙事上就是替别人挡下来。
     敌方攻击  没有独立的「敌方回合」。所有人都行动完、仍有攻击意图没人接线时，
            这些意图自动落地：伤害 = 敌方基础伤害 + (意图值 - 体魄)，最低为 0
     伤害   一律先扣临时生命，再扣 HP
     混乱线 当前 HP ≤ 50% 所有拼点骰 -1；≤ 25% 改为 -2（不叠加）
   聚光灯：每回合每人只能被选中一次；选中后按槽位出牌。
   卡组：整组用完（打出或弃掉）即刷新；多重攻击会往组里塞一张普通攻击，使循环变长。

   ★ 规则书未明确、本实现采用的口径：
     接线失败时的伤害 = 敌方基础伤害 + (意图值 - 你的拼点值)。
     这与「未接线」公式同形——未接线相当于不投骰、拼点值退化为体魄。 */

const $ = (id) => document.getElementById(id);
const uid = (() => { let n = 0; return () => ++n; })();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/* 名字由玩家自由输入，插回 HTML 前要转义，否则一个引号就能把卡片打散 */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = {
  round: 1,
  players: [], enemies: [], log: [],
  spot: null,        // 聚光灯选中的角色
  duel: null         // 收尾结算中正在处理的意图 {enemyId, intentId, byPlayerId, cardUid}
};

/* ---------- 概率 ---------- */
const hitRate = (mod, dc) => clamp(7 - (dc - mod), 0, 6) / 6;
const margins = (mod, dc) => { const o = []; for (let d = 1; d <= 6; d++) if (d + mod >= dc) o.push(d + mod - dc); return o; };
const avgMargin = (mod, dc) => { const o = margins(mod, dc); return o.length ? o.reduce((a, b) => a + b, 0) / o.length : 0; };
const pct = (x) => Math.round(x * 100) + "%";
const d6 = () => 1 + Math.floor(Math.random() * 6);

/* ---------- 导入 ---------- */
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
    clashMod: 0,          // 手动修正
    roundDmgDown: 0,      // 本轮受到的伤害 -N（「敏锐」一类）
    roundDice: 0,         // 本轮来自辅助卡的加骰，回合结束清零
    interceptRound: 0,    // 最后一次接线的回合（每轮限一次）
    slots: [{ group: "a" }],
    groups,
    actedRound: 0, slotUsed: 0,
    down: false          // HP 归零后退场，改回 HP 即可复归
  };
}

/* ---------- 卡组 ---------- */
const groupOf = (p, slotIdx) => p.groups[p.slots[slotIdx]?.group || "a"];
const availableCards = (g) => g.cards.filter(c => !g.used.includes(c.uid));
const groupIdOfCard = (p, card) => ["a", "b"].find(g => p.groups[g].cards.includes(card));

/* 消耗一张牌（打出或弃掉都算）。整组用完则刷新——弃牌因此会加速循环，
   这正是暴食「循环加速」的设计意图。 */
function consumeCard(g, card) {
  if (!g.used.includes(card.uid)) g.used.push(card.uid);
  if (g.used.length >= g.cards.length) { g.used = []; return true; }
  return false;
}
/* 多重攻击结算后往组里塞一张普通攻击 */
function addExtraCard(g, card) {
  if (!card.extraCard) return null;
  const c = {
    uid: uid(), sin: card.sin, sinLabel: card.sinLabel,
    level: "basic", levelLabel: "基础", trait: "attack", traitLabel: "攻击",
    baseDamage: null, hits: 1, clashAttr: card.clashAttr, stats: null,
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

/* ---------- 卡片分类 ----------
   出牌路径按特性分流。分错的后果很实际：把不拼点的卡塞进攻击结算，
   baseDamage 为 null 会被当成 0，于是「弃牌回血」的卡凭空打出伤害。 */
const CARD_KIND = {
  attack: "attack", multiAttack: "attack",
  defense: "reaction", shield: "reaction", counter: "reaction",
  buff: "ally", support: "ally",
  debuff: "foe",
  special: "self"
};
const KIND_LABEL = {
  attack: "主动攻击", reaction: "接线", ally: "增益友方", foe: "削弱敌人", self: "操作卡组"
};
const kindOf = (c) => CARD_KIND[c.trait] || "self";

/* ---------- 阵亡与退场 ----------
   清理统一放在一步操作全部结算完之后，好让玩家能预判这一步的完整结果——
   多重攻击的第二击照样打在已经归零的目标上，打完才一起清场。
     敌人 HP 归零 → 直接从列表移除，相邻关系随之重算
     我方 HP 归零 → 退场：不进聚光灯、不能接线、不再被意图指向，
                   但保留在名单上，GM 直接改 HP 就能让他回来 */
const downed = (p) => p.hp <= 0;
const activePlayers = () => state.players.filter(p => !downed(p));

function reapDefeated() {
  const lines = [];
  const dead = state.enemies.filter(e => e.hp <= 0);
  if (dead.length) {
    state.enemies = state.enemies.filter(e => e.hp > 0);
    lines.push(`※ ${dead.map(e => e.name).join("、")} 被击倒，退出战场`);
    const gone = (id) => dead.some(e => e.id === id);
    if (pending && gone(pending.enemyId)) { pending.enemyId = null; pending.intentId = null; }
    if (pending && gone(pending.extraFoeId)) pending.extraFoeId = null;
    if (state.duel && gone(state.duel.enemyId)) state.duel = null;
  }
  for (const p of state.players) {
    if (downed(p) && !p.down) { p.down = true; lines.push(`※ ${p.name} 已倒下，退出行动`); }
    else if (!downed(p) && p.down) { p.down = false; lines.push(`※ ${p.name} 重新站起`); }
  }
  const spot = state.players.find(x => x.id === state.spot);
  if (spot && downed(spot)) { state.spot = null; pending = null; }
  // 打向已倒下的人的意图要改指还站着的，否则会卡在无法结算的目标上
  const alive = activePlayers();
  state.enemies.forEach(e => e.intents.forEach(i => {
    if (i.type !== "attack" || !i.targetId) return;
    const t = state.players.find(x => x.id === i.targetId);
    if (t && downed(t)) {
      i.targetId = alive.length ? alive[0].id : null;
      if (alive.length) lines.push(`※ ${e.name} 的攻击改指向 ${alive[0].name}`);
    }
  }));
  return lines;
}

/* 行动槽用完 = 这个角色本回合的常规行动结束。接线是额外的，不看这个 */
const playerDone = (p) => p.slotUsed >= p.slots.length;
const allPlayersDone = () => activePlayers().length > 0 && activePlayers().every(playerDone);
/* 场上所有还没被接下的敌方攻击意图 */
function liveIntents() {
  const o = [];
  state.enemies.forEach(e => liveAttackIntents(e).forEach(i => o.push({ e, i })));
  return o;
}
const canIntercept = (p) => p.interceptRound !== state.round && liveIntents().length > 0;
/* 老存档没有 stats 字段（建卡器补结构化数值之前导出的），退回手动结算 */
const statsOf = (c) => c.stats || null;

/* ---------- 派生 ---------- */
/* 混乱线：随当前 HP 实时判定，治疗回线上即解除 */
function panicPenalty(p) {
  if (p.hp <= Math.floor(p.maxHp * 0.25)) return -2;
  if (p.hp <= Math.floor(p.maxHp * 0.5)) return -1;
  return 0;
}
/* 一次拼点的全部加值来源。逐项列出，界面上直接展示，避免玩家不知道数字怎么来的 */
function clashParts(p, card) {
  const parts = [];
  const attr = card.clashAttr;
  if (attr) parts.push({ label: `${attr}(${p.attrs[attr] ?? 0})`, v: p.attrs[attr] ?? 0 });
  const gid = groupIdOfCard(p, card);
  const mode = gid ? p.groups[gid].mode : null;
  if (mode?.数值?.dice) parts.push({ label: `${mode.模式}模式`, v: mode.数值.dice });
  if (p.clashMod) parts.push({ label: "手动修正", v: p.clashMod });
  if (p.roundDice) parts.push({ label: "本轮增益", v: p.roundDice });
  const pen = panicPenalty(p);
  if (pen) parts.push({ label: "混乱线", v: pen });
  return parts;
}
const sumParts = (parts) => parts.reduce((a, b) => a + b.v, 0);
const partsText = (parts) => parts.map(x => `${x.label}${x.v >= 0 ? "+" : ""}${x.v}`).join(" ");
/* 本轮生效的意图值 = 基础值 + 手动修正 - 减益卡压下来的部分 */
const intentValue = (e, i) => i.value + (e.clashMod || 0) - (e.roundIntentMod || 0);
/* 敌方本轮实际打出的基础伤害：被「造成的伤害 -N」压过 */
const foeDamageOut = (e, raw) => Math.max(0, raw - (e.roundDmgDealt || 0));

/* ---------- 伤害与治疗（我方敌方通用） ---------- */
/* 所有伤害先扣临时生命，再扣 HP */
function applyDamage(u, amount) {
  const dmg = Math.max(0, amount);
  const absorbed = Math.min(u.temp || 0, dmg);
  u.temp = (u.temp || 0) - absorbed;
  u.hp = clamp(u.hp - (dmg - absorbed), 0, u.maxHp);
  return { dmg, absorbed };
}
function applyHeal(u, amount) {
  const before = u.hp;
  u.hp = clamp(u.hp + amount, 0, u.maxHp);
  return u.hp - before;
}
/* 打我方：先扣掉本轮减伤 */
function damagePlayer(p, amount) {
  const cut = Math.min(amount, p.roundDmgDown || 0);
  return { ...applyDamage(p, amount - cut), cut };
}
/* 打敌人：先叠上它本轮「受到的伤害 +N」，再走通用扣血 */
function damageFoe(enemy, amount) {
  const bonus = enemy.roundDmgTaken || 0;
  const r = applyDamage(enemy, amount + bonus);
  return { ...r, bonus };
}
/* 满血时治疗会归零，日志要说清楚是「无效果」而不是干巴巴的「恢复 0 HP」 */
function healLine(u, amount) {
  const h = applyHeal(u, amount);
  return h ? `${u.name} 恢复 ${h} HP（${u.hp}/${u.maxHp}）`
           : `${u.name} 已满血，${amount} 点治疗无效果`;
}

/* ---------- 问答特效：按 scope 结算 ----------
   建卡器给每个问答选项挂了 stats（见 SIN_TRAIT_QA 的注释）。没有 stats 的是条件类，
   继续走「需自行结算」。scope 决定这条效果落在谁身上。 */
const SCOPE_LABEL = {
  target: "目标", adjOne: "相邻的一名敌人", adjAll: "相邻的所有敌人",
  otherAll: "其他所有敌人", allFoes: "所有敌人",
  self: "自己", guarded: "被庇护的友方", oneAlly: "一名友方",
  selfAndAlly: "你和一名友方", allAllies: "所有友方"
};
/* 相邻 = 敌人列表里紧挨着的上下两个，站位用列表顺序表示，可用 ↑↓ 调整 */
function adjacentFoes(foe) {
  const k = state.enemies.findIndex(e => e.id === foe?.id);
  if (k < 0) return [];
  return [state.enemies[k - 1], state.enemies[k + 1]].filter(Boolean);
}
/* 哪些 scope 需要玩家再指一个对象 */
const needsExtraFoe = (st) => st?.scope === "adjOne";
const needsExtraAlly = (st) => st?.scope === "oneAlly" || st?.scope === "selfAndAlly";
/* 卡上所有带 stats 的问答条目 */
const qaStats = (card) => (card.qa || []).filter(q => q.stats);

/* 解析 scope → 实际对象列表 */
function scopeTargets(st, { player, foe, extraFoe, extraAlly, guarded }) {
  switch (st.scope) {
    case "target": return foe ? [foe] : (extraFoe ? [extraFoe] : []);
    case "adjOne": return extraFoe ? [extraFoe] : [];
    case "adjAll": return adjacentFoes(foe || extraFoe);
    case "otherAll": return state.enemies.filter(e => e.id !== (foe || extraFoe)?.id);
    case "allFoes": return state.enemies.slice();
    case "self": return [player];
    case "guarded": return guarded ? [guarded] : [];
    case "oneAlly": return extraAlly ? [extraAlly] : [];
    case "selfAndAlly": return extraAlly ? [player, extraAlly] : [];
    case "allAllies": return state.players.slice();
    default: return foe ? [foe] : [player];
  }
}

/* 「本次」类字段只作用于这张卡的这一次结算，不进本轮状态——
   它们在投骰前就要折进拼点与伤害里，所以单独汇总，不走 applyQaStat。 */
function thisCardMods(card) {
  let dice = 0, damage = 0, intentDown = 0;
  for (const q of qaStats(card)) {
    dice += q.stats.thisDice || 0;
    damage += q.stats.thisDamage || 0;
    intentDown += q.stats.thisIntentDown || 0;
  }
  return { dice, damage, intentDown };
}
/* 接线卡的问答特效也有胜负分支，形状与 CARD_BASE_STATS 的 win/lose 一致 */
function qaBranch(card, win) {
  return qaStats(card).map(q => ({ label: q.label, br: win ? q.stats.win : q.stats.lose }))
    .filter(x => x.br);
}

/* 结算一条问答特效，返回日志行。opts.hit 用于门控「命中时」类效果 */
function applyQaStat(q, ctx, opts = {}) {
  const st = q.stats, lines = [];
  if (st.onHit && !opts.hit) return [];      // 未命中，这条不触发
  const units = scopeTargets(st, ctx);
  for (const u of units) {
    if (st.damage) {
      // 敌我通用：打敌人要叠它本轮的易伤
      const r = state.enemies.includes(u) ? damageFoe(u, st.damage) : applyDamage(u, st.damage);
      lines.push(`${u.name} 受到 ${r.dmg} 点伤害${r.absorbed ? `（临时生命吸收 ${r.absorbed}）` : ""}，剩余 ${u.hp}/${u.maxHp}`);
    }
    if (st.intentDown) { u.roundIntentMod = (u.roundIntentMod || 0) + st.intentDown; lines.push(`${u.name} 本轮意图值 -${st.intentDown}`); }
    if (st.dmgTakenUp) { u.roundDmgTaken = (u.roundDmgTaken || 0) + st.dmgTakenUp; lines.push(`${u.name} 本轮受到的伤害 +${st.dmgTakenUp}`); }
    if (st.dmgDealtDown) { u.roundDmgDealt = (u.roundDmgDealt || 0) + st.dmgDealtDown; lines.push(`${u.name} 本轮造成的伤害 -${st.dmgDealtDown}`); }
    if (st.dmgTakenDown) { u.roundDmgDown = (u.roundDmgDown || 0) + st.dmgTakenDown; lines.push(`${u.name} 本轮受到的伤害 -${st.dmgTakenDown}`); }
    if (st.diceUp) { u.roundDice = (u.roundDice || 0) + st.diceUp; lines.push(`${u.name} 本轮拼点骰 +${st.diceUp}`); }
    if (st.heal) lines.push(healLine(u, st.heal));
    if (st.temp) { u.temp = (u.temp || 0) + st.temp; lines.push(`${u.name} 获得 ${st.temp} 点临时生命`); }
    if (st.pressure) { u.pressure = Math.max(0, (u.pressure || 0) + st.pressure); lines.push(`${u.name} 罪孽压力 ${st.pressure > 0 ? "+" : ""}${st.pressure}（${u.pressure}/${u.pressureCap}）`); }
  }
  // 自伤 / 自身压力恒落在打出者身上，与 scope 无关
  if (st.selfPressure) {
    ctx.player.pressure = Math.max(0, (ctx.player.pressure || 0) + st.selfPressure);
    lines.push(`${ctx.player.name} 罪孽压力 ${st.selfPressure > 0 ? "+" : ""}${st.selfPressure}（${ctx.player.pressure}/${ctx.player.pressureCap}）`);
  }
  if (st.selfDamage) {
    const r = applyDamage(ctx.player, st.selfDamage);
    lines.push(`${ctx.player.name} 受到 ${r.dmg} 点伤害${r.absorbed ? `（临时生命吸收 ${r.absorbed}）` : ""}，剩余 ${ctx.player.hp}/${ctx.player.maxHp}`);
  }
  // 只有「本次」类字段的条目（thisDamage 等）已在拼点里折算过，这里不该再报未结算
  const onlyThisCard = !st.scope && !st.selfDamage && !st.selfPressure && !st.win && !st.lose;
  if (!units.length && !st.selfDamage && !st.selfPressure && !onlyThisCard)
    lines.push(`（${SCOPE_LABEL[st.scope] || "对象"}未指定，本条未结算）`);
  return lines.map(x => `  ▸ ${q.label}：${x}`);
}
/* 依次结算一张卡的全部问答特效 */
function applyAllQa(card, ctx, opts = {}) {
  return qaStats(card).flatMap(q => applyQaStat(q, ctx, opts));
}

/* ---------- 敌人与意图 ---------- */
const INTENT_TYPES = {
  attack: { label: "攻击", desc: "可拼点；被拼过一次即结算，无论我方成败" },
  buff: { label: "增益", desc: "敌方强化自身——用「意图修正」手动体现" },
  debuff: { label: "减益", desc: "削弱我方——用角色的「拼点修正」手动体现" }
};
const liveAttackIntents = (e) => e.intents.filter(i => i.type === "attack" && !i.resolved);

/* 敌方攻击的基础伤害是 XdY+Z，每次结算现掷。
   dmgN 个 dmgFaces 面骰，再加 dmgFlat 的固定值。 */
function newIntent() {
  return {
    id: uid(), type: "attack", value: 7,
    dmgN: 1, dmgFaces: 6, dmgFlat: 2,
    note: "", resolved: false, targetId: null
  };
}
const dmgSpec = (i) => `${i.dmgN}d${i.dmgFaces}${i.dmgFlat ? (i.dmgFlat > 0 ? "+" : "") + i.dmgFlat : ""}`;
const dmgAvg = (i) => i.dmgN * (i.dmgFaces + 1) / 2 + i.dmgFlat;
const dmgMin = (i) => i.dmgN + i.dmgFlat;
const dmgMax = (i) => i.dmgN * i.dmgFaces + i.dmgFlat;
function rollDamage(i) {
  const rolls = [];
  for (let k = 0; k < i.dmgN; k++) rolls.push(1 + Math.floor(Math.random() * i.dmgFaces));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + i.dmgFlat };
}
/* 掷骰过程写进日志，免得玩家不知道那个数字从哪来 */
const dmgText = (i, r) => `${dmgSpec(i)} → [${r.rolls.join(", ")}]${i.dmgFlat ? `${i.dmgFlat > 0 ? "+" : ""}${i.dmgFlat}` : ""} = ${r.total}`;
function newEnemy() {
  return {
    id: uid(), name: "敌人" + (state.enemies.length + 1),
    maxHp: 20, hp: 20, temp: 0, clashMod: 0,
    roundIntentMod: 0,     // 本轮被减益卡压低的意图值，回合结束清零
    roundDmgTaken: 0,      // 本轮受到的伤害 +N（「加深」一类）
    roundDmgDealt: 0,      // 本轮造成的伤害 -N（「力量」一类）
    // 默认带一条攻击意图：没有意图的敌人只能被单方面攻击，拼点流程根本用不上
    intents: [newIntent()]
  };
}

/* ---------- 结算：我方攻击 ---------- */
/* bonusDamage / dcDown 来自问答特效的「本次伤害 +N」「本次意图值 -N」，
   拼点骰的「本次 +N」已经在调用处折进 mod 里了 */
function resolveAttack({ card, mod, modeStats, enemy, intent, roll, bonusDamage = 0, dcDown = 0 }) {
  const base = card.baseDamage ?? 0;
  if (!intent) {
    // 单方面：自动命中，差值 = 拼点值
    const clashVal = roll + mod;
    return { oneSided: true, hit: true, roll, clashVal, dc: null, margin: clashVal, damage: base + clashVal + bonusDamage };
  }
  const dc = Math.max(0, intentValue(enemy, intent) - dcDown);
  const clashVal = roll + mod;
  const hit = clashVal >= dc;
  const margin = hit ? clashVal - dc : 0;
  let damage = hit ? base + margin + bonusDamage : 0;
  // 攻击模式副效果：打击胜利加伤，突刺失败保底
  if (hit && modeStats?.winDamage) damage += modeStats.winDamage;
  if (!hit && modeStats?.loseDamage) damage = modeStats.loseDamage;
  return { oneSided: false, hit, roll, clashVal, dc, margin, damage };
}

/* ---------- 结算：接线 ----------
   who = 打出接线卡的角色，target = 攻击指向的角色（援护时二者不同） */
function resolveIntercept({ who, target, card, mod, enemy, intent, roll, dmgRoll, dcDown = 0 }) {
  const st = statsOf(card);
  const dc = Math.max(0, intentValue(enemy, intent) - dcDown);
  const clashVal = roll + mod;
  const win = clashVal >= dc;
  const margin = win ? clashVal - dc : 0;
  // 接线失败时按「基础伤害 + (意图值 - 拼点值)」计，与未接线公式同形
  const base = foeDamageOut(enemy, dmgRoll.total);
  const incoming = Math.max(0, base + (dc - clashVal));
  const lines = [];
  lines.push(`1D6=${roll} → 拼点值 ${clashVal} 对 意图值 ${dc} → ${win ? "接线成功" : "接线失败"}`);
  if (!win) lines.push(`敌方基础伤害 ${dmgText(intent, dmgRoll)}${
    enemy.roundDmgDealt ? ` − 本轮削弱 ${enemy.roundDmgDealt} = ${base}` : ""}，加上差距 ${dc - clashVal} → ${incoming} 点`);

  if (!st) {   // 老存档没有结构化数值，只报拼点结果，效果交给 GM
    lines.push("该卡缺少结构化数值（存档由旧版建卡器导出），胜负已判定，效果请手动结算");
    return { win, clashVal, dc, margin, lines };
  }

  const br = win ? st.win : st.lose;

  // 反击大技能：先把临时生命换成伤害
  let counterBase = 0;
  if (st.consumeTemp) {
    const converted = Math.min(who.temp || 0, st.tempCap ?? 0);
    counterBase = (st.base ?? 0) + converted;
    lines.push(`消耗全部临时生命 ${who.temp}（其中 ${converted} 点转化为伤害），本次基础伤害 ${counterBase}`);
    who.temp = 0;
  }
  // 援护大技能：弃掉本组其余卡片换临时生命
  if (st.discardRest) {
    const g = p_group(who, card);
    const rest = availableCards(g).filter(c => c.uid !== card.uid);
    rest.forEach(c => consumeCard(g, c));
    const gain = rest.length * (st.tempPerDiscard ?? 0);
    who.temp = (who.temp || 0) + gain;
    lines.push(`弃掉本组其余 ${rest.length} 张卡，获得 ${gain} 点临时生命`);
  }

  // 无胜负条件的问答特效先结算——加壳类要在挨打之前生效才有意义
  for (const q of qaStats(card)) {
    if (q.stats.win || q.stats.lose) continue;
    lines.push(...applyQaStat(q, { player: who, foe: enemy, guarded: target }, { hit: win }));
  }

  if (win) {
    if (br.block) lines.push(`完全格挡，${esc(target.name)} 不受伤害`);
    if (br.allySafe) lines.push(`${esc(target.name)} 不受伤害`);
    if (br.temp) { who.temp = (who.temp || 0) + br.temp; lines.push(`${esc(who.name)} 获得 ${br.temp} 点临时生命`); }
    if (br.damage) {
      const r = damageFoe(enemy, br.damage);
      lines.push(`对 ${esc(enemy.name)} 造成 ${r.dmg} 点伤害${r.bonus ? `（含本轮易伤 ${r.bonus}）` : ""}${r.absorbed ? `（临时生命吸收 ${r.absorbed}）` : ""}`);
    }
    if (br.damagePlusMargin) {
      const dmg = counterBase + margin;
      const r = damageFoe(enemy, dmg);
      lines.push(`反击造成 ${r.dmg} 点伤害（基础 ${counterBase} + 差值 ${margin}${r.bonus ? ` + 易伤 ${r.bonus}` : ""}）${r.absorbed ? `（吸收 ${r.absorbed}）` : ""}`);
    }
  } else {
    // 谁来承受这次伤害：援护是打出者替目标挡，其余是目标自己挨
    const victim = br.takeForAlly ? who : target;
    if (br.takeForAlly) lines.push(`${esc(who.name)} 替 ${esc(target.name)} 承受伤害`);
    const r = damagePlayer(victim, incoming);
    lines.push(`${esc(victim.name)} 受到 ${r.dmg} 点伤害${r.cut ? `（本轮减伤 ${r.cut}）` : ""}${r.absorbed ? `（临时生命吸收 ${r.absorbed}）` : ""}，剩余 ${victim.hp}/${victim.maxHp}`);
    // 失败分支的补偿归实际挨打的那个人——替别人挡没挡住，回血自然应该给他
    if (br.temp) { victim.temp = (victim.temp || 0) + br.temp; lines.push(`${esc(victim.name)} 获得 ${br.temp} 点临时生命`); }
    if (br.heal) lines.push(healLine(victim, br.heal));
    if (br.damageHalf) {
      const r2 = damageFoe(enemy, Math.floor(counterBase / 2));
      lines.push(`仍对 ${esc(enemy.name)} 造成 ${r2.dmg} 点伤害（基础伤害的一半${r2.bonus ? ` + 易伤 ${r2.bonus}` : ""}）${r2.absorbed ? `（吸收 ${r2.absorbed}）` : ""}`);
    }
  }

  // 问答特效的胜负分支：damage 打攻击者，heal/temp 给挨打的那个人
  const victim = (!win && br.takeForAlly) ? who : (win ? who : target);
  for (const { label, br: qb } of qaBranch(card, win)) {
    if (qb.damage) {
      const r = damageFoe(enemy, qb.damage);
      lines.push(`  ▸ ${label}：对 ${esc(enemy.name)} 造成 ${r.dmg} 点伤害${r.absorbed ? `（吸收 ${r.absorbed}）` : ""}`);
    }
    if (qb.temp) { victim.temp = (victim.temp || 0) + qb.temp; lines.push(`  ▸ ${label}：${esc(victim.name)} 获得 ${qb.temp} 点临时生命`); }
    if (qb.heal) lines.push(`  ▸ ${label}：${healLine(victim, qb.heal)}`);
    if (qb.pressure) { victim.pressure = Math.max(0, (victim.pressure || 0) + qb.pressure); lines.push(`  ▸ ${label}：${esc(victim.name)} 罪孽压力 ${qb.pressure > 0 ? "+" : ""}${qb.pressure}`); }
  }

  // 【切换】结算后换到另一组
  if (st.thenSwitch) {
    const gid = groupIdOfCard(who, card), other = gid === "a" ? "b" : "a";
    who.slots.forEach(sl => { if (sl.group === gid) sl.group = other; });
    lines.push(`【切换】使用 ${gid.toUpperCase()}组 的槽位已切换到 ${other.toUpperCase()}组`);
  }
  return { win, clashVal, dc, margin, lines };
}
/* resolveIntercept 里要按卡找组，抽出来避免和 groupOf(玩家,槽位) 混淆 */
function p_group(p, card) { return p.groups[groupIdOfCard(p, card)]; }

/* ---------- 渲染：场上单位 ---------- */
const expanded = new Set();

const hpBar = (cur, max, temp, cls) => `
  <div class="bar${cls ? " " + cls : ""}"><i style="width:${clamp(cur / max * 100, 0, 100)}%"></i>
    <span>${cur} / ${max}${temp ? ` (+${temp})` : ""}</span></div>`;

const numField = (label, kind, id, field, value, attrs = "") => `
  <label class="ustat"><span>${label}</span>
    <input type="number" data-${kind}="${field}" data-id="${id}" value="${value}" ${attrs}></label>`;

function renderRound() {
  $("roundNo").textContent = state.round;
  const total = state.players.length;
  const done = state.players.filter(playerDone).length;
  const live = liveIntents().length;
  $("roundTally").textContent = !total ? ""
    : allPlayersDone()
      ? (live ? `所有人已行动 · ${live} 条攻击意图没人接线` : "所有人已行动 · 敌方攻击已清空")
      : `${done} / ${total} 人已行动完${live ? ` · ${live} 条敌方攻击意图待处理` : ""}`;
}

function renderPlayers() {
  if (!state.players.length) {
    $("players").innerHTML = `<p class="empty">尚未导入角色。<br>用建卡器的「导出 JSON」得到文件。</p>`; return;
  }
  $("players").innerHTML = state.players.map(p => {
    const acted = p.actedRound === state.round;
    const finished = acted && p.slotUsed >= p.slots.length;
    const open = expanded.has(p.id);
    const pen = panicPenalty(p);
    return `
    <div class="unit${state.spot === p.id ? " on" : ""}">
      <div class="unit-head">
        <b>${esc(p.name)}</b>
        <span class="unit-tag${downed(p) ? " dead" : finished ? " done" : ""}">${
          downed(p) ? "已倒下" : acted ? `已行动 ${p.slotUsed}/${p.slots.length}` : "待行动"}</span>
      </div>
      ${hpBar(p.hp, p.maxHp, p.temp)}
      <div class="unit-flags">
        ${pen ? `<span class="ptag warn">混乱线 拼点骰${pen}</span>` : ""}
        ${p.roundDice ? `<span class="ptag">本轮拼点骰 +${p.roundDice}</span>` : ""}
        ${p.roundDmgDown ? `<span class="ptag dmg">本轮受伤 -${p.roundDmgDown}</span>` : ""}
        ${p.interceptRound === state.round ? `<span class="ptag mute">本轮已接线</span>` : ""}
      </div>
      <div class="unit-stats">
        ${numField("HP", "pf", p.id, "hp", p.hp)}
        ${numField("临时生命", "pf", p.id, "temp", p.temp)}
        ${numField(`压力 / ${p.pressureCap}`, "pf", p.id, "pressure", p.pressure)}
      </div>
      <div class="unit-foot">
        <span class="unit-deck">${["a", "b"].map(g =>
      `${g.toUpperCase()}组 ${availableCards(p.groups[g]).length}/${p.groups[g].cards.length} 张`).join(" · ")}</span>
        <button class="btn ghost mini" data-deck="${p.id}">🂠 卡组</button>
        <button class="btn ghost mini" data-adv="${p.id}">${open ? "⚙ 收起" : "⚙ 调整"}</button>
      </div>
      ${open ? `
      <div class="unit-adv">
        <div class="unit-stats">
          ${numField("拼点修正", "pf", p.id, "clashMod", p.clashMod)}
          ${numField("本轮增益骰", "pf", p.id, "roundDice", p.roundDice)}
          ${numField("槽位数", "pf", p.id, "slotCount", p.slots.length, 'min="1" max="4"')}
        </div>
        <div class="unit-stats">
          ${p.slots.map((sl, i) => `<label class="ustat"><span>槽 ${i + 1} 用哪组</span>
            <select data-slot="${i}" data-id="${p.id}">
              <option value="a"${sl.group === "a" ? " selected" : ""}>A组 ${esc(p.groups.a.mode?.模式 || "")}</option>
              <option value="b"${sl.group === "b" ? " selected" : ""}>B组 ${esc(p.groups.b.mode?.模式 || "")}</option>
            </select></label>`).join("")}
        </div>
        <p class="hint">混乱线与攻击模式加成已自动计入拼点，不要重复填。</p>
      </div>` : ""}
    </div>`;
  }).join("");

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
  $("players").querySelectorAll("[data-adv]").forEach(el => el.onclick = () => {
    const id = +el.dataset.adv;
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    renderAll();
  });
  $("players").querySelectorAll("[data-deck]").forEach(el => el.onclick = () => {
    deckView = deckView === +el.dataset.deck ? null : +el.dataset.deck;
    renderAll();
  });
}

/* 卡组浏览 / 手动弃牌。规则里有十几条「弃掉N张」的效果，
   问答特效是自然语言、只能手动结算，所以必须给一个真的能弃牌的入口。 */
let deckView = null;
function renderDeck() {
  const p = state.players.find(x => x.id === deckView);
  if (!p) { $("deckCard").hidden = true; return; }
  $("deckCard").hidden = false;
  $("deckTitle").textContent = `${p.name} 的卡组`;
  $("deckBody").innerHTML = ["a", "b"].map(gid => {
    const g = p.groups[gid];
    return `<div class="spot-sec">
      <h3>${gid.toUpperCase()}组 · ${esc(g.mode?.模式 || "未设定模式")} · 可用 ${availableCards(g).length}/${g.cards.length}</h3>
      <div class="card-pick">${g.cards.map(c => {
        const used = g.used.includes(c.uid);
        return `<div class="pick${used ? " spent" : ""}">
          <b>${esc(c.sinLabel)} · ${esc(c.traitLabel)}</b>
          <small>${esc(c.levelLabel)} · ${KIND_LABEL[kindOf(c)]}${c.addedBy ? ` · 由${esc(c.addedBy)}追加` : ""}</small>
          <div class="pick-tags">
            ${used ? `<span class="ptag mute">已消耗</span>`
                   : `<button class="btn ghost mini" data-discard="${c.uid}" data-pid="${p.id}" data-gid="${gid}">弃掉</button>`}
          </div>
          <div class="pick-eff">${esc(c.effects[0] || "")}</div>
        </div>`;
      }).join("")}</div>
    </div>`;
  }).join("");

  $("deckBody").querySelectorAll("[data-discard]").forEach(el => el.onclick = () => {
    const pp = state.players.find(x => x.id === +el.dataset.pid);
    const g = pp.groups[el.dataset.gid];
    const c = g.cards.find(x => x.uid === +el.dataset.discard);
    const refreshed = consumeCard(g, c);
    pushLog(`${pp.name} 弃掉「${c.sinLabel}·${c.traitLabel}」`,
      [`${el.dataset.gid.toUpperCase()}组 剩余 ${availableCards(g).length}/${g.cards.length} 张`]
        .concat(refreshed ? ["※ 该组已用完，卡组刷新"] : []));
    renderAll();
  });
}

function renderEnemies() {
  if (!state.enemies.length) {
    $("enemies").innerHTML = `<p class="empty">尚未添加敌人。<br>点右上角「＋ 新增」，新敌人默认带一条攻击意图。</p>`;
    return;
  }
  const playerOpts = (sel) => activePlayers().map(p =>
    `<option value="${p.id}"${sel === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  $("enemies").innerHTML = state.enemies.map((e, idx) => {
    const open = expanded.has(e.id);
    return `
    <div class="unit foe">
      <div class="unit-head">
        <span class="foe-pos" title="站位：上下相邻的敌人算「相邻」">${idx + 1}</span>
        <input class="name-input" data-ef="name" data-id="${e.id}" value="${esc(e.name)}">
        <button class="btn ghost mini" data-move="${e.id}" data-dir="-1" ${idx === 0 ? "disabled" : ""} title="上移">↑</button>
        <button class="btn ghost mini" data-move="${e.id}" data-dir="1" ${idx === state.enemies.length - 1 ? "disabled" : ""} title="下移">↓</button>
        <button class="btn ghost mini" data-del="${e.id}" title="删除这个敌人">✕</button>
      </div>
      ${hpBar(e.hp, e.maxHp, e.temp, "foe")}
      ${(e.roundIntentMod || e.roundDmgTaken || e.roundDmgDealt) ? `<div class="unit-flags">
        ${e.roundIntentMod ? `<span class="ptag">本轮意图值 -${e.roundIntentMod}</span>` : ""}
        ${e.roundDmgTaken ? `<span class="ptag warn">本轮受到伤害 +${e.roundDmgTaken}</span>` : ""}
        ${e.roundDmgDealt ? `<span class="ptag dmg">本轮造成伤害 -${e.roundDmgDealt}</span>` : ""}
      </div>` : ""}
      <div class="unit-stats">
        ${numField("HP", "ef", e.id, "hp", e.hp)}
        ${numField("上限", "ef", e.id, "maxHp", e.maxHp)}
        ${numField("临时生命", "ef", e.id, "temp", e.temp)}
      </div>
      <div class="intents">
        ${e.intents.map(i => `
          <div class="intent i-${i.type}${i.resolved ? " done" : ""}">
            <div class="intent-row">
              <select data-if="type" data-eid="${e.id}" data-iid="${i.id}" title="${INTENT_TYPES[i.type].desc}">
                ${Object.entries(INTENT_TYPES).map(([k, v]) => `<option value="${k}"${i.type === k ? " selected" : ""}>${v.label}</option>`).join("")}
              </select>
              ${i.type === "attack" ? `
                <label class="ilab">意图值<input type="number" class="iv" data-if="value" data-eid="${e.id}" data-iid="${i.id}" value="${i.value}" title="拼点值 ≥ 它才算接线成功"></label>
                <span class="ilab dice" title="基础伤害：命中我方时现掷">伤害
                  <input type="number" class="iv sm" data-if="dmgN" data-eid="${e.id}" data-iid="${i.id}" value="${i.dmgN}" min="1" max="10">d<input
                         type="number" class="iv sm" data-if="dmgFaces" data-eid="${e.id}" data-iid="${i.id}" value="${i.dmgFaces}" min="2" max="100">+<input
                         type="number" class="iv sm" data-if="dmgFlat" data-eid="${e.id}" data-iid="${i.id}" value="${i.dmgFlat}">
                  <b class="dice-range">${dmgMin(i)}~${dmgMax(i)} 均${dmgAvg(i).toFixed(1)}</b></span>` : ""}
              ${i.resolved ? `<span class="pill rej">已结算</span>` : ""}
              <button class="btn ghost mini" data-delint="${i.id}" data-eid="${e.id}">✕</button>
            </div>
            <div class="intent-row">
              ${i.type === "attack" && state.players.length ? `<label class="ilab">打向
                <select data-if="targetId" data-eid="${e.id}" data-iid="${i.id}">${playerOpts(i.targetId)}</select></label>` : ""}
              <input class="inote" data-if="note" data-eid="${e.id}" data-iid="${i.id}" value="${esc(i.note)}" placeholder="备注">
            </div>
          </div>`).join("") || `<p class="hint">没有意图——我方攻击此敌人将是单方面攻击（自动命中，差值 = 拼点值）</p>`}
      </div>
      <div class="unit-foot">
        <button class="btn ghost mini" data-addint="${e.id}">＋ 意图</button>
        <button class="btn ghost mini" data-adv="${e.id}">${open ? "⚙ 收起" : "⚙ 调整"}</button>
      </div>
      ${open ? `
      <div class="unit-adv">
        <div class="unit-stats">${numField("意图修正", "ef", e.id, "clashMod", e.clashMod)}</div>
        <p class="hint">增益意图让敌人更难打时把加值填这里；减益卡压下来的部分已自动计入，不用重复填。</p>
      </div>` : ""}
    </div>`;
  }).join("");

  const find = (el) => state.enemies.find(x => x.id === +el.dataset.id || x.id === +el.dataset.eid);
  $("enemies").querySelectorAll("[data-ef]").forEach(el => el.onchange = () => {
    const e = find(el); if (!e) return;
    e[el.dataset.ef] = el.dataset.ef === "name" ? el.value : (+el.value || 0);
    renderAll();
  });
  $("enemies").querySelectorAll("[data-if]").forEach(el => el.onchange = () => {
    const e = find(el); const i = e.intents.find(x => x.id === +el.dataset.iid);
    const f = el.dataset.if;
    if (f === "note" || f === "type") i[f] = el.value;
    else if (f === "dmgN") i.dmgN = clamp(Math.round(+el.value) || 1, 1, 10);       // 0 个骰子没有意义
    else if (f === "dmgFaces") i.dmgFaces = clamp(Math.round(+el.value) || 6, 2, 100);
    else i[f] = Math.round(+el.value) || 0;
    renderAll();
  });
  $("enemies").querySelectorAll("[data-addint]").forEach(el => el.onclick = () => {
    state.enemies.find(x => x.id === +el.dataset.addint).intents.push(newIntent());
    renderAll();
  });
  $("enemies").querySelectorAll("[data-delint]").forEach(el => el.onclick = () => {
    const e = find(el); e.intents = e.intents.filter(x => x.id !== +el.dataset.delint); renderAll();
  });
  $("enemies").querySelectorAll("[data-del]").forEach(el => el.onclick = () => {
    state.enemies = state.enemies.filter(x => x.id !== +el.dataset.del); renderAll();
  });
  $("enemies").querySelectorAll("[data-move]").forEach(el => el.onclick = () => {
    if (el.disabled) return;
    const k = state.enemies.findIndex(x => x.id === +el.dataset.move);
    const to = k + (+el.dataset.dir);
    if (to < 0 || to >= state.enemies.length) return;
    [state.enemies[k], state.enemies[to]] = [state.enemies[to], state.enemies[k]];
    renderAll();
  });
  $("enemies").querySelectorAll("[data-adv]").forEach(el => el.onclick = () => {
    const id = +el.dataset.adv;
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    renderAll();
  });
}

/* ============ 我方回合：聚光灯四步 ============ */
let pending = null;   // {playerId, slotIdx, cardUid, enemyId, intentId, allyId, discard:[]}

const FLOW_HINTS = {
  1: "点一张角色卡让他进入聚光灯。",
  2: "挑一张卡打出。防御 / 援护 / 反击是接线卡——不占行动槽，每轮限接一次。",
  attack3: "先选敌人，再选要对抗它的哪一条攻击意图。",
  attack4: "核对下方预览，然后投骰；也可以手填骰值代替随机。",
  reaction3: "选一条要接下的敌方攻击。可以接打向自己的，也可以替别人挡下来。",
  reaction4: "核对成功率后投骰。接线不占行动槽，接完还能正常出牌。",
  ally3: "选一个受益者：自己或任意一名友方。",
  ally4: "确认收益后打出。这类卡不拼点，打出即生效。",
  foe3: "选一个要削弱的敌人。",
  foe4: "确认后打出。这类卡不拼点，打出即生效。",
  self3: "勾选要弃掉的牌——弃牌会加速本组循环。",
  self4: "确认后打出。"
};
function flowLabels(kind) {
  if (kind === "reaction") return ["选择角色", "选择卡片", "选择要接的攻击", "投骰接线"];
  if (kind === "ally") return ["选择角色", "选择卡片", "选择受益者", "确认打出"];
  if (kind === "foe") return ["选择角色", "选择卡片", "选择敌人", "确认打出"];
  if (kind === "self") return ["选择角色", "选择卡片", "选择要弃的牌", "确认打出"];
  return ["选择角色", "选择卡片", "选择目标", "投骰结算"];
}
const currentSel = () => (pending && pending.playerId === state.spot ? pending : null);

function spotStep() {
  const p = state.players.find(x => x.id === state.spot);
  // 行动槽用完的角色仍可留在聚光灯里接线，所以不能只看 playerDone
  if (!p || (playerDone(p) && !canIntercept(p))) return 1;
  const sel = currentSel();
  if (!sel || !sel.cardUid) return 2;
  const card = findCard(p, sel.cardUid);
  if (!card) return 2;
  const kind = kindOf(card);
  if (kind === "attack") return sel.enemyId && extrasReady(card, sel) ? 4 : 3;
  if (kind === "reaction") return sel.intentId ? 4 : 3;
  if (kind === "ally") return sel.allyId && extrasReady(card, sel) ? 4 : 3;
  if (kind === "foe") return sel.enemyId && extrasReady(card, sel) ? 4 : 3;
  const need = statsOf(card)?.discard ?? 0;
  return (sel.discard || []).length >= need ? 4 : 3;
}
/* 需要额外指定对象才能结算的问答特效。
   增益 / 弃牌类卡的主流程不选敌人，可它们的问答可能指向敌人（如嫉妒·辅助的「对比」），
   这时也要补一个敌人选择器，否则那一条会静默落空。 */
const FOE_SCOPES = ["target", "adjOne", "adjAll", "otherAll"];
const wantExtraFoe = (card) => qaStats(card).some(q =>
  needsExtraFoe(q.stats) || (noFoeInFlow(card) && FOE_SCOPES.includes(q.stats.scope)));
const noFoeInFlow = (card) => ["ally", "self"].includes(kindOf(card));
const wantExtraAlly = (card) => qaStats(card).some(q => needsExtraAlly(q.stats));
function extrasReady(card, sel) {
  if (wantExtraFoe(card) && !sel.extraFoeId) return false;
  if (wantExtraAlly(card) && !sel.extraAllyId) return false;
  return true;
}
/* 二次对象选择器，接在主目标下面 */
function extraPickers(p, card, sel) {
  let html = "";
  if (wantExtraFoe(card)) {
    const anchor = state.enemies.find(e => e.id === sel.enemyId);
    const adjOnly = qaStats(card).some(q => needsExtraFoe(q.stats)) && anchor;
    const pool = adjOnly ? adjacentFoes(anchor) : state.enemies.slice();
    html += `<div class="spot-sec"><h3>${adjOnly ? "选一名相邻的敌人" : "指定一名敌人"}${sel.extraFoeId ? "" : "（待选）"}</h3>
      <p class="hint">${adjOnly ? "相邻 = 敌人列表里紧挨着的上下两个，可在上方用 ↑↓ 调整站位。"
        : "这张卡的问答特效指向敌人，但卡本身不打敌人，所以要单独指一个。"}</p>
      <div class="pick-row">${pool.map(e => `
        <div class="pick-unit${sel.extraFoeId === e.id ? " sel" : ""}" data-xfoe="${e.id}">
          <div class="pu-head"><b>${esc(e.name)}</b>
            <span class="pu-tag">意图 ${liveAttackIntents(e).map(i => intentValue(e, i)).join("、") || "—"}</span></div>
        </div>`).join("") || `<p class="hint">目标上下都没有敌人，这一条无法结算。</p>`}</div></div>`;
  }
  if (wantExtraAlly(card)) {
    html += `<div class="spot-sec"><h3>再指定一名友方${sel.extraAllyId ? "" : "（待选）"}</h3>
      <div class="pick-row">${activePlayers().map(t => `
        <div class="pick-unit${sel.extraAllyId === t.id ? " sel" : ""}" data-xally="${t.id}">
          <div class="pu-head"><b>${esc(t.name)}</b>
            <span class="pu-tag">${t.id === p.id ? "自己" : "友方"}</span></div>
          ${hpBar(t.hp, t.maxHp, t.temp, "mini")}
        </div>`).join("")}</div></div>`;
  }
  return html;
}
/* 打出前把问答特效逐条列出来，分清哪些会自动算、哪些要手动 */
function qaPreview(card) {
  // 旧存档没有 qa 字段，退回按卡面文本原样列出
  if (!card.qa) {
    return card.effects.length > 1
      ? `<div class="spot-preview note"><b>卡面特效（需自行结算）</b>${
          card.effects.slice(1).map(e => `<br>▸ ${esc(e)}`).join("")}</div>`
      : "";
  }
  const auto = card.qa.filter(q => q.stats), manual = card.qa.filter(q => !q.stats);
  if (!auto.length && !manual.length) return "";
  return `<div class="spot-preview note">
    ${auto.length ? `<b>问答特效（自动结算）</b>${auto.map(q =>
      `<br>▸ ${esc(q.label)}——${esc(q.effect)} <span class="ptag${q.stats.partial ? " warn" : ""}">${
        q.stats.partial ? "部分自动，余下手动" : (SCOPE_LABEL[q.stats.scope] || "")}</span>`).join("")}` : ""}
    ${manual.length ? `${auto.length ? "<br><br>" : ""}<b>问答特效（需自行结算）</b>${manual.map(q =>
      `<br>▸ ${esc(q.label)}——${esc(q.effect)}`).join("")}` : ""}
  </div>`;
}

function findCard(p, cardUid) {
  for (const g of ["a", "b"]) { const c = p.groups[g].cards.find(x => x.uid === cardUid); if (c) return c; }
  return null;
}

function renderFlow(step, kind) {
  const labels = flowLabels(kind);
  const key = step <= 2 ? step : (kind === "attack" ? "attack" : kind) + step;
  $("spotFlow").innerHTML = `
    <div class="flow">${labels.map((s, i) => {
      const n = i + 1;
      return `<div class="flow-step${n === step ? " on" : n < step ? " done" : ""}"><b>${n}</b><span>${s}</span></div>`;
    }).join("")}</div>
    <p class="flow-hint">${FLOW_HINTS[key] || ""}</p>`;
}

function renderPlayerPick() {
  if (!state.players.length) {
    $("spotPick").innerHTML = `<p class="empty">还没有角色。用上方「我方 · ⇩ 导入角色」读入建卡器导出的 JSON。</p>`;
    return;
  }
  const usable = (p) => !playerDone(p) || canIntercept(p);
  const roster = activePlayers();
  if (!roster.length) {
    $("spotPick").innerHTML = `<p class="empty">所有角色都已倒下。改一下单位卡上的 HP 可以让人重新站起。</p>`;
    return;
  }
  $("spotPick").innerHTML = `
    <div class="pick-row">${roster.map(p => {
      const ok = usable(p);
      const tag = !playerDone(p) ? "点击出战"
        : canIntercept(p) ? "槽位已满 · 仍可接线" : "本回合已打完";
      return `<div class="pick-unit${ok ? "" : " done"}" data-spot="${p.id}">
        <div class="pu-head"><b>${esc(p.name)}</b><span class="pu-tag">${tag}</span></div>
        ${hpBar(p.hp, p.maxHp, p.temp, "mini")}
        <div class="pu-meta">行动槽 ${p.slotUsed}/${p.slots.length} · ${["a", "b"].map(g =>
        `${g.toUpperCase()}组 ${availableCards(p.groups[g]).length} 张`).join(" · ")}${
        p.interceptRound === state.round ? " · 本轮已接线" : ""}</div>
      </div>`;
    }).join("")}</div>`;

  $("spotPick").querySelectorAll("[data-spot]").forEach(el => el.onclick = () => {
    const p = state.players.find(x => x.id === +el.dataset.spot);
    if (!usable(p)) { toast(`${p.name} 本回合已行动完，也没有可接的攻击`); return; }
    state.spot = p.id; pending = null; renderAll();
  });
}

function renderSpot() {
  // 所有人行动完就轮到敌方攻击落地，聚光灯让位给收尾结算
  $("spotCard").hidden = allPlayersDone() && !state.players.some(canIntercept);
  if ($("spotCard").hidden) return;
  const p0 = state.players.find(x => x.id === state.spot);
  const sel0 = currentSel();
  const card0 = p0 && sel0?.cardUid ? findCard(p0, sel0.cardUid) : null;
  const kind = card0 ? kindOf(card0) : "attack";
  const step = spotStep();
  renderFlow(step, kind);

  if (step === 1) renderPlayerPick(); else $("spotPick").innerHTML = "";

  const p = p0;
  if (!p || step === 1) { $("spotBody").innerHTML = ""; return; }
  if (p.actedRound !== state.round) { p.actedRound = state.round; p.slotUsed = 0; }

  const outOfSlots = playerDone(p);
  const slotIdx = Math.min(p.slotUsed, p.slots.length - 1);
  const g = groupOf(p, slotIdx);
  // 常规牌只能从当前槽位那一组出；接线牌两组都能用，且不占槽位
  const reactAvail = ["a", "b"].flatMap(gid => availableCards(p.groups[gid]).filter(c => kindOf(c) === "reaction"));
  const slotAvail = availableCards(g).filter(c => kindOf(c) !== "reaction");
  const sel = sel0, card = card0;

  const head = `
    <div class="spot-head">
      <div class="sh-main"><b>${esc(p.name)}</b> · ${outOfSlots ? "行动槽已用完（只能接线）"
        : `槽 ${slotIdx + 1} / ${p.slots.length}`} ·
        <span class="ptag">${p.slots[slotIdx].group.toUpperCase()}组</span>
        <small>${g.mode ? `${esc(g.mode.模式)} · 拼点属性 ${esc(g.mode.拼点属性)} · ${esc(g.mode.副效果)}` : "未设定攻击模式"}</small></div>
      <button class="btn ghost mini" data-back="player">← 换人</button>
    </div>`;

  /* 一张卡为什么不能打——写清楚，比灰掉不解释好 */
  const lockReason = (c) => {
    if (kindOf(c) === "reaction") {
      if (p.interceptRound === state.round) return "本轮已接过线";
      if (!liveIntents().length) return "当前没有敌方攻击意图可接";
      if (c.trait === "shield" && !liveIntents().some(({ i }) => i.targetId !== p.id))
        return "援护要替别人挡，当前没有打向他人的攻击";
      const st = statsOf(c), gg = p_group(p, c);
      const others = availableCards(gg).filter(x => x.uid !== c.uid);
      if (st?.require === "groupFull" && gg.used.length > 0) return "需本组所有卡片均未使用";
      if (st?.require === "groupEmpty" && others.length > 0) return "需本组已无其他可用卡";
      return null;
    }
    return outOfSlots ? "行动槽已用完" : null;
  };

  let body;
  if (!card) {
    const shown = [...slotAvail, ...reactAvail];
    body = `
      <div class="spot-sec"><h3>${p.slots[slotIdx].group.toUpperCase()}组剩余 ${availableCards(g).length} / ${g.cards.length} 张${availableCards(g).length === 0 ? "——用完即刷新" : ""}</h3>
        <div class="card-pick">${shown.map(c => {
          const k = kindOf(c), why = lockReason(c);
          const gid = groupIdOfCard(p, c);
          return `<div class="pick${why ? " locked" : ""}"${why ? "" : ` data-card="${c.uid}"`}>
            <b>${esc(c.sinLabel)} · ${esc(c.traitLabel)}</b>
            <small>${esc(c.levelLabel)} · ${KIND_LABEL[k]}${k === "reaction" ? ` · ${gid.toUpperCase()}组` : ""}</small>
            <div class="pick-tags">
              ${c.clashAttr ? `<span class="ptag">拼点 ${esc(c.clashAttr)}(${p.attrs[c.clashAttr] ?? 0})</span>`
                            : `<span class="ptag mute">不拼点</span>`}
              ${c.baseDamage != null ? `<span class="ptag dmg">基础伤害 ${c.baseDamage}</span>` : ""}
              ${c.hits > 1 ? `<span class="ptag warn">${c.hits} 次攻击</span>` : ""}
              ${k === "reaction" ? `<span class="ptag">不占行动槽</span>` : ""}
              ${why ? `<span class="ptag mute">${why}</span>` : ""}
            </div>
            <div class="pick-eff">${esc(c.effects[0] || "")}</div>
          </div>`;
        }).join("") || `<p class="hint">没有可打的卡了。</p>`}</div>
        ${reactAvail.length ? `<p class="hint">接线卡不占行动槽，每轮限接一次；接的那一击可以是打向队友的。</p>` : ""}
      </div>`;
  } else {
    body = `
      <div class="spot-sec chosen">
        <div class="spot-head">
          <div class="sh-main"><b>${esc(card.sinLabel)} · ${esc(card.traitLabel)}</b>
            <span class="ptag">${KIND_LABEL[kind]}</span>
            <small>${esc(card.effects[0] || "")}</small></div>
          <button class="btn ghost mini" data-back="card">← 换卡</button>
        </div>
      </div>
      ${kind === "attack" ? renderAttackTarget(p, card, sel)
        : kind === "reaction" ? renderInterceptTarget(p, card, sel)
        : kind === "ally" ? renderAllyTarget(p, card, sel)
        : kind === "foe" ? renderFoeTarget(p, card, sel)
        : renderDiscardPick(p, card, sel)}
      ${qaPreview(card)}`;
  }

  $("spotBody").innerHTML = head + body;
  bindSpot(p, card, sel, kind);
}

/* --- 攻击卡：选敌人 → 选意图 → 投骰 --- */
function renderAttackTarget(p, card, sel) {
  if (!state.enemies.length) return foeEmptyBlock();
  const enemy = state.enemies.find(e => e.id === sel.enemyId);
  const parts = clashParts(p, card), tc = thisCardMods(card);
  const mod = sumParts(parts) + tc.dice;

  const foeList = `
    <div class="spot-sec"><h3>选择目标</h3>
      <div class="pick-row">${state.enemies.map(e => {
        const live = liveAttackIntents(e).length;
        return `<div class="pick-unit${sel.enemyId === e.id ? " sel" : ""}" data-foe="${e.id}">
          <div class="pu-head"><b>${esc(e.name)}</b>
            <span class="pu-tag">${live ? `${live} 个待拼意图` : "无待拼意图"}</span></div>
          ${hpBar(e.hp, e.maxHp, e.temp, "foe mini")}
        </div>`;
      }).join("")}</div>
      <button class="btn ghost mini" id="btnAddFoeInline">＋ 再加一个敌人</button>
    </div>`;
  if (!enemy) return foeList;

  const intent = enemy.intents.find(i => i.id === sel.intentId) || null;
  const live = liveAttackIntents(enemy);
  const intentList = `
    <div class="spot-sec">
      <div class="spot-head"><div class="sh-main"><b>对抗哪个意图</b></div>
        <button class="btn ghost mini" data-back="foe">← 换目标</button></div>
      <div class="pick-row">
        ${live.map(i => `<div class="pick-unit narrow${sel.intentId === i.id ? " sel" : ""}" data-intent="${i.id}">
          <div class="pu-head"><b>攻击意图 ${intentValue(enemy, i)}</b></div>
          <div class="pu-meta">${esc(i.note) || "—"}</div></div>`).join("")}
        <div class="pick-unit narrow${sel.intentId === null ? " sel" : ""}" data-intent="none">
          <div class="pu-head"><b>单方面攻击</b></div>
          <div class="pu-meta">不拼点，自动命中</div></div>
      </div>
    </div>`;

  const gid = groupIdOfCard(p, card);
  const ms = p.groups[gid]?.mode?.数值 || null;
  let preview;
  const tcTxt = [tc.dice ? `拼点骰 +${tc.dice}` : null, tc.damage ? `伤害 +${tc.damage}` : null,
    tc.intentDown ? `意图值 -${tc.intentDown}` : null].filter(Boolean).join("，");
  if (intent) {
    const dc = Math.max(0, intentValue(enemy, intent) - tc.intentDown);
    preview = `拼点值 = 1D6 + ${partsText(parts)}${tc.dice ? ` 卡面+${tc.dice}` : ""} = 1D6 + ${mod} 对 意图值 ${dc}${
        tc.intentDown ? `（原 ${intentValue(enemy, intent)}，卡面压低 ${tc.intentDown}）` : ""}
      <br>命中率 <b>${pct(hitRate(mod, dc))}</b> · 命中时差值均值 ${avgMargin(mod, dc).toFixed(1)}
      ${card.baseDamage != null ? `<br>命中伤害 ≈ <b>${(card.baseDamage + avgMargin(mod, dc) + tc.damage + (ms?.winDamage || 0)).toFixed(1)}</b>（基础 ${card.baseDamage} + 差值${tc.damage ? ` + 卡面${tc.damage}` : ""}${ms?.winDamage ? ` + ${p.groups[gid].mode.模式}${ms.winDamage}` : ""}）` : ""}
      ${ms?.loseDamage ? `<br>未命中仍造成 <b>${ms.loseDamage}</b> 点（${p.groups[gid].mode.模式}模式保底）` : ""}`;
  } else {
    preview = `<b>单方面攻击</b>——不拼点，自动命中，<b>差值 = 拼点值</b>
      ${card.baseDamage != null ? `<br>期望伤害 ≈ <b>${(card.baseDamage + 3.5 + mod + tc.damage).toFixed(1)}</b>` : ""}
      ${card.hits > 1 ? `<br><span style="color:var(--danger)">注意：多重攻击的单方面那次不计差值</span>` : ""}`;
  }
  const extras = extraPickers(p, card, sel);   // 如「挑战众人」要另指一名相邻敌人
  const roll = `
    <div class="spot-sec">
      <div class="spot-preview">${preview}${tcTxt ? `<br><span style="color:var(--accent-2)">卡面本次修正：${tcTxt}</span>` : ""}</div>
      <div class="roll-row">
        <button class="btn primary big" id="btnGo">🎲 投骰结算</button>
        <label class="manual">手动指定骰值 <input type="number" id="manualRoll" min="1" max="6" placeholder="1-6"></label>
      </div>
    </div>`;
  return foeList + intentList + extras + (extrasReady(card, sel) ? roll : "");
}

/* --- 接线：在自己的行动里主动接下敌方某条攻击。不占行动槽 --- */
function renderInterceptTarget(p, card, sel) {
  // 援护是「替友方挡」，只能接打向别人的；防御与反击接谁的都行
  const pool = liveIntents().filter(({ i }) => card.trait !== "shield" || i.targetId !== p.id);
  if (!pool.length) {
    return `<div class="foe-empty"><b>当前没有可接的攻击</b>
      <p>${card.trait === "shield"
        ? "援护要替别人挡下来，现在没有打向其他角色的攻击意图。"
        : "敌方没有未结算的攻击意图。可以在上方「敌人」面板加一条，或先让别人行动。"}</p></div>`;
  }
  const chosen = pool.find(({ e, i }) => i.id === sel.intentId);
  const list = `
    <div class="spot-sec"><h3>接下哪一击</h3>
      <div class="pick-row">${pool.map(({ e, i }) => {
        const t = state.players.find(x => x.id === i.targetId);
        const forSelf = i.targetId === p.id;
        return `<div class="pick-unit${sel.intentId === i.id ? " sel" : ""}" data-icept="${i.id}">
          <div class="pu-head"><b>${esc(e.name)}</b>
            <span class="pu-tag">意图值 ${intentValue(e, i)}</span></div>
          <div class="pu-meta">基础伤害 ${dmgSpec(i)}（${dmgMin(i)}~${dmgMax(i)}） · 打向 <b>${t ? esc(t.name) : "未指定"}</b>
            ${forSelf ? "（你自己）" : "（替他挡）"}${i.note ? " · " + esc(i.note) : ""}</div>
        </div>`;
      }).join("")}</div>
    </div>`;
  if (!chosen) return list;

  const { e, i } = chosen;
  const target = state.players.find(x => x.id === i.targetId);
  const parts = clashParts(p, card), mod = sumParts(parts);
  const dc = intentValue(e, i);
  return list + `
    <div class="spot-sec">
      <div class="spot-preview">
        ${esc(p.name)} 接下 ${esc(e.name)} 打向 <b>${target ? esc(target.name) : "？"}</b> 的攻击
        <br>拼点值 = 1D6 + ${partsText(parts)} = 1D6 + ${mod} 对 意图值 ${dc}
        <br>成功率 <b>${pct(hitRate(mod, dc))}</b>
        <br>失败时伤害 = <b>${dmgSpec(i)}</b>（${foeDamageOut(e, dmgMin(i))}~${foeDamageOut(e, dmgMax(i))}${
          e.roundDmgDealt ? `，已计入本轮削弱 ${e.roundDmgDealt}` : ""}）+ (${dc} - 拼点值)${
          (target?.roundDmgDown || 0) ? ` − ${esc(target.name)}减伤${target.roundDmgDown}` : ""}，最低 0
        <br><span style="color:var(--accent-2)">接线不占行动槽——结算后 ${esc(p.name)} 仍可正常出牌</span>
      </div>
      <div class="roll-row">
        <button class="btn primary big" id="btnGo">🎲 投骰接线</button>
        <label class="manual">手动指定骰值 <input type="number" id="manualRoll" min="1" max="6" placeholder="1-6"></label>
      </div>
    </div>`;
}

/* --- 增益 / 辅助：选一名友方（含自己），不拼点 --- */
function renderAllyTarget(p, card, sel) {
  const st = statsOf(card);
  const ally = state.players.find(x => x.id === sel.allyId);
  const list = `
    <div class="spot-sec"><h3>选择受益者</h3>
      <div class="pick-row">${activePlayers().map(t => `
        <div class="pick-unit${sel.allyId === t.id ? " sel" : ""}" data-ally="${t.id}">
          <div class="pu-head"><b>${esc(t.name)}</b>
            <span class="pu-tag">${t.id === p.id ? "自己" : "友方"}</span></div>
          ${hpBar(t.hp, t.maxHp, t.temp, "mini")}
        </div>`).join("")}</div>
    </div>`;
  if (!ally) return list;
  if (!st) return list + manualBlock("该卡缺少结构化数值（旧版存档），请手动结算后打出。");
  const gains = [
    st.heal ? `恢复 ${st.heal} HP` : null,
    st.temp ? `获得 ${st.temp} 点临时生命` : null,
    st.diceUp ? `本轮拼点骰 +${st.diceUp}` : null
  ].filter(Boolean).join(" · ");
  const extras = extraPickers(p, card, sel);
  const body = `
    <div class="spot-sec">
      <div class="spot-preview"><b>${esc(ally.name)}</b> 将 ${gains || "获得卡面所述效果"}
        <br>不拼点，打出即生效。</div>
      <div class="roll-row"><button class="btn primary big" id="btnGo">✔ 打出</button></div>
    </div>`;
  return list + extras + (extrasReady(card, sel) ? body : "");
}

/* --- 减益：选一个敌人压意图值，不拼点 --- */
function renderFoeTarget(p, card, sel) {
  if (!state.enemies.length) return foeEmptyBlock();
  const st = statsOf(card);
  const enemy = state.enemies.find(e => e.id === sel.enemyId);
  const list = `
    <div class="spot-sec"><h3>选择敌人</h3>
      <div class="pick-row">${state.enemies.map(e => `
        <div class="pick-unit${sel.enemyId === e.id ? " sel" : ""}" data-foe="${e.id}">
          <div class="pu-head"><b>${esc(e.name)}</b>
            <span class="pu-tag">${e.roundIntentMod ? `本轮已 -${e.roundIntentMod}` : "未被削弱"}</span></div>
          ${hpBar(e.hp, e.maxHp, e.temp, "foe mini")}
        </div>`).join("")}</div>
    </div>`;
  if (!enemy) return list;
  if (!st) return list + manualBlock("该卡缺少结构化数值（旧版存档），请手动结算后打出。");

  // 目标身上累计的意图值降幅 = 基础 + 所有落在 target 的问答特效
  const onTarget = qaStats(card).filter(q => q.stats.scope === "target")
    .reduce((a, q) => a + (q.stats.intentDown || 0), 0);
  const totalDown = st.intentDown + onTarget;
  const now = liveAttackIntents(enemy).map(i => intentValue(enemy, i));
  const extras = extraPickers(p, card, sel);
  const body = `
    <div class="spot-sec">
      <div class="spot-preview"><b>${esc(enemy.name)}</b> 本轮所有意图值 <b>-${totalDown}</b>
        ${onTarget ? `（基础 -${st.intentDown} + 问答 -${onTarget}）` : ""}
        <br>${now.length ? `当前 ${now.join("、")} → ${now.map(v => v - totalDown).join("、")}` : "该敌人没有待拼意图"}
        <br>不拼点，打出即生效。</div>
      <div class="roll-row"><button class="btn primary big" id="btnGo">✔ 打出</button></div>
    </div>`;
  // 还缺二次对象时先不给打出按钮
  return list + extras + (extrasReady(card, sel) ? body : "");
}

/* --- 特殊：勾选要弃的牌，弃完回血 --- */
function renderDiscardPick(p, card, sel) {
  const st = statsOf(card);
  if (!st) return manualBlock("该卡缺少结构化数值（旧版存档），请用单位卡上的「🂠 卡组」手动弃牌。");
  const need = st.discard ?? 0;
  const gid = groupIdOfCard(p, card), g = p.groups[gid];
  // 可弃的是本组其余未使用的牌——本卡自己正在打出，不能同时被弃
  const pool = availableCards(g).filter(c => c.uid !== card.uid);
  const picked = sel.discard || [];
  const list = `
    <div class="spot-sec"><h3>选择要弃掉的牌（${picked.length} / ${need}）</h3>
      <div class="card-pick">${pool.map(c => `
        <div class="pick${picked.includes(c.uid) ? " sel" : ""}" data-disc="${c.uid}">
          <b>${esc(c.sinLabel)} · ${esc(c.traitLabel)}</b>
          <small>${esc(c.levelLabel)} · ${KIND_LABEL[kindOf(c)]}</small>
          <div class="pick-eff">${esc(c.effects[0] || "")}</div>
        </div>`).join("") || `<p class="hint">本组没有其他可弃的牌了。</p>`}</div>
      ${pool.length < need ? `<p class="hint">可弃的牌不足 ${need} 张，按实际数量结算。</p>` : ""}
    </div>`;
  if (picked.length < Math.min(need, pool.length)) return list;
  return list + `
    <div class="spot-sec">
      <div class="spot-preview">弃掉 <b>${picked.length}</b> 张牌，${esc(p.name)} 恢复 <b>${st.heal}</b> HP
        <br>弃牌同样消耗卡组循环——${gid.toUpperCase()}组 用掉 ${picked.length + 1} 张后剩 ${Math.max(0, availableCards(g).length - picked.length - 1)} 张。</div>
      <div class="roll-row"><button class="btn primary big" id="btnGo">✔ 打出</button></div>
    </div>`;
}

const foeEmptyBlock = () => `<div class="foe-empty">
  <b>场上还没有敌人</b>
  <p>加一个敌人才能选目标。新敌人默认带一条「攻击意图 7 / 基础伤害 5」，都能随时改。</p>
  <button class="btn primary" id="btnAddFoeInline">＋ 添加敌人</button></div>`;
const manualBlock = (msg) => `<div class="spot-sec">
  <div class="spot-preview note">${msg}</div>
  <div class="roll-row"><button class="btn primary big" id="btnGo">✔ 打出（仅消耗卡片）</button></div></div>`;

function bindSpot(p, card, sel, kind) {
  const addFoe = $("btnAddFoeInline");
  if (addFoe) addFoe.onclick = () => { state.enemies.push(newEnemy()); renderAll(); toast("已添加敌人"); };
  $("spotBody").querySelectorAll("[data-card]").forEach(el => el.onclick = () => {
    pending = {
      playerId: p.id, slotIdx: p.slotUsed, cardUid: +el.dataset.card,
      enemyId: null, intentId: null, allyId: null, extraFoeId: null, extraAllyId: null, discard: []
    };
    renderAll();
  });
  $("spotBody").querySelectorAll("[data-back]").forEach(el => el.onclick = () => {
    const w = el.dataset.back;
    if (w === "player") { state.spot = null; pending = null; }
    else if (w === "card") pending = null;
    else if (w === "foe" && pending) { pending.enemyId = null; pending.intentId = null; }
    renderAll();
  });
  if (!card) return;
  $("spotBody").querySelectorAll("[data-foe]").forEach(el => el.onclick = () => {
    pending.enemyId = +el.dataset.foe;
    if (kind === "attack") {
      const e = state.enemies.find(x => x.id === pending.enemyId);
      const live = liveAttackIntents(e);
      pending.intentId = live.length ? live[0].id : null;
    }
    renderAll();
  });
  $("spotBody").querySelectorAll("[data-intent]").forEach(el => el.onclick = () => {
    pending.intentId = el.dataset.intent === "none" ? null : +el.dataset.intent;
    renderAll();
  });
  $("spotBody").querySelectorAll("[data-icept]").forEach(el => el.onclick = () => {
    pending.intentId = +el.dataset.icept; renderAll();
  });
  $("spotBody").querySelectorAll("[data-ally]").forEach(el => el.onclick = () => {
    pending.allyId = +el.dataset.ally; renderAll();
  });
  $("spotBody").querySelectorAll("[data-xfoe]").forEach(el => el.onclick = () => {
    pending.extraFoeId = +el.dataset.xfoe; renderAll();
  });
  $("spotBody").querySelectorAll("[data-xally]").forEach(el => el.onclick = () => {
    pending.extraAllyId = +el.dataset.xally; renderAll();
  });
  $("spotBody").querySelectorAll("[data-disc]").forEach(el => el.onclick = () => {
    const u = +el.dataset.disc;
    const need = statsOf(card)?.discard ?? 0;
    const arr = pending.discard || (pending.discard = []);
    const at = arr.indexOf(u);
    if (at >= 0) arr.splice(at, 1);
    else if (arr.length < need) arr.push(u);
    else toast(`最多弃 ${need} 张`);
    renderAll();
  });
  const go = $("btnGo");
  if (go) go.onclick = () => playCard(p, card, sel, kind);
}

/* ---------- 打出一张牌 ---------- */
function playCard(p, card, sel, kind) {
  const gid = groupIdOfCard(p, card), g = p.groups[gid];
  const lines = [];
  let title = `【第${state.round}回合】${p.name} 打出「${card.sinLabel}·${card.traitLabel}(${card.levelLabel})」`;

  /* 接线：不占行动槽，走单独的收尾——写在最前面免得漏掉那条 return */
  if (kind === "reaction") {
    const { e, i } = liveIntents().find(x => x.i.id === sel.intentId);
    const target = state.players.find(x => x.id === i.targetId);
    const manual = +$("manualRoll")?.value;
    const roll = manual >= 1 && manual <= 6 ? manual : d6();
    const parts = clashParts(p, card), tc = thisCardMods(card);
    const mod = sumParts(parts) + tc.dice;
    title = `【第${state.round}回合】${p.name} 用「${card.sinLabel}·${card.traitLabel}」接下 ${e.name} 打向 ${target.name} 的攻击`;
    lines.push(`拼点修正 ${partsText(parts)}${tc.dice ? ` 卡面+${tc.dice}` : ""} = +${mod}`);
    lines.push(...resolveIntercept({
      who: p, target, card, mod, enemy: e, intent: i, roll,
      dmgRoll: rollDamage(i), dcDown: tc.intentDown
    }).lines);
    p.interceptRound = state.round;
    i.resolved = true;
    const refreshed = consumeCard(g, card);
    if (refreshed) lines.push(`※ ${gid.toUpperCase()}组已用完，卡组刷新`);
    lines.push(`${gid.toUpperCase()}组 剩余 ${availableCards(g).length}/${g.cards.length} 张`);
    lines.push(`接线不占行动槽——${p.name} 的行动槽仍为 ${p.slotUsed}/${p.slots.length}`);
    lines.push(...reapDefeated());
    pending = null;
    pushLog(title, lines);
    renderAll();
    return;
  }

  if (kind === "attack") {
    const enemy = state.enemies.find(e => e.id === sel.enemyId);
    const intent = enemy.intents.find(i => i.id === sel.intentId) || null;
    const manual = +$("manualRoll")?.value;
    const parts = clashParts(p, card), tc = thisCardMods(card);
    const mod = sumParts(parts) + tc.dice;
    const ms = g.mode?.数值 || null;
    let total = 0, anyHit = false;
    if (tc.dice || tc.damage || tc.intentDown) {
      lines.push(`卡面本次修正：${[tc.dice ? `拼点骰 +${tc.dice}` : null,
        tc.damage ? `伤害 +${tc.damage}` : null,
        tc.intentDown ? `意图值 -${tc.intentDown}` : null].filter(Boolean).join("，")}`);
    }
    for (let h = 0; h < (card.hits || 1); h++) {
      const roll = manual >= 1 && manual <= 6 ? manual : d6();
      const useIntent = h === 0 ? intent : (intent && !intent.resolved ? intent : null);
      const r = resolveAttack({ card, mod, modeStats: ms, enemy, intent: useIntent, roll,
        bonusDamage: tc.damage, dcDown: tc.intentDown });
      let dmg = r.damage;
      if (card.hits > 1 && r.oneSided) dmg = (card.baseDamage ?? 0) + tc.damage;   // 单方面不计差值
      total += dmg;
      if (r.hit) anyHit = true;
      lines.push(`第${h + 1}击 1D6=${roll} + ${mod}(${partsText(parts)}${tc.dice ? ` 卡面+${tc.dice}` : ""}) → 拼点值 ${r.clashVal}` +
        (r.oneSided ? `（单方面，自动命中）` : ` 对 意图值 ${r.dc} → ${r.hit ? "命中" : "未命中"}`) +
        ` · 伤害 ${dmg}`);
      if (useIntent) useIntent.resolved = true;
    }
    const r = damageFoe(enemy, total);
    lines.push(`合计伤害 ${r.bonus ? `${total} + 本轮易伤 ${r.bonus} = ${r.dmg}` : r.dmg}${
      r.absorbed ? `（临时生命吸收 ${r.absorbed}）` : ""}，${enemy.name} 剩余 ${enemy.hp}/${enemy.maxHp}`);
    title += ` 攻击 ${enemy.name}`;
    const added = card.hits > 1 ? addExtraCard(g, card) : null;
    if (added) lines.push(`※ 多重攻击：一张「${added.sinLabel} · 普通攻击」已加入 ${gid.toUpperCase()}组`);
    lines.push(...applyAllQa(card, {
      player: p, foe: enemy,
      extraFoe: state.enemies.find(x => x.id === sel.extraFoeId),
      extraAlly: state.players.find(x => x.id === sel.extraAllyId)
    }, { hit: anyHit }));

  } else if (kind === "ally") {
    const t = state.players.find(x => x.id === sel.allyId), st = statsOf(card);
    title += ` → ${t.name}`;
    if (st) {
      if (st.heal) lines.push(healLine(t, st.heal));
      if (st.temp) { t.temp = (t.temp || 0) + st.temp; lines.push(`${t.name} 获得 ${st.temp} 点临时生命`); }
      if (st.diceUp) { t.roundDice += st.diceUp; lines.push(`${t.name} 本轮拼点骰 +${st.diceUp}（累计 +${t.roundDice}）`); }
    } else lines.push("（旧版存档无结构化数值，效果请手动结算）");
    lines.push(...applyAllQa(card, {
      player: p, foe: null,
      extraFoe: state.enemies.find(x => x.id === sel.extraFoeId),
      extraAlly: state.players.find(x => x.id === sel.extraAllyId)
    }));

  } else if (kind === "foe") {
    const e = state.enemies.find(x => x.id === sel.enemyId), st = statsOf(card);
    title += ` → ${e.name}`;
    if (st?.intentDown) {
      e.roundIntentMod = (e.roundIntentMod || 0) + st.intentDown;
      lines.push(`基础：${e.name} 本轮所有意图值 -${st.intentDown}`);
    } else lines.push("（旧版存档无结构化数值，基础效果请手动结算）");
    lines.push(...applyAllQa(card, {
      player: p, foe: e,
      extraFoe: state.enemies.find(x => x.id === sel.extraFoeId),
      extraAlly: state.players.find(x => x.id === sel.extraAllyId)
    }));
    const now = liveAttackIntents(e).map(i => intentValue(e, i));
    if (now.length) lines.push(`${e.name} 当前待拼意图值：${now.join("、")}（累计 -${e.roundIntentMod}）`);

  } else {   // self：弃牌
    const st = statsOf(card);
    const picked = (sel.discard || []).map(u => g.cards.find(c => c.uid === u)).filter(Boolean);
    picked.forEach(c => consumeCard(g, c));
    if (picked.length) lines.push(`弃掉 ${picked.length} 张：${picked.map(c => `${c.sinLabel}·${c.traitLabel}`).join("、")}`);
    if (st?.heal) lines.push(healLine(p, st.heal));
    lines.push(...applyAllQa(card, {
      player: p, foe: null,
      extraFoe: state.enemies.find(x => x.id === sel.extraFoeId),
      extraAlly: state.players.find(x => x.id === sel.extraAllyId)
    }));
  }

  const refreshed = consumeCard(g, card);
  if (refreshed) lines.push(`※ ${gid.toUpperCase()}组已用完，卡组刷新`);
  lines.push(`${gid.toUpperCase()}组 剩余 ${availableCards(g).length}/${g.cards.length} 张`);

  p.slotUsed++;
  pending = null;
  if (p.slotUsed >= p.slots.length) state.spot = null;
  lines.push(...reapDefeated());   // 整张卡结算完再清场
  pushLog(title, lines);
  renderAll();
}

/* ============ 收尾：没人接下的敌方攻击自动落地 ============
   这不是一个独立的「敌方回合」——只有所有人都行动完、仍有攻击意图没人接线时，
   它才出现，把剩下的攻击结算掉。 */
function renderFoePhase() {
  const show = allPlayersDone();
  $("foeCard").hidden = !show;
  if (!show) return;

  const pend = liveIntents();
  if (!pend.length) {
    $("foeBody").innerHTML = `<div class="spot-preview">所有人都行动完了，敌方也没有未结算的攻击意图。
      <br>可以在上方「敌人」面板给下一轮布置意图，然后进入下一回合。</div>
      <div class="roll-row"><button class="btn primary big" id="btnNextRound2">下一回合 →</button></div>`;
    $("btnNextRound2").onclick = nextRound;
    return;
  }
  const duel = state.duel;
  const cur = duel ? pend.find(x => x.e.id === duel.enemyId && x.i.id === duel.intentId) : null;

  if (!cur) {
    $("foeBody").innerHTML = `
      <div class="spot-sec"><h3>选择要结算的攻击意图</h3>
        <div class="pick-row">${pend.map(({ e, i }) => {
          const t = state.players.find(x => x.id === i.targetId);
          return `<div class="pick-unit" data-duel="${e.id}:${i.id}">
            <div class="pu-head"><b>${esc(e.name)}</b><span class="pu-tag">意图值 ${intentValue(e, i)}</span></div>
            <div class="pu-meta">基础伤害 ${dmgSpec(i)}（${dmgMin(i)}~${dmgMax(i)}） · 打向 ${t ? esc(t.name) : "未指定"}${i.note ? " · " + esc(i.note) : ""}</div>
          </div>`;
        }).join("")}</div></div>`;
    $("foeBody").querySelectorAll("[data-duel]").forEach(el => el.onclick = () => {
      const [eid, iid] = el.dataset.duel.split(":").map(Number);
      const e = state.enemies.find(x => x.id === eid);
      const i = e.intents.find(x => x.id === iid);
      if (!i.targetId && state.players.length) i.targetId = state.players[0].id;
      state.duel = { enemyId: eid, intentId: iid, byPlayerId: null, cardUid: null };
      renderAll();
    });
    return;
  }

  const { e, i } = cur;
  const target = state.players.find(x => x.id === i.targetId);
  if (!target) {
    $("foeBody").innerHTML = `<div class="spot-preview">这条意图还没有指定攻击目标，请在上方「敌人」面板的「打向」里选一个角色。</div>`;
    return;
  }
  const dc = intentValue(e, i);
  const opts = interceptOptions(i, target);
  const chosen = duel.cardUid ? opts.find(o => o.card.uid === duel.cardUid && o.who.id === duel.byPlayerId) : null;
  // 未接线的伤害要到结算时才掷骰，这里只能给区间（已计入本轮对它的出伤削弱）
  const gap = dc - (target.attrs.体魄 ?? 0);
  const cut = target.roundDmgDown || 0;                       // 目标本轮减伤
  const noGuardMin = Math.max(0, foeDamageOut(e, dmgMin(i)) + gap - cut);
  const noGuardMax = Math.max(0, foeDamageOut(e, dmgMax(i)) + gap - cut);

  let html = `
    <div class="spot-head">
      <div class="sh-main"><b>${esc(e.name)}</b> 的攻击意图 · 意图值 <b>${dc}</b> · 基础伤害 <b>${dmgSpec(i)}</b>
        <small>打向 ${esc(target.name)}（${target.hp}/${target.maxHp}${target.temp ? ` +${target.temp}` : ""}）${i.note ? " · " + esc(i.note) : ""}</small></div>
      <button class="btn ghost mini" id="btnDuelBack">← 换一条意图</button>
    </div>
    <div class="spot-sec"><h3>是否接线</h3>
      <div class="pick-row">
        <div class="pick-unit${duel.cardUid === null ? " sel" : ""}" data-guard="none">
          <div class="pu-head"><b>不接线</b></div>
          <div class="pu-meta">自动命中：${dmgSpec(i)}${e.roundDmgDealt ? ` − 削弱${e.roundDmgDealt}` : ""} + (${dc} - 体魄${target.attrs.体魄 ?? 0})${cut ? ` − 减伤${cut}` : ""} = <b>${noGuardMin}~${noGuardMax}</b> 点（结算时现掷）</div>
        </div>
        ${opts.map(o => `<div class="pick-unit${chosen && chosen.card.uid === o.card.uid && chosen.who.id === o.who.id ? " sel" : ""}${o.reason ? " done" : ""}"
            ${o.reason ? "" : `data-guard="${o.who.id}:${o.card.uid}"`}>
          <div class="pu-head"><b>${esc(o.card.sinLabel)} · ${esc(o.card.traitLabel)}</b>
            <span class="pu-tag">${esc(o.who.name)}</span></div>
          <div class="pu-meta">${o.reason ? `不可用：${o.reason}` : esc(o.card.effects[0] || "")}</div>
        </div>`).join("")}
      </div>
      ${opts.length ? "" : `<p class="hint">场上没有可用的防御 / 援护 / 反击卡，只能不接线。</p>`}
    </div>`;

  if (chosen) {
    const parts = clashParts(chosen.who, chosen.card), tcx = thisCardMods(chosen.card);
    const mod = sumParts(parts) + tcx.dice;
    html += `<div class="spot-sec"><div class="spot-preview">
      ${esc(chosen.who.name)} 接线：拼点值 = 1D6 + ${partsText(parts)} = 1D6 + ${mod} 对 意图值 ${dc}
      <br>成功率 <b>${pct(hitRate(mod, dc))}</b>
      <br>失败时伤害 = <b>${dmgSpec(i)}</b>（${dmgMin(i)}~${dmgMax(i)}，均 ${dmgAvg(i).toFixed(1)}）+ (${dc} - 拼点值)，最低 0
      ${chosen.card.effects.length > 1 ? `<br><b>卡面特效（需自行结算）</b>${chosen.card.effects.slice(1).map(x => `<br>▸ ${esc(x)}`).join("")}` : ""}
    </div></div>`;
  }
  html += `<div class="roll-row">
      <button class="btn primary big" id="btnGuard">${chosen ? "🎲 接线拼点" : "✔ 不接线，直接承伤"}</button>
      ${chosen ? `<label class="manual">手动指定骰值 <input type="number" id="manualRoll" min="1" max="6" placeholder="1-6"></label>` : ""}
    </div>`;

  $("foeBody").innerHTML = html;
  $("btnDuelBack").onclick = () => { state.duel = null; renderAll(); };
  $("foeBody").querySelectorAll("[data-guard]").forEach(el => el.onclick = () => {
    if (el.dataset.guard === "none") { duel.byPlayerId = null; duel.cardUid = null; }
    else {
      const [pid, cid] = el.dataset.guard.split(":").map(Number);
      duel.byPlayerId = pid; duel.cardUid = cid;
    }
    renderAll();
  });
  $("btnGuard").onclick = () => doGuard(e, i, target, chosen);
}

/* 谁能接这一击。防御与反击接谁的都行（叙事上就是替人挡），
   援护的卡面写死了「替友方受伤害」，所以只能接打向别人的；每人每轮限接一次 */
function interceptOptions(intent, target) {
  const out = [];
  for (const who of activePlayers()) {
    for (const gid of ["a", "b"]) {
      const g = who.groups[gid];
      for (const card of availableCards(g)) {
        if (kindOf(card) !== "reaction") continue;
        let reason = null;
        if (who.interceptRound === state.round) reason = `${who.name} 本轮已接过线`;
        else if (card.trait === "shield" && who.id === target.id) reason = "援护是替别人挡";
        else {
          const st = statsOf(card);
          const others = availableCards(g).filter(c => c.uid !== card.uid);
          if (st?.require === "groupFull" && g.used.length > 0) reason = "需本组所有卡片均未使用";
          if (st?.require === "groupEmpty" && others.length > 0) reason = "需本组已无其他可用卡";
        }
        out.push({ who, card, gid, reason });
      }
    }
  }
  return out;
}

function doGuard(enemy, intent, target, chosen) {
  const lines = [];
  let title = `【第${state.round}回合】${enemy.name} 攻击 ${target.name}（意图值 ${intentValue(enemy, intent)}）`;

  const dmgRoll = rollDamage(intent);
  if (!chosen) {
    const dc = intentValue(enemy, intent);
    const base = foeDamageOut(enemy, dmgRoll.total);
    const dmg = Math.max(0, base + (dc - (target.attrs.体魄 ?? 0)));
    const r = damagePlayer(target, dmg);
    lines.push(`未接线，自动命中`);
    lines.push(`基础伤害 ${dmgText(intent, dmgRoll)}${
      enemy.roundDmgDealt ? ` − 本轮削弱 ${enemy.roundDmgDealt} = ${base}` : ""}，加上 (意图值 ${dc} - 体魄 ${target.attrs.体魄 ?? 0}) = ${dmg} 点`);
    lines.push(`${target.name} 受到 ${r.dmg} 点伤害${r.cut ? `（本轮减伤 ${r.cut}）` : ""}${r.absorbed ? `（临时生命吸收 ${r.absorbed}）` : ""}，剩余 ${target.hp}/${target.maxHp}`);
  } else {
    const { who, card } = chosen;
    const manual = +$("manualRoll")?.value;
    const roll = manual >= 1 && manual <= 6 ? manual : d6();
    const parts = clashParts(who, card), tc = thisCardMods(card);
    const mod = sumParts(parts) + tc.dice;
    title += ` ← ${who.name} 用「${card.sinLabel}·${card.traitLabel}」接线`;
    lines.push(`拼点修正 ${partsText(parts)}${tc.dice ? ` 卡面+${tc.dice}` : ""} = +${mod}`);
    const r = resolveIntercept({ who, target, card, mod, enemy, intent, roll, dmgRoll, dcDown: tc.intentDown });
    lines.push(...r.lines);
    who.interceptRound = state.round;
    const g = p_group(who, card);
    const refreshed = consumeCard(g, card);
    if (refreshed) lines.push(`※ ${groupIdOfCard(who, card).toUpperCase()}组已用完，卡组刷新`);
  }
  intent.resolved = true;
  state.duel = null;
  lines.push(...reapDefeated());
  pushLog(title, lines);
  renderAll();
}

/* ---------- 日志 ---------- */
function pushLog(title, lines) { state.log.unshift({ title, lines }); state.log = state.log.slice(0, 60); }
function renderLog() {
  $("log").innerHTML = state.log.length
    ? state.log.map(l => `<div class="logrow"><b>${esc(l.title)}</b>${l.lines.map(x => `<br>${x}`).join("")}</div>`).join("")
    : `<p class="empty">还没有记录。</p>`;
}

function renderAll() {
  renderRound(); renderPlayers(); renderEnemies(); renderDeck();
  renderSpot(); renderFoePhase(); renderLog();
}

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
      if (++done === files.length) {
        // 开局就给一个敌人，否则「选择目标」这一步会是空的
        if (state.players.length && !state.enemies.length) state.enemies.push(newEnemy());
        // 意图默认打向第一个角色，省得每次手动指
        state.enemies.forEach(e => e.intents.forEach(i => {
          if (i.type === "attack" && !i.targetId) i.targetId = state.players[0].id;
        }));
        renderAll();
      }
    };
    r.readAsText(f);
  });
  ev.target.value = "";
};
$("btnAddEnemy").onclick = () => {
  const e = newEnemy();
  if (state.players.length) e.intents.forEach(i => { i.targetId = state.players[0].id; });
  state.enemies.push(e); renderAll();
};
function nextRound() {
  state.round++;
  state.players.forEach(p => { p.slotUsed = 0; p.roundDice = 0; p.roundDmgDown = 0; p.actedRound = 0; });  // 本轮增益随回合失效
  state.enemies.forEach(e => {
    // 减益类同样只持续本轮
    e.roundIntentMod = 0; e.roundDmgTaken = 0; e.roundDmgDealt = 0;
    e.intents.forEach(i => {
      i.resolved = false;
      if (!i.targetId && state.players.length) i.targetId = state.players[0].id;
    });
  });
  state.spot = null; pending = null; state.duel = null;
  pushLog(`—— 进入第 ${state.round} 回合 ——`,
    ["所有人可再次行动；接线次数与本轮增益 / 减益已重置；敌方意图重置为未结算"]);
  renderAll();
}
$("btnNextRound").onclick = nextRound;
$("btnResetAll").onclick = () => {
  if (!confirm("清空所有角色、敌人和日志，重新开始一场战斗？")) return;
  state.round = 1;
  state.players = []; state.enemies = []; state.log = [];
  state.spot = null; state.duel = null;
  pending = null; deckView = null; expanded.clear();
  renderAll(); toast("已重置");
};
$("btnDeckClose").onclick = () => { deckView = null; renderAll(); };

let toastTimer = null;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

renderAll();
