/* ============ 战斗计算器 ============
   全部数据来自建卡器导出的 JSON，本文件不复制规则表——
   卡片的基础伤害、拼点属性、命中次数、非攻击卡的结构化数值(stats)都由导出提供。

   核心规则（与建卡器一致）：
     拼点值 = 1D6 + 属性 + 各项修正；拼点值 ≥ 意图值 即成功，差值 = 拼点值 - 意图值
     攻击   伤害 = 基础伤害 + 差值；攻击意图被拼过一次就结算，无论我方成败
     接线   防御/援护/反击在自己的行动里主动打出，接下敌方某条攻击意图。
            占一个行动槽——防御就是这一槽的行动，防完不能再出牌。
            每轮仍限接一次；接的那一击不必打向自己：叙事上就是替别人挡下来。
     敌方攻击  没有独立的「敌方回合」。所有人都行动完、仍有攻击意图没人接线时，
            这些意图自动落地：伤害 = 敌方基础伤害 + (意图值 - 体魄)，最低为 0
            到这一步已经没人有行动槽，所以接线必须在自己的行动里提前打出
     伤害   一律先扣临时生命，再扣 HP
     混乱线 当前 HP ≤ 50% 所有拼点骰 -1；≤ 25% 改为 -2（不叠加）
     架势   角色同一时间只用 A/B 中的一组卡片。不借技能牌切换要花一个行动槽；
            卡面自带的切换（thenSwitch、「防御成功后可免费切换」）不花行动槽。
            角色卡上的 A/B 开关是免费的，供开局设定与 GM 纠正，不触发【切换】特效。
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
  pendingEnd: [],    // 回合结束才落地的伤害（灼烧），见 resolveRoundEnd()
  duel: null         // 收尾结算中正在处理的意图 {enemyId, intentId}
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
    effects: [],          // 我方状态槽，见 newEffect()
    hurtThisRound: false, // 本轮是否受过伤（「积怨」「从容」一类条件）
    roundHealMod: 0,      // 本轮所有恢复 ±N（「空虚感」）
    noDefenseRound: 0,    // 本轮不能打接线卡（「精疲力竭」），存回合数
    nextRoundGuardDice: 0,// 下一轮防御/援护拼点骰 +N（「久眠」）
    roundGuardDice: 0,    // 本轮防御/援护拼点骰 +N（上一轮的「久眠」兑现来的）
    interceptRound: 0,    // 最后一次接线的回合（每轮限一次）
    stance: "a",          // 当前架势 = 正在使用的卡组，切换要花一个行动槽
    slotCount: 1,
    groups,
    actedRound: 0, slotUsed: 0,
    down: false          // HP 归零后退场，改回 HP 即可复归
  };
}

/* ---------- 我方状态槽 ----------
   敌人的增益/减益是一条条意图，可以被点名驱散；我方以前没有对应结构——
   本轮状态只是 roundDice / roundDmgDown 几个数字，「移除一个减益效果」这种卡
   因此永远做不了。这里把它们变成一个个可点名的对象。

   状态自带数值，移除它就真的把数值拿掉；lasting 的不随回合清除，
   否则「涤净」在回合末尾打就没东西可涤了。 */
const newEffect = (o = {}) => ({
  id: uid(), kind: o.kind || "debuff", label: o.label || "",
  dice: o.dice || 0,          // 拼点骰 ±N
  dmgDown: o.dmgDown || 0,    // 本轮受到的伤害 -N
  lasting: !!o.lasting        // true = 持续到被移除；false = 回合结束清掉
});
const effectsOf = (p, kind) => (p.effects || []).filter(e => !kind || e.kind === kind);
const effDice = (p) => effectsOf(p).reduce((n, e) => n + e.dice, 0);
const effDmgDown = (p) => effectsOf(p).reduce((n, e) => n + e.dmgDown, 0);
/* 移除 n 个指定类别的状态，返回被移除的那些（供日志与「窃取」搬运） */
function removeEffects(p, kind, n) {
  const pool = effectsOf(p, kind);
  const take = n === "all" ? pool.length : Math.min(n || 1, pool.length);
  const gone = pool.slice(0, take);
  p.effects = (p.effects || []).filter(e => !gone.includes(e));
  return gone;
}

/* ---------- 卡组 ---------- */
/* 架势是角色级状态：所有槽位都从当前架势那一组出牌 */
const groupOf = (p) => p.groups[p.stance] || p.groups.a;
const otherStance = (gid) => (gid === "a" ? "b" : "a");
const modeName = (p, gid) => p.groups[gid].mode?.模式 || "未设定模式";
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
    noMarginDamage: !!card.noMarginDamage,   // 追加卡跟母卡同一个罪孽，口径要一致
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

/* 行动槽用完 = 这个角色本回合的行动结束。接线同样吃槽位，所以也看这个 */
const playerDone = (p) => p.slotUsed >= p.slotCount;
const allPlayersDone = () => activePlayers().length > 0 && activePlayers().every(playerDone);
/* 场上所有还没被接下的敌方攻击意图 */
function liveIntents() {
  const o = [];
  state.enemies.forEach(e => liveAttackIntents(e).forEach(i => o.push({ e, i })));
  return o;
}
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
  // 只作用于接线的加骰：「承受」的自我削弱、「久眠」兑现来的下一轮加成
  if (p.roundGuardDice && kindOf(card) === "reaction")
    parts.push({ label: "本轮防御修正", v: p.roundGuardDice });
  // 状态槽里带拼点加值的逐条列出，这样玩家看得见「涤净」掉一个之后差在哪
  effectsOf(p).filter(e => e.dice).forEach(e =>
    parts.push({ label: e.label || (e.kind === "buff" ? "增益" : "减益"), v: e.dice }));
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
  const cut = Math.min(amount, (p.roundDmgDown || 0) + effDmgDown(p));
  const r = applyDamage(p, amount - cut);
  // 「积怨」「从容」「以静制动」都要问「本轮受过伤没有」，在唯一的入口记一笔
  if (r.dmg > 0) p.hurtThisRound = true;
  return { ...r, cut };
}
/* 打敌人：先叠上它本轮「受到的伤害 +N」，再走通用扣血 */
function damageFoe(enemy, amount) {
  const bonus = enemy.roundDmgTaken || 0;
  const r = applyDamage(enemy, amount + bonus);
  return { ...r, bonus };
}
/* 敌人被「侵蚀」后本轮不能回血/加壳，所以治疗敌人也要走一道门 */
const foeCanHeal = (e) => !e.roundNoHeal;
/* 满血时治疗会归零，日志要说清楚是「无效果」而不是干巴巴的「恢复 0 HP」 */
/* 恢复量的元修正。「细嚼慢咽」「微痛」是本卡范围，「空虚感」是本轮范围，
   「暴食本能」是负的。都在这里汇总，免得每个加血点各写一遍。
   healMod 只抬高不压到负数——本来就是 0 的恢复不该被修正成负数。 */
let cardHealMod = 0;                       // 正在结算的这张卡的修正，playCard 开头设、结束清
const healAmt = (u, amount) => Math.max(0, amount + (amount > 0 ? cardHealMod + (u.roundHealMod || 0) : 0));
function healLine(u, amount) {
  const want = healAmt(u, amount);
  const h = applyHeal(u, want);
  const extra = want !== amount ? `（${amount} 经修正为 ${want}）` : "";
  return h ? `${u.name} 恢复 ${h} HP${extra}（${u.hp}/${u.maxHp}）`
           : `${u.name} 已满血，${want} 点治疗无效果`;
}
/* 临时生命同样吃元修正——「微痛」明写了「恢复与临时生命数值 +N」 */
function tempLine(u, amount) {
  const want = healAmt(u, amount);
  u.temp = (u.temp || 0) + want;
  return `${u.name} 获得 ${want} 点临时生命${want !== amount ? `（${amount} 经修正）` : ""}`;
}
/* 本卡所有 healMod 的合计（含条件不成立的要跳过） */
const healModOf = (card, ctx = {}) => qaStats(card)
  .filter(q => condMet(q.stats.cond, ctx))
  .reduce((n, q) => n + (q.stats.healMod || 0), 0);

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
/* allyScope 是「同一条特效的友方那一半」——打击敌人的同时惠及友方的卡（艳羡一类）
   两边作用面不同，光一个 scope 装不下，所以另开一个字段 */
const ALLY_PICK = ["oneAlly", "selfAndAlly"];
const needsExtraAlly = (st) =>
  ALLY_PICK.includes(st?.scope) || ALLY_PICK.includes(st?.allyScope);
/* ---------- 条件判断 ----------
   卡面上大量「若…则…」以前只能手动。cond 把判断写成机器可读的，求值靠一个上下文对象。

   分两个时机：拼点前能算的（HP、本轮是否受伤、意图值对属性）可以门控 thisDice/thisDamage；
   拼点后才知道的（命中、击杀、第几击）只能门控普通效果——所以求值器对拿不到的
   上下文一律返回 false，而不是猜。 */
function condMet(cond, c = {}) {
  if (!cond) return true;
  const p = c.player, e = c.foe;
  const chk = {
    selfHurt:      () => !!p?.hurtThisRound,
    selfUnhurt:    () => !!p && !p.hurtThisRound,
    selfHpBelowHalf: () => !!p && p.hp <= Math.floor(p.maxHp / 2),
    selfHpAboveFoe:  () => !!p && !!e && p.hp > e.hp,
    foeHpAboveSelf:  () => !!p && !!e && e.hp > p.hp,
    // 敌人没有属性值，用意图值代表它在这次拼点里的强度
    intentAboveAttr: () => c.dc != null && c.attrVal != null && c.dc > c.attrVal,
    hit:           () => c.hit === true,
    miss:          () => c.hit === false,
    killed:        () => c.killed === true,
    killedToPanic: () => c.killedToPanic === true,
    foeHpBelowSelf: () => !!p && !!e && e.hp > 0 && e.hp < p.hp,
    selfHpBelowFoe: () => !!p && !!e && p.hp < e.hp,
    firstHit:      () => c.firstHit === true,
    firstMiss:     () => c.firstHit === false,
    allHit:        () => c.allHit === true,
    sameTarget:    () => c.sameTarget === true,
    anyFoeAboveAllies: () => state.enemies.some(x => x.hp > Math.max(0, ...activePlayers().map(a => a.hp)))
  };
  return Object.keys(cond).every(k => cond[k] === false ? !chk[k]?.() : !!chk[k]?.());
}

/* 卡上所有带 stats 的问答条目 */
/* 卡上所有带 stats 的问答条目。**必须排除 onSwitchIn**——那些的触发点是切进这一组，
   不是打出这张卡；它们现在也挂了 stats，不排掉就会在打出时被误结算一次。 */
const qaStats = (card) => (card.qa || []).filter(q => q.stats && !q.onSwitchIn);
/* 切进某一组时，该组卡片上已选的【切换】特效。这些条目 stats 为 null，
   qaStats() 天然不会在打出那张卡时结算它们——这里只把它们列出来提醒 GM。
   一组里多张卡都选了【切换】就全列出，触发几条是规则判断，交给 GM。 */
const switchInEffects = (p, gid) => p.groups[gid].cards
  .flatMap(c => (c.qa || []).filter(q => q.onSwitchIn).map(q => ({ card: c, ...q })));
/* 切换进某组时，这一组的【切换】特效会自动结算（见 switchInLines） */
const switchInAuto = (p, gid) => switchInEffects(p, gid).filter(x => x.stats).length;
/* 【切换】特效现在自动结算。要指定单个对象的（「一名敌人」）取敌人列表的第一个，
   日志写明是谁，GM 觉得不对可以直接改数值——比让整条落空强。 */
const switchInLines = (p, gid) => {
  const list = switchInEffects(p, gid);
  if (!list.length) return [];
  const out = [`${gid.toUpperCase()}组的【切换】特效：`];
  const foe = state.enemies[0] || null;
  for (const x of list) {
    if (!x.stats) { out.push(`  ▸ 「${x.label}」——${esc(x.effect)}（需自行结算）`); continue; }
    out.push(...applyQaStat({ label: x.label, stats: x.stats },
      { player: p, foe, extraFoe: foe, extraAlly: activePlayers().find(a => a !== p) || p }, {}));
  }
  return out;
};
/* 统一的换架势入口，三条路径（行动切换 / thenSwitch / 免费切换）都走它 */
function setStance(p, gid, why) {
  if (p.stance === gid) return [`${p.name} 已经在 ${gid.toUpperCase()}组，无需切换`];
  p.stance = gid;
  return [`${why}：${p.name} 架势 → ${gid.toUpperCase()}组 ${modeName(p, gid)}`].concat(switchInLines(p, gid));
}

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
    // 玩家可能把「另一名友方」指成自己，去重免得同一条效果在他身上跑两遍
    case "selfAndAlly": return extraAlly ? (extraAlly === player ? [player] : [player, extraAlly]) : [];
    case "allAllies": return state.players.slice();
    default: return foe ? [foe] : [player];
  }
}

/* 分击修正：只作用于多重攻击的第 N 击（集中 / 压制 / 不懈 / 变招）。
   它们的条件要看第一击的结果，所以每一击单独求值。 */
function shotMods(card, n, ctx) {
  let dice = 0, damage = 0, altAttr = false;
  for (const q of qaStats(card)) {
    const st = q.stats;
    if (st.shot !== n || !condMet(st.cond, ctx)) continue;
    dice += st.shotDice || 0; damage += st.shotDamage || 0;
    if (st.altAttr) altAttr = true;
  }
  return { dice, damage, altAttr };
}
/* 「变招」「模仿」：改用另一组攻击模式的拼点属性；两组模式相同时走 sameModeAlt 的替代值 */
function altAttrOf(p, card) {
  const gid = groupIdOfCard(p, card), other = otherStance(gid);
  const a = p.groups[gid]?.mode?.拼点属性, b = p.groups[other]?.mode?.拼点属性;
  return (!b || a === b) ? null : b;
}
/* 「本次」类字段只作用于这张卡的这一次结算，不进本轮状态——
   它们在投骰前就要折进拼点与伤害里，所以单独汇总，不走 applyQaStat。 */
function thisCardMods(card, ctx = {}) {
  let dice = 0, damage = 0, intentDown = 0, fixedRoll = null;
  for (const q of qaStats(card)) {
    let st = q.stats;
    if (st.altIf && condMet(st.altIf.cond, ctx)) {
      const { cond, ...rest } = st.altIf; st = { ...st, ...rest };
    }
    // 「模仿」两组攻击模式相同时，改用替代收益
    if (st.sameModeAlt && ctx.player && !altAttrOf(ctx.player, card)) st = { ...st, ...st.sameModeAlt };
    // 拼点前的条件（HP、本轮是否受伤…）在这里就能判；拿不到的上下文一律不生效
    if (!condMet(st.cond, ctx)) continue;
    dice += st.thisDice || 0;
    damage += st.thisDamage || 0;
    intentDown += st.thisIntentDown || 0;
    // 傲慢「完美计算」：不投骰，骰值固定——用确定性换掉方差
    if (st.fixedRoll != null) fixedRoll = st.fixedRoll;
  }
  return { dice, damage, intentDown, fixedRoll };
}
/* 接线卡的问答特效也有胜负分支，形状与 CARD_BASE_STATS 的 win/lose 一致 */
function qaBranch(card, win) {
  return qaStats(card).map(q => ({ label: q.label, br: win ? q.stats.win : q.stats.lose }))
    .filter(x => x.br);
}

/* 结算一条问答特效，返回日志行。opts.hit 用于门控「命中时」类效果 */
function applyQaStat(q, ctx, opts = {}) {
  let st = q.stats;
  // altIf：「…；若…改为…」的替换语义。条件成立时用替换值整个盖掉，而不是叠加
  if (st.altIf && condMet(st.altIf.cond, { ...ctx, ...opts })) {
    const { cond, ...rest } = st.altIf;
    st = { ...st, ...rest, altIf: undefined };
  }
  const lines = [];
  if (st.onHit && !opts.hit) return [];      // 未命中，这条不触发
  if (!condMet(st.cond, { ...ctx, ...opts })) return [];   // 「若…」不成立，整条不发动
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
    // 被「侵蚀」的敌人本轮拿不到任何回血与壳
    if (st.heal) lines.push(foeCanHeal(u) ? healLine(u, st.heal) : `${u.name} 被侵蚀，无法恢复`);
    if (st.temp) lines.push(foeCanHeal(u) ? tempLine(u, st.temp) : `${u.name} 被侵蚀，无法获得临时生命`);
    if (st.pressure) { u.pressure = Math.max(0, (u.pressure || 0) + st.pressure); lines.push(`${u.name} 罪孽压力 ${st.pressure > 0 ? "+" : ""}${st.pressure}（${u.pressure}/${u.pressureCap}）`); }
    // 「侵蚀」：本轮堵死目标的回血与加壳
    if (st.noHeal) { u.roundNoHeal = true; lines.push(`${u.name} 本轮不能恢复 HP、不能获得临时生命`); }
    // 「燃烧」：回合结束才落地的灼烧，排进队列
    if (st.burn) {
      (state.pendingEnd ||= []).push({ enemyId: u.id, damage: st.burn, label: q.label });
      lines.push(`${u.name} 被点燃：本轮结束时受到 ${st.burn} 点灼烧伤害`);
    }
    // 「不容置疑」：本轮该敌人不能再把意图指向打出者
    if (st.cantTarget) {
      (u.noTarget ||= []).push(ctx.player.id);
      lines.push(`${u.name} 本轮不能再把意图指向 ${ctx.player.name}`);
    }
    // 「拖延」：把意图推到下一轮，值叠加上去——它不会消失，只是晚来且更重
    if (st.delay) {
      const pool = liveAttackIntents(u).concat(liveOtherIntents(u));
      const take = st.delay === "all" ? pool.length : Math.min(st.delay, pool.length);
      for (let k = 0; k < take; k++) {
        const i = pool[k];
        i.resolved = true; i.delayed = (i.delayed || 0) + i.value;
        i.note = `${i.note || ""}（已推迟，下轮意图值 +${i.delayed}）`;
        lines.push(`${u.name} 的一条意图被推迟到下一轮（下轮意图值 +${i.delayed}）`);
      }
      if (!take) lines.push(`${u.name} 没有可推迟的意图`);
    }
    // 「挑拨」：把一条攻击意图改指向另一名敌人；场上只有一个就退化成压意图值
    if (st.taunt) {
      const other = state.enemies.find(x => x.id !== u.id);
      const i = liveAttackIntents(u)[0];
      if (!i) lines.push(`${u.name} 没有可改指的攻击意图`);
      else if (other) {
        i.targetId = null; i.foeTarget = other.id;
        i.note = `${i.note || ""}（被挑拨，改打 ${other.name}）`;
        i.value = Math.max(0, i.value - (st.tauntDown || 0));
        lines.push(`${u.name} 的一条攻击意图改为指向 ${other.name}${st.tauntDown ? `，意图值 -${st.tauntDown}` : ""}`);
      } else {
        i.value = Math.max(0, i.value - (st.soloDown ?? 3));
        lines.push(`场上只有 ${u.name} 一个敌人，改为其该条意图值 -${st.soloDown ?? 3}`);
      }
    }
  }
  // 打断 / 驱散：取消敌方尚未结算的增益或减益意图
  if (st.cancel) {
    const want = st.cancel.kind || "any";
    let done = 0;
    for (const u of units) {
      if (!u.intents) continue;
      // want 为 any 时连攻击意图一起算——「无间断」要的是「所有尚未结算的意图」
      const pool = (want === "any" ? u.intents.filter(i => !i.resolved)
                                   : liveOtherIntents(u).filter(i => i.type === want));
      const take = st.cancel.n === "all" ? pool.length : Math.min(st.cancel.n || 1, pool.length);
      for (let k = 0; k < take; k++) {
        pool[k].resolved = true; done++;
        lines.push(`取消 ${u.name} 的${INTENT_TYPES[pool[k].type].label}意图${pool[k].note ? `「${esc(pool[k].note)}」` : ""}`);
      }
    }
    if (!done && !st.orElse) lines.push(`没有可取消的意图`);
    // 一个都没取消到 → 走替代条款
    if (!done && st.orElse) {
      lines.push(`没有可取消的意图，改为：`);
      const alt = applyQaStat({ label: q.label, stats: { scope: st.scope, ...st.orElse } }, ctx, opts);
      return lines.map(x => `  ▸ ${q.label}：${x}`).concat(alt);
    }
  }
  // 我方状态槽：移除减益 / 把减益搬给敌人。units 这时是友方（scope 指向我方）
  if (st.cleanse || st.steal) {
    const stolen = [];
    for (const u of units) {
      if (!u.effects) continue;                    // 敌人没有状态槽，跳过
      const gone = removeEffects(u, "debuff", st.cleanse || st.steal);
      if (gone.length) {
        lines.push(`${u.name} 移除 ${gone.length} 个减益：${gone.map(e => e.label || "减益").join("、")}`);
        stolen.push(...gone);
      } else lines.push(`${u.name} 身上没有可移除的减益`);
    }
    // 「窃取」：搬到敌人身上，落成一条减益意图——敌人那边本来就是用意图表示状态的
    if (st.steal && stolen.length) {
      const foe = ctx.extraFoe || ctx.foe;
      if (foe) {
        stolen.forEach(e => foe.intents.push({
          ...newIntent(), type: "debuff", note: `窃取自我方：${e.label || "减益"}`
        }));
        lines.push(`转移到 ${foe.name} 身上，成为 ${stolen.length} 条减益意图`);
      } else lines.push(`（没有指定敌人，减益已移除但未转移）`);
    }
  }
  // 友方那一半：作用面与主 scope 不同，所以单开一组字段（「艳羡」打敌人的同时给友方加壳）
  if (st.allyScope) {
    for (const u of scopeTargets({ scope: st.allyScope }, ctx)) {
      if (st.allyTemp) lines.push(tempLine(u, st.allyTemp));
      if (st.allyHeal) lines.push(healLine(u, st.allyHeal));
      if (st.allyDiceUp) { u.roundDice = (u.roundDice || 0) + st.allyDiceUp; lines.push(`${u.name} 本轮拼点骰 +${st.allyDiceUp}`); }
      if (st.allyPressure) { u.pressure = Math.max(0, (u.pressure || 0) + st.allyPressure); lines.push(`${u.name} 罪孽压力 ${st.allyPressure > 0 ? "+" : ""}${st.allyPressure}（${u.pressure}/${u.pressureCap}）`); }
    }
  }
  // 自伤 / 自身收益恒落在打出者身上，与 scope 无关
  if (st.selfHeal) lines.push(healLine(ctx.player, st.selfHeal));
  if (st.selfTemp) lines.push(tempLine(ctx.player, st.selfTemp));
  // 「血肉」：恢复量按本次实际造成的伤害算
  if (st.healPerDamage && opts.dealt) {
    const v = Math.floor(opts.dealt * st.healPerDamage);
    if (v > 0) lines.push(healLine(ctx.player, v));
  }
  // 「连击」这类描述战斗器本来就有的行为的条目：明说一句，别让它静默无输出
  if (st.noop) lines.push(`（本条描述的是战斗器默认行为，无需额外结算）`);
  // 「鲸吞」：弃掉本组剩余全部，按张数回血，组立即刷新
  if (st.devour && ctx.card) {
    const g = p_group(ctx.player, ctx.card);
    const rest = availableCards(g).filter(c => c.uid !== ctx.card.uid);
    rest.forEach(c => consumeCard(g, c));
    lines.push(`弃掉本组剩余 ${rest.length} 张（${rest.map(c => `${c.sinLabel}·${c.traitLabel}`).join("、") || "无"}）`);
    if (rest.length) lines.push(healLine(ctx.player, rest.length * st.devour));
    g.used = []; lines.push(`${groupIdOfCard(ctx.player, ctx.card).toUpperCase()}组立即刷新`);
  }
  // 「反刍」：从已弃掉的牌里取回。g.used 就是这一组的弃牌堆
  if (st.restore && ctx.card) {
    const g = p_group(ctx.player, ctx.card);
    const back = g.used.filter(u => u !== ctx.card.uid).slice(0, st.restore);
    if (!back.length) lines.push(`本组还没有弃掉的牌可以取回`);
    else {
      g.used = g.used.filter(u => !back.includes(u));
      lines.push(`取回 ${back.map(u => { const c = g.cards.find(x => x.uid === u); return c ? `${c.sinLabel}·${c.traitLabel}` : "?"; }).join("、")}，重新可用`);
    }
  }
  // 「承受」的自伤代价：本轮防御拼点骰 -N（只影响接线，不影响攻击）
  if (st.selfGuardDice) {
    ctx.player.roundGuardDice = (ctx.player.roundGuardDice || 0) + st.selfGuardDice;
    lines.push(`${ctx.player.name} 本轮防御拼点骰 ${st.selfGuardDice > 0 ? "+" : ""}${st.selfGuardDice}`);
  }
  // 「空虚感」：本轮所有恢复 +N（跨卡，和只管本卡的 healMod 不同）
  if (st.roundHealMod) {
    ctx.player.roundHealMod = (ctx.player.roundHealMod || 0) + st.roundHealMod;
    lines.push(`${ctx.player.name} 本轮所有恢复效果 +${st.roundHealMod}`);
  }
  // 「精疲力竭」：本轮打不出接线卡
  if (st.noDefense) {
    ctx.player.noDefenseRound = state.round;
    lines.push(`${ctx.player.name} 本轮不能再打出防御 / 援护 / 反击卡`);
  }
  if (st.selfPressure) {
    ctx.player.pressure = Math.max(0, (ctx.player.pressure || 0) + st.selfPressure);
    lines.push(`${ctx.player.name} 罪孽压力 ${st.selfPressure > 0 ? "+" : ""}${st.selfPressure}（${ctx.player.pressure}/${ctx.player.pressureCap}）`);
  }
  if (st.selfDamage) {
    const r = applyDamage(ctx.player, st.selfDamage);
    lines.push(`${ctx.player.name} 受到 ${r.dmg} 点伤害${r.absorbed ? `（临时生命吸收 ${r.absorbed}）` : ""}，剩余 ${ctx.player.hp}/${ctx.player.maxHp}`);
  }
  // 只有「本次」类字段的条目（thisDamage 等）已在拼点里折算过，这里不该再报未结算
  const onlyThisCard = !st.scope && !st.selfDamage && !st.selfPressure && !st.selfHeal && !st.selfTemp && !st.win && !st.lose;
  if (!units.length && !st.selfDamage && !st.selfPressure && !st.selfHeal && !st.selfTemp && !onlyThisCard)
    lines.push(`（${SCOPE_LABEL[st.scope] || "对象"}未指定，本条未结算）`);
  return lines.map(x => `  ▸ ${q.label}：${x}`);
}
/* 依次结算一张卡的全部问答特效。
   opts.discardMet = 弃牌这个发动条件满足了没有：张数凑不够时 needDiscard 的条目整条不发动，
   但同卡的伤害与其余不依赖弃牌的条目照常。 */
function applyAllQa(card, ctx, opts = {}) {
  ctx = { ...ctx, card };   // 「鲸吞」「反刍」要操作本卡所在那一组，得知道自己是谁
  return qaStats(card).flatMap(q => {
    if (q.stats.needDiscard && !opts.discardMet)
      return [`  ▸ ${q.label}：可弃的牌凑不够，这一条不发动`];
    return applyQaStat(q, ctx, opts);
  });
}

/* ---------- 敌人与意图 ---------- */
const INTENT_TYPES = {
  attack: { label: "攻击", desc: "可拼点；被拼过一次即结算，无论我方成败" },
  buff: { label: "增益", desc: "敌方强化自身——用「意图修正」手动体现" },
  debuff: { label: "减益", desc: "削弱我方——用角色的「拼点修正」手动体现" }
};
const liveAttackIntents = (e) => e.intents.filter(i => i.type === "attack" && !i.resolved);
/* 增益 / 减益意图：不能拼点，但可以被「打断 / 驱散」类效果取消掉 */
const liveOtherIntents = (e) => e.intents.filter(i => i.type !== "attack" && !i.resolved);
const intentBrief = (e) => {
  const b = liveOtherIntents(e).filter(i => i.type === "buff").length;
  const d = liveOtherIntents(e).filter(i => i.type === "debuff").length;
  return [b ? `${b} 增益` : null, d ? `${d} 减益` : null].filter(Boolean).join(" · ");
};

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
/* 敌人类型只影响一条规则：「挡下全部意图」对它生效到什么程度。
   杂兵全挡 · 精英只挡打向同一目标的 · BOSS 免疫（退化成只挡被拼的那一条）。
   HP / 意图值 / 伤害不受类型影响——那些本来就是 GM 手填的。 */
const FOE_KINDS = {
  mob:   { label: "杂兵", blockAll: "all",  desc: "「挡下全部意图」全效：它本轮的攻击意图会被一并挡下" },
  elite: { label: "精英", blockAll: "same", desc: "「挡下全部意图」只挡下打向同一目标的攻击" },
  boss:  { label: "BOSS", blockAll: "none", desc: "免疫「挡下全部意图」，防御只挡下被拼的那一条" }
};

function newEnemy() {
  return {
    id: uid(), name: "敌人" + (state.enemies.length + 1), kind: "mob",
    maxHp: 20, hp: 20, temp: 0, clashMod: 0,
    roundIntentMod: 0,     // 本轮被减益卡压低的意图值，回合结束清零
    roundDmgTaken: 0,      // 本轮受到的伤害 +N（「加深」一类）
    roundDmgDealt: 0,      // 本轮造成的伤害 -N（「力量」一类）
    roundNoHeal: false,    // 本轮不能回血/加壳（「侵蚀」）
    noTarget: [],          // 本轮不能把意图指向这些角色（「不容置疑」）
    // 默认带一条攻击意图：没有意图的敌人只能被单方面攻击，拼点流程根本用不上
    intents: [newIntent()]
  };
}

/* ---------- 结算：我方攻击 ---------- */
/* bonusDamage / dcDown 来自问答特效的「本次伤害 +N」「本次意图值 -N」，
   拼点骰的「本次 +N」已经在调用处折进 mod 里了 */
function resolveAttack({ card, mod, modeStats, enemy, intent, roll, bonusDamage = 0, dcDown = 0 }) {
  const base = card.baseDamage ?? 0;
  // 傲慢一类：拼赢也不吃差值，伤害 = 基础 + 卡面/模式调整。
  // 拼点强度换零方差——赢多赢少一个样。由建卡器按卡导出，战斗器不认罪孽名。
  const noMargin = !!card.noMarginDamage;
  if (!intent) {
    // 单方面：自动命中，差值 = 拼点值（不吃差值的卡同样拿不到这一份）
    const clashVal = roll + mod;
    return { oneSided: true, hit: true, roll, clashVal, dc: null, margin: noMargin ? 0 : clashVal,
             damage: base + (noMargin ? 0 : clashVal) + bonusDamage };
  }
  const dc = Math.max(0, intentValue(enemy, intent) - dcDown);
  const clashVal = roll + mod;
  const hit = clashVal >= dc;
  const margin = hit && !noMargin ? clashVal - dc : 0;
  let damage = hit ? base + margin + bonusDamage : 0;
  // 攻击模式副效果：打击胜利加伤，突刺失败保底
  if (hit && modeStats?.winDamage) damage += modeStats.winDamage;
  if (!hit && modeStats?.loseDamage) damage = modeStats.loseDamage;
  return { oneSided: false, hit, roll, clashVal, dc, margin, damage };
}

/* 差值转临时生命。与攻击的「差值→伤害」同构——防得越漂亮壳越厚，
   差值为 0 时不给，正如攻击差值为 0 时只有基础伤害。 */
function marginTemp(unit, margin, per) {
  const gain = margin * per;
  if (gain <= 0) return [];
  unit.temp = (unit.temp || 0) + gain;
  return [`${esc(unit.name)} 获得 ${gain} 点临时生命（差值 ${margin} × ${per}）`];
}

/* 「挡下全部意图」：防御压过攻击的唯一杠杆——攻击一次只消一条意图，这条能消一片。
   强度按敌人类型递减，BOSS 免疫，免得单体大敌被一张卡关掉整轮。 */
function blockAllIntents(enemy, intent, target) {
  const mode = FOE_KINDS[enemy.kind || "mob"].blockAll;
  if (mode === "none") return [`${esc(enemy.name)} 是 BOSS，只挡下被拼的这一条`];
  const extra = liveAttackIntents(enemy).filter(i =>
    i.id !== intent.id && (mode === "all" || i.targetId === target.id));
  extra.forEach(i => { i.resolved = true; });
  if (!extra.length) return [`${esc(enemy.name)} 没有其他待结算的攻击意图`];
  return [`一并挡下 ${esc(enemy.name)} 的另外 ${extra.length} 条攻击意图（意图值 ${
    extra.map(i => intentValue(enemy, i)).join("、")}）${mode === "same" ? "——精英只挡下打向同一目标的" : ""}`];
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

  let br = win ? st.win : st.lose;
  // 「韧壳」「不死不休」是替换语义——把基础的那一支整个换掉，而不是叠加
  for (const q of qaStats(card)) {
    const rep = win ? q.stats.replaceWin : q.stats.replaceLose;
    if (rep) br = { ...br, ...rep };
  }

  // 反击大技能：先把临时生命换成伤害
  let counterBase = 0;
  if (st.consumeTemp) {
    const capUp = qaStats(card).reduce((v, q) => v + (q.stats.tempCapUp || 0), 0);
    const converted = Math.min(who.temp || 0, (st.tempCap ?? 0) + capUp);
    counterBase = (st.base ?? 0) + converted;
    lines.push(`消耗全部临时生命 ${who.temp}（其中 ${converted} 点转化为伤害），本次基础伤害 ${counterBase}`);
    who.temp = 0;
  }
  // 援护大技能：弃掉本组其余卡片换临时生命
  if (st.discardRest) {
    const g = p_group(who, card);
    const rest = availableCards(g).filter(c => c.uid !== card.uid);
    rest.forEach(c => consumeCard(g, c));
    const per = qaStats(card).reduce((v, q) => q.stats.tempPerDiscardSet ?? v, st.tempPerDiscard ?? 0);
    const gain = rest.length * per;
    who.temp = (who.temp || 0) + gain;
    // 这一条弃的是「其余全部」，没得选，所以把弃掉的牌逐张列出来免得像是工具随手挑的
    lines.push(`弃掉本组其余 ${rest.length} 张卡（${rest.map(c => `${c.sinLabel}·${c.traitLabel}`).join("、") || "无"}），获得 ${gain} 点临时生命`);
  }

  // 无胜负条件的问答特效先结算——加壳类要在挨打之前生效才有意义
  for (const q of qaStats(card)) {
    if (q.stats.win || q.stats.lose) continue;
    lines.push(...applyQaStat(q, { player: who, foe: enemy, guarded: target }, { hit: win }));
  }

  if (win) {
    if (br.block) lines.push(`完全格挡，${esc(target.name)} 不受伤害`);
    if (br.allySafe) lines.push(`${esc(target.name)} 不受伤害`);
    if (br.temp) lines.push(tempLine(who, br.temp));
    // 胜利侧的恢复：以前只有失败分支读 heal，防御「赢了什么都不给」有一半原因在这
    if (br.heal) lines.push(healLine(who, br.heal));
    if (br.tempPerMargin) lines.push(...marginTemp(who, margin, br.tempPerMargin));
    if (br.blockAll) lines.push(...blockAllIntents(enemy, intent, target));
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
    if (br.temp) lines.push(tempLine(victim, br.temp));
    if (br.heal) lines.push(healLine(victim, br.heal));
    if (br.damageFull) {
      const rf = damageFoe(enemy, counterBase);
      lines.push(`仍对 ${esc(enemy.name)} 造成 ${rf.dmg} 点伤害（基础伤害全额）`);
    }
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
    // 「反压」「厚积薄发」：伤害按打出者当前临时生命算
    if (qb.damagePerTemp) {
      const dmg = Math.floor((who.temp || 0) * qb.damagePerTemp);
      const r = damageFoe(enemy, dmg);
      lines.push(`  ▸ ${label}：对 ${esc(enemy.name)} 造成 ${r.dmg} 点伤害（临时生命 ${who.temp} × ${qb.damagePerTemp}）`);
    }
    // 「卸力反打」：伤害按这次挡下来的伤害算
    if (qb.damagePerBlocked) {
      const dmg = Math.floor(incoming * qb.damagePerBlocked);
      const r = damageFoe(enemy, dmg);
      lines.push(`  ▸ ${label}：对 ${esc(enemy.name)} 造成 ${r.dmg} 点伤害（挡下 ${incoming} × ${qb.damagePerBlocked}）`);
    }
    if (qb.temp) lines.push(`  ▸ ${label}：${tempLine(victim, qb.temp)}`);
    if (qb.heal) lines.push(`  ▸ ${label}：${healLine(victim, qb.heal)}`);
    if (qb.pressure) { victim.pressure = Math.max(0, (victim.pressure || 0) + qb.pressure); lines.push(`  ▸ ${label}：${esc(victim.name)} 罪孽压力 ${qb.pressure > 0 ? "+" : ""}${qb.pressure}`); }
    if (qb.cancel) {
      const qw = qb.cancel.kind || "any";
      const pool = (qw === "any" ? enemy.intents.filter(i => !i.resolved)
                                 : liveOtherIntents(enemy).filter(i => i.type === qw));
      const take = qb.cancel.n === "all" ? pool.length : Math.min(qb.cancel.n || 1, pool.length);
      for (let k = 0; k < take; k++) { pool[k].resolved = true; lines.push(`  ▸ ${label}：取消 ${esc(enemy.name)} 的${INTENT_TYPES[pool[k].type].label}意图`); }
      if (!take && qb.orElse?.dmgTakenUp) {
        enemy.roundDmgTaken = (enemy.roundDmgTaken || 0) + qb.orElse.dmgTakenUp;
        lines.push(`  ▸ ${label}：没有可取消的意图，改为 ${esc(enemy.name)} 本轮受到的伤害 +${qb.orElse.dmgTakenUp}`);
      }
    }
    if (qb.diceUp) { victim.roundDice = (victim.roundDice || 0) + qb.diceUp; lines.push(`  ▸ ${label}：${esc(victim.name)} 本轮拼点骰 +${qb.diceUp}`); }
    // 「不容置疑」：本轮该敌人不能再把意图指向防御者
    if (qb.cantTarget) {
      (enemy.noTarget ||= []).push(who.id);
      lines.push(`  ▸ ${label}：${esc(enemy.name)} 本轮不能再把意图指向 ${esc(who.name)}`);
    }
    // 胜负分支里的「友方那一半」（指挥若定 / 喘息）
    if (qb.allyScope) {
      for (const u of scopeTargets({ scope: qb.allyScope }, { player: who, foe: enemy, guarded: target, extraAlly: target })) {
        if (qb.allyDiceUp) { u.roundDice = (u.roundDice || 0) + qb.allyDiceUp; lines.push(`  ▸ ${label}：${esc(u.name)} 本轮拼点骰 +${qb.allyDiceUp}`); }
        if (qb.allyPressure) { u.pressure = Math.max(0, (u.pressure || 0) + qb.allyPressure); lines.push(`  ▸ ${label}：${esc(u.name)} 罪孽压力 ${qb.allyPressure > 0 ? "+" : ""}${qb.allyPressure}`); }
        if (qb.allyTemp) lines.push(`  ▸ ${label}：${tempLine(u, qb.allyTemp)}`);
        if (qb.allyHeal) lines.push(`  ▸ ${label}：${healLine(u, qb.allyHeal)}`);
      }
    }
    if (qb.tempPerMargin) lines.push(...marginTemp(victim, margin, qb.tempPerMargin).map(x => `  ▸ ${label}：${x}`));
    if (qb.blockAll) lines.push(...blockAllIntents(enemy, intent, target).map(x => `  ▸ ${label}：${x}`));
    // 「你可以免费切换攻击模式」：这里按切处理，不想切就用角色卡上的免费开关翻回去
    if (qb.freeSwitch) lines.push(...setStance(who, otherStance(who.stance), `  ▸ ${label}（免费，不占行动槽）`));
  }

  // 「不死不休」：这次反击把攻击者打死了才给的奖励
  for (const q of qaStats(card)) {
    if (!q.stats.onKillFoe || enemy.hp > 0) continue;
    const k = q.stats.onKillFoe;
    if (k.heal) lines.push(`  ▸ ${q.label}：${healLine(who, k.heal)}`);
    if (k.temp) lines.push(`  ▸ ${q.label}：${tempLine(who, k.temp)}`);
  }
  // 【切换】结算后换到另一组。以卡所属组的对侧为准——接线卡可以跨组打出
  if (st.thenSwitch) {
    // 搭在 thenSwitch 上的「切出去时」条款（倾泻 / 久眠）——切进来的那套是 onSwitchIn，两回事
    for (const q of qaStats(card)) {
      const o = q.stats.onSwitchOut; if (!o) continue;
      if (o.temp) lines.push(`  ▸ ${q.label}：${tempLine(who, o.temp)}`);
      if (o.diceUp) { who.roundDice = (who.roundDice || 0) + o.diceUp; lines.push(`  ▸ ${q.label}：${who.name} 本轮拼点骰 +${o.diceUp}`); }
      if (o.nextGuardDice) { who.nextRoundGuardDice = (who.nextRoundGuardDice || 0) + o.nextGuardDice; lines.push(`  ▸ ${q.label}：${who.name} 下一轮防御/援护拼点骰 +${o.nextGuardDice}`); }
    }
    lines.push(...setStance(who, otherStance(groupIdOfCard(who, card)), "【切换】结算后换组"));
  }
  return { win, clashVal, dc, margin, lines };
}
/* resolveIntercept 里要按卡找组，抽出来避免和 groupOf(玩家)（= 当前架势那组）混淆 */
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
    const finished = acted && playerDone(p);
    const open = expanded.has(p.id);
    const pen = panicPenalty(p);
    return `
    <div class="unit${state.spot === p.id ? " on" : ""}">
      <div class="unit-head">
        <b>${esc(p.name)}</b>
        <span class="unit-tag${downed(p) ? " dead" : finished ? " done" : ""}">${
          downed(p) ? "已倒下" : acted ? `已行动 ${p.slotUsed}/${p.slotCount}` : "待行动"}</span>
      </div>
      ${hpBar(p.hp, p.maxHp, p.temp)}
      <div class="stance-pick" title="免费切换：开局设定与 GM 纠正用。正式的切换行动在聚光灯里，要花一个行动槽">
        ${["a", "b"].map(gid => `<button class="st-btn${p.stance === gid ? " on" : ""}" data-stance-free="${gid}" data-id="${p.id}">
          ${gid.toUpperCase()}组 · ${esc(modeName(p, gid))}</button>`).join("")}
      </div>
      <div class="unit-flags">
        ${pen ? `<span class="ptag warn">混乱线 拼点骰${pen}</span>` : ""}
        ${p.roundDice ? `<span class="ptag">本轮拼点骰 +${p.roundDice}</span>` : ""}
        ${p.roundDmgDown ? `<span class="ptag dmg">本轮受伤 -${p.roundDmgDown}</span>` : ""}
        ${p.interceptRound === state.round ? `<span class="ptag mute">本轮已接线</span>` : ""}
      </div>
      ${effectsOf(p).length ? `<div class="eff-row">
        ${effectsOf(p).map(e => `<span class="eff ${e.kind}" title="${e.lasting ? "持续到被移除" : "本回合结束时消失"}">
          ${esc(e.label || (e.kind === "buff" ? "增益" : "减益"))}${
            e.dice ? ` 骰${e.dice > 0 ? "+" : ""}${e.dice}` : ""}${
            e.dmgDown ? ` 减伤${e.dmgDown}` : ""}${e.lasting ? " ∞" : ""}
          <button class="eff-x" data-effdel="${e.id}" data-id="${p.id}" title="移除">✕</button></span>`).join("")}
      </div>` : ""}
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
          ${numField("本轮受伤 -", "pf", p.id, "roundDmgDown", p.roundDmgDown)}
          ${numField("槽位数", "pf", p.id, "slotCount", p.slotCount, 'min="1" max="4"')}
        </div>
        <p class="hint">混乱线与攻击模式加成已自动计入拼点，不要重复填。架势在上方的 A/B 开关里改。</p>
        <div class="eff-add">
          <span class="qa-flab">加状态</span>
          <select data-effnew="kind" data-id="${p.id}">
            <option value="debuff">减益</option><option value="buff">增益</option>
          </select>
          <input data-effnew="label" data-id="${p.id}" placeholder="名称，如「中毒」" class="eff-in">
          <label class="ilab">骰<input type="number" class="iv sm" data-effnew="dice" data-id="${p.id}" value="0"></label>
          <label class="ilab">减伤<input type="number" class="iv sm" data-effnew="dmgDown" data-id="${p.id}" value="0"></label>
          <label class="ilab"><input type="checkbox" data-effnew="lasting" data-id="${p.id}">持续</label>
          <button class="btn ghost mini" data-effadd="${p.id}">＋ 添加</button>
        </div>
        <p class="hint">状态自带数值，会自动算进拼点与减伤——不要再往上面的「拼点修正」重复填。
          不勾「持续」的状态在回合结束时自动消失；勾了的会一直留着，等「涤净」这类卡来解。</p>
      </div>` : ""}
    </div>`;
  }).join("");

  $("players").querySelectorAll("[data-pf]").forEach(el => el.onchange = () => {
    const p = state.players.find(x => x.id === +el.dataset.id); if (!p) return;
    const v = +el.value || 0;
    if (el.dataset.pf === "slotCount") p.slotCount = clamp(v, 1, 4);
    else p[el.dataset.pf] = v;
    renderAll();
  });
  $("players").querySelectorAll("[data-effdel]").forEach(el => el.onclick = () => {
    const p = state.players.find(x => x.id === +el.dataset.id); if (!p) return;
    p.effects = (p.effects || []).filter(e => e.id !== +el.dataset.effdel);
    renderAll();
  });
  $("players").querySelectorAll("[data-effadd]").forEach(el => el.onclick = () => {
    const id = +el.dataset.effadd, p = state.players.find(x => x.id === id); if (!p) return;
    const f = (k) => $("players").querySelector(`[data-effnew="${k}"][data-id="${id}"]`);
    const label = f("label").value.trim();
    const dice = +f("dice").value || 0, dmgDown = +f("dmgDown").value || 0;
    if (!label && !dice && !dmgDown) { toast("给状态起个名字，或至少填一个数值"); return; }
    p.effects = (p.effects || []).concat(newEffect({
      kind: f("kind").value, label, dice, dmgDown, lasting: f("lasting").checked
    }));
    renderAll();
  });
  // 免费切换架势：开局设定与 GM 纠正，不消耗行动、不触发【切换】特效
  $("players").querySelectorAll("[data-stance-free]").forEach(el => el.onclick = () => {
    const p = state.players.find(x => x.id === +el.dataset.id);
    if (!p || p.stance === el.dataset.stanceFree) return;
    p.stance = el.dataset.stanceFree;
    pending = null;                       // 换了组，选到一半的牌作废
    toast(`${p.name} 架势 → ${p.stance.toUpperCase()}组 ${modeName(p, p.stance)}（免费）`);
    renderAll();
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
      <div class="kind-pick" title="${esc(FOE_KINDS[e.kind || "mob"].desc)}">
        ${Object.entries(FOE_KINDS).map(([k, v]) => `<button class="kd-btn${(e.kind || "mob") === k ? " on" : ""}"
          data-kind="${k}" data-id="${e.id}" title="${esc(v.desc)}">${v.label}</button>`).join("")}
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
        <div class="unit-stats">
          ${numField("意图修正", "ef", e.id, "clashMod", e.clashMod)}
          ${numField("本轮受到伤害 +", "ef", e.id, "roundDmgTaken", e.roundDmgTaken || 0)}
          ${numField("本轮造成伤害 -", "ef", e.id, "roundDmgDealt", e.roundDmgDealt || 0)}
        </div>
        <p class="hint">减益卡压下来的部分已自动计入，不用重复填。这三格是给工具还不认的来源用的——
          E.G.O 的「衰弱 / 余烬 / 燃尽」、【切换】类特效、以及你临场裁定的效果。三项都在回合结束时清零。</p>
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
  $("enemies").querySelectorAll("[data-kind]").forEach(el => el.onclick = () => {
    const e = state.enemies.find(x => x.id === +el.dataset.id); if (!e) return;
    e.kind = el.dataset.kind; renderAll();
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
let pending = null;   // {playerId, cardUid, enemyId, intentId, allyId, discard:[]} 或 {playerId, stanceTo}

const FLOW_HINTS = {
  1: "点一张角色卡让他进入聚光灯。",
  2: "挑一张卡打出。防御 / 援护 / 反击是接线卡——和攻击一样占一个行动槽，每轮限接一次。",
  attack3: "先选敌人，再选要对抗它的哪一条攻击意图。",
  attack4: "核对下方预览，然后投骰；也可以手填骰值代替随机。",
  reaction3: "选一条要接下的敌方攻击。可以接打向自己的，也可以替别人挡下来。",
  reaction4: "核对成功率后投骰。接线要花掉这一个行动槽，接完就算行动过了。",
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
  if (!p || playerDone(p)) return 1;
  const sel = currentSel();
  if (!sel || !sel.cardUid) return 2;
  const card = findCard(p, sel.cardUid);
  if (!card) return 2;
  const kind = kindOf(card);
  if (kind === "attack") return shotsReady(card, sel) && extrasReady(card, sel) ? 4 : 3;
  if (kind === "reaction") return sel.intentId ? 4 : 3;
  if (kind === "ally") return sel.allyId && extrasReady(card, sel) ? 4 : 3;
  if (kind === "foe") return sel.enemyId && extrasReady(card, sel) ? 4 : 3;
  // 凑不够时 discardNeed() 是 0（整条不发动、一张也不弃），否则这一步永远走不完
  return (sel.discard || []).length >= discardNeed(p, card) ? 4 : 3;
}
/* 多重攻击的每一击都独立选目标与意图；单次攻击是只有一击的特例。
   sel.shots[0] 与 sel.enemyId 保持同步，好让问答特效的 target 作用面仍指主目标。 */
function shotsOf(card, sel) {
  const n = card.hits || 1;
  if (!sel.shots || sel.shots.length !== n)
    sel.shots = Array.from({ length: n }, () => ({ enemyId: null, intentId: null }));
  return sel.shots;
}
const shotsReady = (card, sel) => shotsOf(card, sel).every(s => s.enemyId);
/* 给某一击自动挑一个还没被本卡其他击占用的待拼意图 */
function autoIntent(enemy, shots, k) {
  const used = shots.filter((x, i) => i !== k && x.enemyId === enemy.id).map(x => x.intentId);
  const free = liveAttackIntents(enemy).filter(i => !used.includes(i.id));
  return free.length ? free[0].id : null;
}

/* 需要额外指定对象才能结算的问答特效。
   增益 / 弃牌类卡的主流程不选敌人，可它们的问答可能指向敌人（如嫉妒·辅助的「对比」），
   这时也要补一个敌人选择器，否则那一条会静默落空。 */
const FOE_SCOPES = ["target", "adjOne", "adjAll", "otherAll"];
const wantExtraFoe = (card) => qaStats(card).some(q =>
  needsExtraFoe(q.stats) || q.stats.steal ||   // 「窃取」要指一个敌人来接这份减益
  (noFoeInFlow(card) && FOE_SCOPES.includes(q.stats.scope)));
const noFoeInFlow = (card) => ["ally", "self"].includes(kindOf(card));
const wantExtraAlly = (card) => qaStats(card).some(q => needsExtraAlly(q.stats));

/* ---------- 弃牌 ----------
   弃牌一律由玩家自选，没有随机弃牌。两个来源：
     基础弃牌   特殊卡的 stats.discard，问答的 discardKind 只限定种类、不改张数
     额外弃牌   问答的 extraDiscard，给本来没有弃牌步骤的卡（攻击卡的「吐故纳新」）用
   两者都从本卡所在那一组的未使用牌里挑，本卡自己正在打出所以不算在内。 */
const discardKindOf = (card) => qaStats(card).map(q => q.stats.discardKind).find(Boolean) || null;
const extraDiscardNeed = (card) => qaStats(card).reduce((n, q) => n + (q.stats.extraDiscard || 0), 0);
const DISCARD_KIND_LABEL = { attack: "攻击类", reaction: "防御 / 援护 / 反击类" };
/* 本卡可弃的牌。kind 限定时按 kindOf() 过滤——和建卡器里 discardKind 的取值同源 */
function discardPool(p, card) {
  const g = p_group(p, card), kind = discardKindOf(card);
  return availableCards(g).filter(c => c.uid !== card.uid && (!kind || kindOf(c) === kind));
}
/* 卡面要求弃几张 */
const discardWanted = (card) =>
  (kindOf(card) === "self" ? (statsOf(card)?.discard ?? 0) : 0) + extraDiscardNeed(card);
/* 实际要玩家点几张：凑不够就是 0——张数不够时整条不发动，
   那就一张也不弃，不能让人白付一半代价。 */
const discardNeed = (p, card) => {
  const want = discardWanted(card);
  return discardPool(p, card).length >= want ? want : 0;
};
/* 弃牌这个发动条件有没有满足。needDiscard 的条目以它为准 */
const discardMet = (p, card, sel) => {
  const want = discardWanted(card);
  return want > 0 && (sel.discard || []).length >= want;
};

function extrasReady(card, sel) {
  if (wantExtraFoe(card) && !sel.extraFoeId) return false;
  if (wantExtraAlly(card) && !sel.extraAllyId) return false;
  const p = state.players.find(x => x.id === sel.playerId);
  if (p && extraDiscardNeed(card) && (sel.discard || []).length < discardNeed(p, card)) return false;
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
  // 「吐故纳新」这类额外弃牌：卡本身没有弃牌步骤，在这里补一个
  if (extraDiscardNeed(card)) html += discardPickBlock(p, card, sel, "额外弃掉");
  return html;
}

/* 弃牌选择块。特殊卡的基础弃牌与额外弃牌共用，差别只在标题 */
function discardPickBlock(p, card, sel, verb) {
  const pool = discardPool(p, card), need = discardNeed(p, card);
  const kind = discardKindOf(card), picked = sel.discard || [];
  const wanted = discardWanted(card);
  return `
    <div class="spot-sec"><h3>${verb} ${wanted} 张${kind ? `${DISCARD_KIND_LABEL[kind]}的牌` : "牌"}（${picked.length} / ${wanted}）</h3>
      ${kind ? `<p class="hint">这一条特效只限定弃哪一类，不增加弃牌张数——下面只列出${DISCARD_KIND_LABEL[kind]}的牌。</p>` : ""}
      <div class="card-pick">${pool.map(c => `
        <div class="pick${picked.includes(c.uid) ? " sel" : ""}${need ? "" : " locked"}"${need ? ` data-disc="${c.uid}"` : ""}>
          <b>${esc(c.sinLabel)} · ${esc(c.traitLabel)}</b>
          <small>${esc(c.levelLabel)} · ${KIND_LABEL[kindOf(c)]}</small>
          <div class="pick-eff">${esc(c.effects[0] || "")}</div>
        </div>`).join("") || `<p class="hint">本组没有可弃的${kind ? DISCARD_KIND_LABEL[kind] + "的" : ""}牌了。</p>`}</div>
      ${!need ? `<p class="hint" style="color:var(--danger)">可弃的牌只有 ${pool.length} 张，凑不够 ${wanted} 张——
        弃牌是发动条件，<b>需要弃牌的那几条本次整条不发动</b>，也不会弃掉任何牌。
        本卡的伤害与其余不依赖弃牌的条目照常结算。</p>` : ""}
    </div>`;
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
  // 【切换】类单列：它们在切架势时才结算，摆在「打出这张卡会发生什么」里会误导
  const swi = card.qa.filter(q => q.onSwitchIn);
  const auto = qaStats(card), manual = card.qa.filter(q => !q.stats && !q.onSwitchIn);
  if (!auto.length && !manual.length && !swi.length) return "";
  return `<div class="spot-preview note">
    ${auto.length ? `<b>问答特效（自动结算）</b>${auto.map(q =>
      `<br>▸ ${esc(q.label)}——${esc(q.effect)} <span class="ptag${q.stats.partial ? " warn" : ""}">${
        q.stats.partial ? "部分自动，余下手动" : (SCOPE_LABEL[q.stats.scope] || "")}</span>`).join("")}` : ""}
    ${manual.length ? `${auto.length ? "<br><br>" : ""}<b>问答特效（需自行结算）</b>${manual.map(q =>
      `<br>▸ ${esc(q.label)}——${esc(q.effect)}`).join("")}` : ""}
    ${swi.length ? `<br><br><b>【切换】特效（切到本组时才触发，不在这次打出）</b>${swi.map(q =>
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
  const usable = (p) => !playerDone(p);
  const roster = activePlayers();
  if (!roster.length) {
    $("spotPick").innerHTML = `<p class="empty">所有角色都已倒下。改一下单位卡上的 HP 可以让人重新站起。</p>`;
    return;
  }
  $("spotPick").innerHTML = `
    <div class="pick-row">${roster.map(p => {
      const ok = usable(p);
      const tag = ok ? "点击出战" : "本回合已打完";
      return `<div class="pick-unit${ok ? "" : " done"}" data-spot="${p.id}">
        <div class="pu-head"><b>${esc(p.name)}</b><span class="pu-tag">${tag}</span></div>
        ${hpBar(p.hp, p.maxHp, p.temp, "mini")}
        <div class="pu-meta">行动槽 ${p.slotUsed}/${p.slotCount} · 架势 ${p.stance.toUpperCase()}组 · ${["a", "b"].map(g =>
        `${g.toUpperCase()}组 ${availableCards(p.groups[g]).length} 张`).join(" · ")}${
        p.interceptRound === state.round ? " · 本轮已接线" : ""}</div>
      </div>`;
    }).join("")}</div>`;

  $("spotPick").querySelectorAll("[data-spot]").forEach(el => el.onclick = () => {
    const p = state.players.find(x => x.id === +el.dataset.spot);
    if (!usable(p)) { toast(`${p.name} 本回合的行动槽已用完`); return; }
    state.spot = p.id; pending = null; renderAll();
  });
}

function renderSpot() {
  // 所有人行动完就轮到敌方攻击落地，聚光灯让位给收尾结算
  $("spotCard").hidden = allPlayersDone();
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

  const g = groupOf(p);
  // 常规牌只能从当前架势那一组出；接线牌两组都能用（它照样吃掉这一个槽）
  const reactAvail = ["a", "b"].flatMap(gid => availableCards(p.groups[gid]).filter(c => kindOf(c) === "reaction"));
  const slotAvail = availableCards(g).filter(c => kindOf(c) !== "reaction");
  const sel = sel0, card = card0;

  const head = `
    <div class="spot-head">
      <div class="sh-main"><b>${esc(p.name)}</b> · 槽 ${p.slotUsed + 1} / ${p.slotCount} ·
        <span class="ptag">架势 ${p.stance.toUpperCase()}组</span>
        <small>${g.mode ? `${esc(g.mode.模式)} · 拼点属性 ${esc(g.mode.拼点属性)} · ${esc(g.mode.副效果)}` : "未设定攻击模式"}</small></div>
      <button class="btn ghost mini" data-back="player">← 换人</button>
    </div>`;

  /* 一张卡为什么不能打——写清楚，比灰掉不解释好 */
  const lockReason = (c) => {
    if (kindOf(c) === "reaction") {
      if (p.noDefenseRound === state.round) return "本轮已「精疲力竭」，打不出接线卡";
      if (p.interceptRound === state.round) return "本轮已接过线";
      if (!liveIntents().length) return "当前没有敌方攻击意图可接";
      if (c.trait === "shield" && !liveIntents().some(({ i }) => i.targetId !== p.id))
        return "援护要替别人挡，当前没有打向他人的攻击";
      const st = statsOf(c), gg = p_group(p, c);
      const others = availableCards(gg).filter(x => x.uid !== c.uid);
      if (st?.require === "groupFull" && gg.used.length > 0) return "需本组所有卡片均未使用";
      if (st?.require === "groupEmpty" && others.length > 0) return "需本组已无其他可用卡";
    }
    return null;
  };

  let body;
  if (!card) {
    const shown = [...slotAvail, ...reactAvail];
    body = renderStancePick(p, sel) + `
      <div class="spot-sec"><h3>${p.stance.toUpperCase()}组剩余 ${availableCards(g).length} / ${g.cards.length} 张${availableCards(g).length === 0 ? "——用完即刷新" : ""}</h3>
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
              ${why ? `<span class="ptag mute">${why}</span>` : ""}
            </div>
            <div class="pick-eff">${esc(c.effects[0] || "")}</div>
          </div>`;
        }).join("") || `<p class="hint">没有可打的卡了。</p>`}</div>
        ${reactAvail.length ? `<p class="hint">接线卡和攻击一样占掉这一个行动槽——防御就是这一槽的行动，打完不能再出牌。每轮限接一次；接的那一击可以是打向队友的。</p>` : ""}
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

/* --- 架势：不借技能牌切换要花一个行动槽，所以摆在选卡这一步和卡片并列 ---
   免费的那个开关在角色卡上，供开局设定与 GM 纠正，两者职责分开。 */
function renderStancePick(p, sel) {
  const to = sel?.stanceTo && sel.stanceTo !== p.stance ? sel.stanceTo : null;
  const tiles = ["a", "b"].map(gid => {
    const gg = p.groups[gid], m = gg.mode, cur = p.stance === gid;
    return `<div class="pick-unit narrow${cur ? " sel" : ""}${to === gid ? " sel" : ""}"${cur ? "" : ` data-stance="${gid}"`}>
      <div class="pu-head"><b>${gid.toUpperCase()}组 · ${esc(m?.模式 || "未设定模式")}</b>
        <span class="pu-tag">${cur ? "当前架势" : "切换需 1 行动槽"}</span></div>
      <div class="pu-meta">${m ? `拼点属性 ${esc(m.拼点属性)} · ${esc(m.副效果)}` : "建卡时没给这一组选攻击模式"}
        <br>可用 ${availableCards(gg).length}/${gg.cards.length} 张${switchInEffects(p, gid).length ? ` · 有 ${switchInEffects(p, gid).length} 条【切换】特效` : ""}</div>
    </div>`;
  }).join("");

  const confirm = to ? `
    <div class="spot-preview" style="margin-top:10px">
      ${esc(p.name)} 换到 <b>${to.toUpperCase()}组 ${esc(modeName(p, to))}</b>，之后从这一组出牌
      <br><span style="color:var(--accent-2)">消耗一个行动槽——切换后行动槽变为 ${p.slotUsed + 1}/${p.slotCount}${
        p.slotUsed + 1 >= p.slotCount ? "，本回合行动结束" : ""}</span>
      ${switchInEffects(p, to).map(x => `<br>▸ ${esc(x.card.sinLabel)}·${esc(x.card.traitLabel)}「${esc(x.label)}」——${esc(x.effect)} <span class="ptag warn">需自行结算</span>`).join("")}
    </div>
    <div class="roll-row"><button class="btn primary big" id="btnStance">⇄ 切换架势（消耗一个行动槽）</button></div>` : "";

  return `<div class="spot-sec"><h3>架势</h3>
    <div class="pick-row">${tiles}</div>${confirm}</div>`;
}

/* --- 攻击卡：选敌人 → 选意图 → 投骰 --- */
function renderAttackTarget(p, card, sel) {
  if (!state.enemies.length) return foeEmptyBlock();
  const shots = shotsOf(card, sel), multi = shots.length > 1;
  const parts = clashParts(p, card), tc = thisCardMods(card);
  const mod = sumParts(parts) + tc.dice;
  const gid = groupIdOfCard(p, card);
  const ms = p.groups[gid]?.mode?.数值 || null;
  const tcTxt = [tc.dice ? `拼点骰 +${tc.dice}` : null, tc.damage ? `伤害 +${tc.damage}` : null,
    tc.intentDown ? `意图值 -${tc.intentDown}` : null].filter(Boolean).join("，");

  /* 每一击各自选目标与意图。多重攻击的两击是独立拼点，所以不能共用一个选择 */
  const shotBlock = (k) => {
    const s = shots[k];
    const enemy = state.enemies.find(e => e.id === s.enemyId);
    const head = multi ? `<h3>第 ${k + 1} 击 · 选择目标</h3>` : `<h3>选择目标</h3>`;
    const foeList = `
      <div class="spot-sec">${head}
        <div class="pick-row">${state.enemies.map(e => {
          const live = liveAttackIntents(e).length;
          // 已被本卡其他击占用的意图不再算作可拼
          const taken = shots.filter((x, i) => i !== k && x.enemyId === e.id && x.intentId).length;
          return `<div class="pick-unit${s.enemyId === e.id ? " sel" : ""}" data-foe="${e.id}" data-shot="${k}">
            <div class="pu-head"><b>${esc(e.name)}</b>
              <span class="pu-tag">${live ? `${live} 个待拼意图${taken ? `（${taken} 个已被本卡占用）` : ""}` : "无待拼意图"}</span></div>
            ${hpBar(e.hp, e.maxHp, e.temp, "foe mini")}
            ${intentBrief(e) ? `<div class="pu-meta"><span class="ptag mute">${intentBrief(e)}</span></div>` : ""}
          </div>`;
        }).join("")}</div>
        ${k === 0 ? `<button class="btn ghost mini" id="btnAddFoeInline">＋ 再加一个敌人</button>` : ""}
      </div>`;
    if (!enemy) return foeList;

    const used = shots.filter((x, i) => i !== k && x.enemyId === enemy.id).map(x => x.intentId);
    const live = liveAttackIntents(enemy);
    const intentList = `
      <div class="spot-sec">
        <div class="spot-head"><div class="sh-main"><b>${multi ? `第 ${k + 1} 击 · ` : ""}对抗哪个意图</b></div>
          <button class="btn ghost mini" data-back="foe" data-shot="${k}">← 换目标</button></div>
        <div class="pick-row">
          ${live.map(i => {
            const dup = used.includes(i.id);
            return `<div class="pick-unit narrow${s.intentId === i.id ? " sel" : ""}${dup ? " done" : ""}"
                ${dup ? "" : `data-intent="${i.id}" data-shot="${k}"`}>
              <div class="pu-head"><b>攻击意图 ${intentValue(enemy, i)}</b></div>
              <div class="pu-meta">${dup ? "已被另一击占用" : (esc(i.note) || "—")}</div></div>`;
          }).join("")}
          <div class="pick-unit narrow${s.intentId === null ? " sel" : ""}" data-intent="none" data-shot="${k}">
            <div class="pu-head"><b>单方面攻击</b></div>
            <div class="pu-meta">不拼点，自动命中</div></div>
        </div>
      </div>`;

    const intent = enemy.intents.find(i => i.id === s.intentId) || null;
    let preview;
    if (intent) {
      const dc = Math.max(0, intentValue(enemy, intent) - tc.intentDown);
      // 「完美计算」不投骰，结果是确定的——命中率退化成 0% / 100%，差值也是定值
      const fx = tc.fixedRoll != null;
      const fxVal = fx ? tc.fixedRoll + mod : 0;
      const fxHit = fx && fxVal >= dc, fxMargin = fxHit ? fxVal - dc : 0;
      // 不吃差值的卡（傲慢），预览里差值那一份也要一并抹掉，否则数字对不上
      const nm = !!card.noMarginDamage;
      const avgM = nm ? 0 : (fx ? fxMargin : avgMargin(mod, dc));
      preview = `${multi ? `<b>第 ${k + 1} 击</b> → ${esc(enemy.name)}<br>` : ""}${
          fx ? `拼点值 = ${tc.fixedRoll}（固定，不投骰） + ${partsText(parts)}${tc.dice ? ` 卡面+${tc.dice}` : ""} = <b>${fxVal}</b> 对 意图值 ${dc}`
             : `拼点值 = 1D6 + ${partsText(parts)}${tc.dice ? ` 卡面+${tc.dice}` : ""} = 1D6 + ${mod} 对 意图值 ${dc}`}${
          tc.intentDown ? `（原 ${intentValue(enemy, intent)}，卡面压低 ${tc.intentDown}）` : ""}
        <br>${fx ? `<b>${fxHit ? "必定命中" : "必定未命中"}</b>${nm ? "" : ` · 差值 ${fxMargin}`}`
                 : `命中率 <b>${pct(hitRate(mod, dc))}</b>${nm ? "" : ` · 命中时差值均值 ${avgMargin(mod, dc).toFixed(1)}`}`}
        ${card.baseDamage != null ? `<br>命中伤害 ${fx || nm ? "=" : "≈"} <b>${(card.baseDamage + avgM + tc.damage + (ms?.winDamage || 0)).toFixed(fx || nm ? 0 : 1)}</b>（基础 ${card.baseDamage}${nm ? "" : " + 差值"}${tc.damage ? ` + 卡面${tc.damage}` : ""}${ms?.winDamage ? ` + ${p.groups[gid].mode.模式}${ms.winDamage}` : ""}${nm ? "，本卡不计差值" : ""}）` : ""}
        ${ms?.loseDamage ? `<br>未命中仍造成 <b>${ms.loseDamage}</b> 点（${p.groups[gid].mode.模式}模式保底）` : ""}`;
    } else {
      const nm = !!card.noMarginDamage;
      preview = `${multi ? `<b>第 ${k + 1} 击</b> → ${esc(enemy.name)}<br>` : ""}<b>单方面攻击</b>——不拼点，自动命中${
          nm ? "，<b>本卡不计差值</b>" : "，<b>差值 = 拼点值</b>"}
        ${card.baseDamage != null ? `<br>${nm ? "伤害 = " : "期望伤害 ≈ "}<b>${
          nm ? (card.baseDamage + tc.damage)
             : (multi ? (card.baseDamage + tc.damage) : (card.baseDamage + 3.5 + mod + tc.damage).toFixed(1))}</b>` : ""}
        ${multi && !nm ? `<br><span style="color:var(--danger)">多重攻击的单方面那一击不计差值</span>` : ""}`;
    }
    return foeList + intentList + `<div class="spot-sec"><div class="spot-preview">${preview}</div></div>`;
  };

  const body = shots.map((_, k) => shotBlock(k)).join("");
  const extras = extraPickers(p, card, sel);   // 如「挑战众人」要另指一名相邻敌人
  const roll = `
    <div class="spot-sec">
      ${tcTxt ? `<div class="spot-preview"><span style="color:var(--accent-2)">卡面本次修正：${tcTxt}</span></div>` : ""}
      <div class="roll-row">
        <button class="btn primary big" id="btnGo">${tc.fixedRoll != null
          ? `✔ ${multi ? `结算（${shots.length} 击）` : "结算"}`
          : `🎲 ${multi ? `投骰结算（${shots.length} 击）` : "投骰结算"}`}</button>
        ${tc.fixedRoll != null
          ? `<span class="manual">「完美计算」不投骰，骰值固定为 ${tc.fixedRoll}</span>`
          : `<label class="manual">手动指定骰值 <input type="number" id="manualRoll" min="1" max="6" placeholder="1-6"></label>`}
      </div>
    </div>`;
  return body + extras + (shotsReady(card, sel) && extrasReady(card, sel) ? roll : "");
}

/* 成功时能拿到什么——防御的收益以前全在结算后才看得到，摆到投骰前来 */
function interceptWinPreview(p, card, e, i, target, mod, dc) {
  const st = statsOf(card), br = st?.win;
  if (!br) return "";
  const bits = [];
  if (br.block || br.allySafe) bits.push(`${esc(target?.name || "目标")} 不受伤害`);
  if (br.heal) bits.push(`恢复 ${br.heal} HP`);
  if (br.tempPerMargin) bits.push(`差值 ×${br.tempPerMargin} 转临时生命（均 ${(avgMargin(mod, dc) * br.tempPerMargin).toFixed(1)} 点）`);
  if (br.damage) bits.push(`对 ${esc(e.name)} 造成 ${br.damage} 点伤害`);
  // 「挡下全部意图」按敌人类型分流，把实际会多挡几条现算出来
  const all = qaStats(card).some(q => q.stats.win?.blockAll) || br.blockAll;
  if (all) {
    const mode = FOE_KINDS[e.kind || "mob"].blockAll;
    const extra = mode === "none" ? [] : liveAttackIntents(e).filter(x =>
      x.id !== i.id && (mode === "all" || x.targetId === target?.id));
    bits.push(mode === "none"
      ? `<span style="color:var(--danger)">${esc(e.name)} 是 BOSS，「挡下全部意图」无效</span>`
      : `一并挡下另外 <b>${extra.length}</b> 条攻击意图${mode === "same" ? "（精英：只算打向同一目标的）" : ""}`);
  }
  return bits.length ? `<br>成功时：${bits.join(" · ")}` : "";
}

/* --- 接线：在自己的行动里主动接下敌方某条攻击，占掉这一个行动槽 --- */
function renderInterceptTarget(p, card, sel) {
  // 援护是「替友方挡」，只能接打向别人的；防御与反击接谁的都行
  const pool = liveIntents().filter(({ e, i }) =>
    (card.trait !== "shield" || i.targetId !== p.id) &&
    !(e.noTarget || []).includes(i.targetId));   // 「不容置疑」禁掉的指向不再出现
  if (!pool.length) {
    return `<div class="foe-empty"><b>当前没有可接的攻击</b>
      <p>${card.trait === "shield"
        ? "援护要替别人挡下来，现在没有打向其他角色的攻击意图。"
        : "敌方没有未结算的攻击意图。可以在上方「敌人」面板加一条，或先让别人行动。"}</p></div>`;
  }
  // 没设「打向」的意图接不了：接线失败时要有人挨那份伤害，挨打的是谁属于规则判断，
  // 工具不替 GM 定。灰掉并写明原因，比让人一路走到投骰再静默失败好。
  const chosen = pool.find(({ e, i }) => i.id === sel.intentId && i.targetId);
  const list = `
    <div class="spot-sec"><h3>接下哪一击</h3>
      <div class="pick-row">${pool.map(({ e, i }) => {
        const t = state.players.find(x => x.id === i.targetId);
        const forSelf = i.targetId === p.id;
        return `<div class="pick-unit${sel.intentId === i.id && t ? " sel" : ""}${t ? "" : " done"}"${t ? ` data-icept="${i.id}"` : ""}>
          <div class="pu-head"><b>${esc(e.name)}</b>
            <span class="pu-tag">意图值 ${intentValue(e, i)}</span></div>
          <div class="pu-meta">基础伤害 ${dmgSpec(i)}（${dmgMin(i)}~${dmgMax(i)}） · 打向 <b>${t ? esc(t.name) : "未指定"}</b>
            ${t ? (forSelf ? "（你自己）" : "（替他挡）") : "——先在上方「敌人」面板的「打向」里指一个角色"}${
            i.note ? " · " + esc(i.note) : ""}</div>
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
        <br>成功率 <b>${pct(hitRate(mod, dc))}</b> · 成功时差值均值 ${avgMargin(mod, dc).toFixed(1)}
        ${interceptWinPreview(p, card, e, i, target, mod, dc)}
        <br>失败时伤害 = <b>${dmgSpec(i)}</b>（${foeDamageOut(e, dmgMin(i))}~${foeDamageOut(e, dmgMax(i))}${
          e.roundDmgDealt ? `，已计入本轮削弱 ${e.roundDmgDealt}` : ""}）+ (${dc} - 拼点值)${
          target && ((target.roundDmgDown || 0) + effDmgDown(target)) ? ` − ${esc(target.name)}减伤${(target.roundDmgDown || 0) + effDmgDown(target)}` : ""}，最低 0
        <br><span style="color:var(--accent-2)">接线占掉这一个行动槽——结算后 ${esc(p.name)} 的行动槽变为 ${p.slotUsed + 1}/${p.slotCount}${
          p.slotUsed + 1 >= p.slotCount ? "，本回合行动结束" : ""}</span>
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
          ${intentBrief(e) ? `<div class="pu-meta"><span class="ptag mute">${intentBrief(e)}</span></div>` : ""}
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
  const gid = groupIdOfCard(p, card), g = p.groups[gid];
  const need = discardNeed(p, card), picked = sel.discard || [];
  const list = discardPickBlock(p, card, sel, "选择弃掉");
  if (picked.length < need) return list;
  const met = discardMet(p, card, sel);
  return list + `
    <div class="spot-sec">
      <div class="spot-preview">${met
        ? `弃掉 <b>${picked.length}</b> 张牌，${esc(p.name)} 恢复 <b>${st.heal}</b> HP（问答特效的恢复另计）
           <br>弃牌同样消耗卡组循环——${gid.toUpperCase()}组 用掉 ${picked.length + 1} 张后剩 ${Math.max(0, availableCards(g).length - picked.length - 1)} 张。`
        : `凑不够 ${discardWanted(card)} 张，<b>不弃牌、基础恢复也不发动</b>——这张卡本次只会被消耗掉，
           不依赖弃牌的问答条目照常结算。`}</div>
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
      playerId: p.id, cardUid: +el.dataset.card,
      enemyId: null, intentId: null, shots: null, allyId: null,
      extraFoeId: null, extraAllyId: null, discard: []
    };
    renderAll();
  });
  $("spotBody").querySelectorAll("[data-back]").forEach(el => el.onclick = () => {
    const w = el.dataset.back;
    if (w === "player") { state.spot = null; pending = null; }
    else if (w === "card") pending = null;
    else if (w === "foe" && pending) {
      const k = el.dataset.shot != null ? +el.dataset.shot : 0;
      if (pending.shots?.[k]) { pending.shots[k].enemyId = null; pending.shots[k].intentId = null; }
      if (k === 0) { pending.enemyId = null; pending.intentId = null; }
    }
    renderAll();
  });
  // 架势磁贴与切换按钮在第 2 步就有，绑定要写在下面的 card 早退之前
  $("spotBody").querySelectorAll("[data-stance]").forEach(el => el.onclick = () => {
    pending = { playerId: p.id, stanceTo: el.dataset.stance };
    renderAll();
  });
  const stanceGo = $("btnStance");
  if (stanceGo) stanceGo.onclick = () => switchStance(p, sel.stanceTo);
  if (!card) return;
  $("spotBody").querySelectorAll("[data-foe]").forEach(el => el.onclick = () => {
    const id = +el.dataset.foe;
    if (kind !== "attack") { pending.enemyId = id; renderAll(); return; }
    const shots = shotsOf(card, pending), k = +el.dataset.shot;
    shots[k].enemyId = id;
    const e = state.enemies.find(x => x.id === id);
    shots[k].intentId = autoIntent(e, shots, k);
    // 选定第一击后，把还没指定的后续击默认放到同一个目标上（有「连击」可再改）
    if (k === 0) shots.forEach((sh, i) => {
      if (i > 0 && !sh.enemyId) { sh.enemyId = id; sh.intentId = autoIntent(e, shots, i); }
    });
    pending.enemyId = shots[0].enemyId;
    pending.intentId = shots[0].intentId;
    renderAll();
  });
  $("spotBody").querySelectorAll("[data-intent]").forEach(el => el.onclick = () => {
    const v = el.dataset.intent === "none" ? null : +el.dataset.intent;
    if (kind !== "attack") { pending.intentId = v; renderAll(); return; }
    const shots = shotsOf(card, pending);
    shots[+el.dataset.shot].intentId = v;
    pending.intentId = shots[0].intentId;
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
    const need = discardNeed(p, card);
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

/* 把玩家选好的弃牌真正弃掉。弃牌同样消耗卡组循环——整组用完即刷新，
   这正是暴食「循环加速」的设计意图。 */
function discardPicked(p, card, sel, g) {
  const picked = (sel.discard || []).map(u => g.cards.find(c => c.uid === u)).filter(Boolean);
  if (!picked.length) return { n: 0, lines: [] };
  picked.forEach(c => consumeCard(g, c));
  return { n: picked.length,
    lines: [`弃掉 ${picked.length} 张：${picked.map(c => `${c.sinLabel}·${c.traitLabel}`).join("、")}`] };
}

/* ---------- 切换架势：不借技能牌就要花一个行动槽 ---------- */
function switchStance(p, gid) {
  if (!gid || p.stance === gid) return;
  const lines = setStance(p, gid, "主动切换");
  p.slotUsed++;
  lines.push(`切换占一个行动槽——${p.name} 的行动槽 ${p.slotUsed}/${p.slotCount}${
    playerDone(p) ? "，本回合行动结束" : ""}`);
  if (playerDone(p)) state.spot = null;
  pending = null;
  pushLog(`【第${state.round}回合】${p.name} 切换架势 → ${gid.toUpperCase()}组 ${modeName(p, gid)}`, lines);
  renderAll();
}

/* ---------- 打出一张牌 ---------- */
function playCard(p, card, sel, kind) {
  const gid = groupIdOfCard(p, card), g = p.groups[gid];
  const lines = [];
  // 弃牌够不够要在结算问答之前就知道——needDiscard 那几条以它为发动条件。
  // 真正的消耗放在后面（攻击分支要先结算问答），这里只判断。
  const met = sel ? discardMet(p, card, sel) : false;
  // 本卡的恢复元修正（细嚼慢咽 / 微痛 / 暴食本能）——整张卡结算期间生效，末尾清掉
  cardHealMod = healModOf(card, { player: p });
  let title = `【第${state.round}回合】${p.name} 打出「${card.sinLabel}·${card.traitLabel}(${card.levelLabel})」`;

  /* 接线：不走攻击那套伤害结算，单独收尾——写在最前面免得漏掉那条 return */
  if (kind === "reaction") {
    // 意图可能在选中之后被别人拼掉、或压根没设「打向」。不拦住就会抛异常，
    // 表现成「按钮点了没反应」——非常难查，所以这里给明确提示后退出。
    const hit = liveIntents().find(x => x.i.id === sel.intentId);
    const target = hit && state.players.find(x => x.id === hit.i.targetId);
    if (!hit) { toast("这条攻击意图已经被结算掉了，请重新选一条"); pending = null; renderAll(); return; }
    if (!target) { toast("这条意图还没设「打向」，先在「敌人」面板指一个角色"); return; }
    const { e, i } = hit;
    const manual = +$("manualRoll")?.value;
    const parts = clashParts(p, card), tc = thisCardMods(card);
    // 目前只有傲慢·攻击带 fixedRoll，但接线也走这条路——先接上，免得以后加了张接线卡静默失效
    const roll = tc.fixedRoll ?? (manual >= 1 && manual <= 6 ? manual : d6());
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
    // 防御就是这一槽的行动，和攻击一样吃掉槽位，防完不能再动
    p.slotUsed++;
    lines.push(`接线占一个行动槽——${p.name} 的行动槽 ${p.slotUsed}/${p.slotCount}${
      playerDone(p) ? "，本回合行动结束" : ""}`);
    if (playerDone(p)) state.spot = null;
    lines.push(...reapDefeated());
    pending = null;
    cardHealMod = 0;
    pushLog(title, lines);
    renderAll();
    return;
  }

  if (kind === "attack") {
    const shots = shotsOf(card, sel);
    const manual = +$("manualRoll")?.value;
    // 拼点前的条件（优越/力量/拥有）要知道打的是谁、意图值多少、自己的属性值多少
    const firstFoe = state.enemies.find(e => e.id === shots[0]?.enemyId) || null;
    const firstInt = firstFoe && firstFoe.intents.find(i => i.id === shots[0]?.intentId && !i.resolved);
    const preCtx = { player: p, foe: firstFoe,
      dc: firstInt ? intentValue(firstFoe, firstInt) : null,
      attrVal: card.clashAttr ? (p.attrs[card.clashAttr] ?? 0) : null };
    const parts = clashParts(p, card), tc = thisCardMods(card, preCtx);
    const mod = sumParts(parts) + tc.dice;
    const ms = g.mode?.数值 || null;
    let anyHit = false, killedAny = false, toPanic = false, firstShotHit = null, allShotsHit = true;
    const tally = new Map();   // 敌人 id → 本卡累计伤害，多重攻击可能打在不同目标上
    if (tc.dice || tc.damage || tc.intentDown) {
      lines.push(`卡面本次修正：${[tc.dice ? `拼点骰 +${tc.dice}` : null,
        tc.damage ? `伤害 +${tc.damage}` : null,
        tc.intentDown ? `意图值 -${tc.intentDown}` : null].filter(Boolean).join("，")}`);
    }
    shots.forEach((s, h) => {
      const enemy = state.enemies.find(e => e.id === s.enemyId);
      if (!enemy) return;
      // 每一击拼自己那条意图；已被结算的退化为单方面
      const intent = enemy.intents.find(i => i.id === s.intentId && !i.resolved) || null;
      // fixedRoll 优先于手填与随机——「不投骰」是这条特效的全部意义
      const roll = tc.fixedRoll ?? (manual >= 1 && manual <= 6 ? manual : d6());
      // 分击修正（集中/压制/不懈/变招）只作用于第 h+1 击，条件要看第一击的结果
      const sm = shotMods(card, h + 1, { player: p, foe: enemy, firstHit: firstShotHit,
        sameTarget: shots.every(x => x.enemyId === shots[0].enemyId) });
      let shotMod = mod + sm.dice;
      if (sm.altAttr) {
        const alt = altAttrOf(p, card);
        if (alt) { shotMod += (p.attrs[alt] ?? 0) - (p.attrs[card.clashAttr] ?? 0);
                   lines.push(`第${h + 1}击改用另一组的拼点属性 ${alt}(${p.attrs[alt] ?? 0})`); }
      }
      const r = resolveAttack({ card, mod: shotMod, modeStats: ms, enemy, intent, roll,
        bonusDamage: tc.damage + sm.damage, dcDown: tc.intentDown });
      let dmg = r.damage;
      // 单方面那一击不计差值，但卡面与分击的加伤照算——原来漏了 sm.damage
      if (shots.length > 1 && r.oneSided) dmg = (card.baseDamage ?? 0) + tc.damage + sm.damage;
      tally.set(enemy.id, (tally.get(enemy.id) || 0) + dmg);
      if (r.hit) anyHit = true; else allShotsHit = false;
      if (h === 0) firstShotHit = r.hit;
      // 「贪得无厌」「怒不可遏」要知道这一击把目标打成了什么样（合计伤害稍后才落地，先预判）
      if (r.hit && dmg > 0) {
        const after = enemy.hp - (tally.get(enemy.id) || 0) - (enemy.roundDmgTaken || 0);
        if (after <= 0) killedAny = true;
        else if (after <= Math.floor(enemy.maxHp * 0.5)) toPanic = true;
      }
      lines.push(`第${h + 1}击 → ${enemy.name}：${tc.fixedRoll != null ? `骰值固定 ${roll}（不投骰）` : `1D6=${roll}`} + ${shotMod}(${partsText(parts)}${tc.dice ? ` 卡面+${tc.dice}` : ""}${sm.dice ? ` 分击+${sm.dice}` : ""}) → 拼点值 ${r.clashVal}` +
        (r.oneSided ? `（单方面，自动命中）` : ` 对 意图值 ${r.dc} → ${r.hit ? "命中" : "未命中"}`) +
        ` · 伤害 ${dmg}`);
      if (intent) intent.resolved = true;
    });
    let totalDealt = 0;
    for (const [eid, total] of tally) {
      const enemy = state.enemies.find(e => e.id === eid);
      const r = damageFoe(enemy, total);
      totalDealt += r.dmg;
      lines.push(`${enemy.name} 合计承受 ${r.bonus ? `${total} + 本轮易伤 ${r.bonus} = ${r.dmg}` : r.dmg}${
        r.absorbed ? `（临时生命吸收 ${r.absorbed}）` : ""}，剩余 ${enemy.hp}/${enemy.maxHp}`);
    }
    const hitNames = [...tally.keys()].map(id => state.enemies.find(e => e.id === id)?.name).filter(Boolean);
    title += ` 攻击 ${hitNames.join("、")}`;
    const added = card.hits > 1 ? addExtraCard(g, card) : null;
    // 「精益求精」：追加卡也带上本卡选中的那条特效（建卡器已把它导出在 extraCard.granted 里）
    if (added && qaStats(card).some(q => q.stats.grantExtra) && card.extraCard?.granted)
      lines.push(`※ 精益求精：追加的那张也带上「${card.extraCard.granted.label}」`);
    if (added) lines.push(`※ 多重攻击：一张「${added.sinLabel} · 普通攻击」已加入 ${gid.toUpperCase()}组`);
    lines.push(...applyAllQa(card, {
      player: p, foe: state.enemies.find(e => e.id === shots[0].enemyId),
      extraFoe: state.enemies.find(x => x.id === sel.extraFoeId),
      extraAlly: state.players.find(x => x.id === sel.extraAllyId)
    }, { hit: anyHit, discardMet: met, killed: killedAny, killedToPanic: toPanic,
         firstHit: firstShotHit, allHit: allShotsHit, dealt: totalDealt,
         dc: preCtx.dc, attrVal: preCtx.attrVal }));

  } else if (kind === "ally") {
    const t = state.players.find(x => x.id === sel.allyId), st = statsOf(card);
    title += ` → ${t.name}`;
    if (st) {
      if (st.heal) lines.push(healLine(t, st.heal));
      if (st.temp) lines.push(tempLine(t, st.temp));
      if (st.diceUp) { t.roundDice += st.diceUp; lines.push(`${t.name} 本轮拼点骰 +${st.diceUp}（累计 +${t.roundDice}）`); }
    } else lines.push("（旧版存档无结构化数值，效果请手动结算）");
    lines.push(...applyAllQa(card, {
      player: p, foe: null,
      extraFoe: state.enemies.find(x => x.id === sel.extraFoeId),
      extraAlly: state.players.find(x => x.id === sel.extraAllyId)
    }, { discardMet: met }));

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
    }, { discardMet: met }));
    const now = liveAttackIntents(e).map(i => intentValue(e, i));
    if (now.length) lines.push(`${e.name} 当前待拼意图值：${now.join("、")}（累计 -${e.roundIntentMod}）`);

  } else {   // self：弃牌
    const st = statsOf(card);
    lines.push(...discardPicked(p, card, sel, g).lines);
    // 弃牌是这张卡的发动条件：张数凑不够时基础恢复也不给
    if (st?.heal && met) lines.push(healLine(p, st.heal));
    else if (st?.heal) lines.push(`可弃的牌凑不够 ${discardWanted(card)} 张，基础恢复不发动`);
    lines.push(...applyAllQa(card, {
      player: p, foe: null,
      extraFoe: state.enemies.find(x => x.id === sel.extraFoeId),
      extraAlly: state.players.find(x => x.id === sel.extraAllyId)
    }, { discardMet: met }));
  }

  // 额外弃牌（「吐故纳新」）：不是弃牌卡的基础步骤，所以在各分支之外统一结算，
  // 但要赶在下面消耗本卡之前——否则卡组刷新的时机会算错
  if (kind !== "self") lines.push(...discardPicked(p, card, sel, g).lines);

  const refreshed = consumeCard(g, card);
  if (refreshed) lines.push(`※ ${gid.toUpperCase()}组已用完，卡组刷新`);
  lines.push(`${gid.toUpperCase()}组 剩余 ${availableCards(g).length}/${g.cards.length} 张`);

  p.slotUsed++;
  pending = null;
  if (playerDone(p)) state.spot = null;
  lines.push(...reapDefeated());   // 整张卡结算完再清场
  cardHealMod = 0;
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
      state.duel = { enemyId: eid, intentId: iid };
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
  // 未接线的伤害要到结算时才掷骰，这里只能给区间（已计入本轮对它的出伤削弱）
  const gap = dc - (target.attrs.体魄 ?? 0);
  const cut = (target.roundDmgDown || 0) + effDmgDown(target);   // 目标本轮减伤（含状态槽）
  const noGuardMin = Math.max(0, foeDamageOut(e, dmgMin(i)) + gap - cut);
  const noGuardMax = Math.max(0, foeDamageOut(e, dmgMax(i)) + gap - cut);

  $("foeBody").innerHTML = `
    <div class="spot-head">
      <div class="sh-main"><b>${esc(e.name)}</b> 的攻击意图 · 意图值 <b>${dc}</b> · 基础伤害 <b>${dmgSpec(i)}</b>
        <small>打向 ${esc(target.name)}（${target.hp}/${target.maxHp}${target.temp ? ` +${target.temp}` : ""}）${i.note ? " · " + esc(i.note) : ""}</small></div>
      <button class="btn ghost mini" id="btnDuelBack">← 换一条意图</button>
    </div>
    <div class="spot-sec"><div class="spot-preview">
      没人接下这一击，自动命中 ${esc(target.name)}
      <br>${dmgSpec(i)}${e.roundDmgDealt ? ` − 本轮削弱${e.roundDmgDealt}` : ""} + (意图值 ${dc} - 体魄 ${target.attrs.体魄 ?? 0})${
        cut ? ` − 本轮减伤${cut}` : ""} = <b>${noGuardMin}~${noGuardMax}</b> 点（结算时现掷）
      <br><span class="mute">接线要占行动槽，只能在自己的行动里提前打出——走到这一步大家的槽位都空了。</span>
    </div></div>
    <div class="roll-row"><button class="btn primary big" id="btnGuard">✔ 承受这一击</button></div>`;
  $("btnDuelBack").onclick = () => { state.duel = null; renderAll(); };
  $("btnGuard").onclick = () => doGuard(e, i, target);
}

/* 没人接下的攻击落地。到这一步不存在接线分支——接线在各自的行动里就结算完了 */
function doGuard(enemy, intent, target) {
  const lines = [];
  const title = `【第${state.round}回合】${enemy.name} 攻击 ${target.name}（意图值 ${intentValue(enemy, intent)}）`;

  const dmgRoll = rollDamage(intent);
  const dc = intentValue(enemy, intent);
  const base = foeDamageOut(enemy, dmgRoll.total);
  const dmg = Math.max(0, base + (dc - (target.attrs.体魄 ?? 0)));
  const r = damagePlayer(target, dmg);
  lines.push(`未接线，自动命中`);
  lines.push(`基础伤害 ${dmgText(intent, dmgRoll)}${
    enemy.roundDmgDealt ? ` − 本轮削弱 ${enemy.roundDmgDealt} = ${base}` : ""}，加上 (意图值 ${dc} - 体魄 ${target.attrs.体魄 ?? 0}) = ${dmg} 点`);
  lines.push(`${target.name} 受到 ${r.dmg} 点伤害${r.cut ? `（本轮减伤 ${r.cut}）` : ""}${r.absorbed ? `（临时生命吸收 ${r.absorbed}）` : ""}，剩余 ${target.hp}/${target.maxHp}`);
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
  const endLines = resolveRoundEnd();     // 灼烧一类的延时伤害在回合切换时落地
  state.round++;
  state.players.forEach(p => {
    p.slotUsed = 0; p.roundDice = 0; p.roundDmgDown = 0; p.actedRound = 0;   // 本轮增益随回合失效
    p.hurtThisRound = false; p.roundHealMod = 0;
    // 「久眠」给的是**下一轮**的防御加骰，所以在跨回合这一刻兑现
    p.roundGuardDice = p.nextRoundGuardDice || 0; p.nextRoundGuardDice = 0;
    p.effects = (p.effects || []).filter(e => e.lasting);   // 持续型状态跨回合保留，等人来解
  });
  state.enemies.forEach(e => {
    // 减益类同样只持续本轮
    e.roundIntentMod = 0; e.roundDmgTaken = 0; e.roundDmgDealt = 0; e.roundNoHeal = false;
    e.noTarget = [];
    e.intents.forEach(i => {
      i.resolved = false;
      // 「拖延」推迟过来的意图：这一轮兑现，把叠加值折进去
      if (i.delayed) { i.value += i.delayed; i.delayed = 0; i.note = (i.note || "").replace(/（已推迟[^）]*）/, ""); }
      if (!i.targetId && state.players.length) i.targetId = state.players[0].id;
    });
  });
  state.spot = null; pending = null; state.duel = null;
  pushLog(`—— 进入第 ${state.round} 回合 ——`,
    endLines.concat(["所有人可再次行动；接线次数与本轮增益 / 减益已重置；敌方意图重置为未结算"]));
  renderAll();
}
/* 回合结束时才落地的效果（灼烧）。以前没有这个钩子，所以那两条只能手动 */
function resolveRoundEnd() {
  const out = [];
  for (const t of state.pendingEnd || []) {
    const e = state.enemies.find(x => x.id === t.enemyId);
    if (!e) continue;
    const r = damageFoe(e, t.damage);
    out.push(`${t.label}：${e.name} 在回合结束时受到 ${r.dmg} 点伤害，剩余 ${e.hp}/${e.maxHp}`);
  }
  state.pendingEnd = [];
  out.push(...reapDefeated());
  return out;
}
$("btnNextRound").onclick = nextRound;
$("btnResetAll").onclick = () => {
  if (!confirm("清空所有角色、敌人和日志，重新开始一场战斗？")) return;
  state.round = 1;
  state.players = []; state.enemies = []; state.log = []; state.pendingEnd = [];
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
