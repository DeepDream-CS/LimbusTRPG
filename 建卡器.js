/* ============ Limbus Company TRPG 2.0 · 权威规则数据与罪人建卡/成长器 ============
   本文件是全部 2.0 规则数据的唯一权威来源：
     · index.html      7 步罪人创建与战役升级向导（导出 JSON / 骰娘指令 / 角色长图）
     · 题库.html        直接引用本文件展示 2.0 规则书、七罪词条池、E.G.O 与工坊图鉴
     · 敌人制作器.html  直接引用本文件读取七罪名、物理模式与五阶危险度配怪基准尺

   ※ 硬性约定：文件末尾一切 DOM 绑定与初始化必须包裹在 `if (stageCard) { ... }` 内，
     使没有 #stageCard 的页面把本文件当作纯数据模块加载，不触发任何渲染或存档副作用。 */

const SIN_ORDER = ["wrath", "lust", "sloth", "gluttony", "gloom", "pride", "envy"];
const SIN_LABELS = {
  wrath: "暴怒", lust: "色欲", sloth: "怠惰", gluttony: "暴食",
  gloom: "忧郁", pride: "傲慢", envy: "嫉妒"
};
const SIN_COLORS = {
  wrath: "#e02c2c", lust: "#f2790e", sloth: "#f2c40f", gluttony: "#6dbe45",
  gloom: "#2f79c2", pride: "#49c6f0", envy: "#a24f9e"
};
const sinIcon = (sin) => SIN_LABELS[sin]
  ? `<img class="sin-icon" src="图片/${SIN_LABELS[sin]}.png" alt="${SIN_LABELS[sin]}" loading="lazy">` : "";

const SIN_DEFINITIONS = {
  wrath: {
    keywords: ["狂战", "损血爆发", "范围溅射"],
    summary: "拒绝忍受不公的怒火。擅长以血换血、残血反扑与无差别横扫。",
    quote: "“若世界不肯让路，那就把它烧成平地。”"
  },
  lust: {
    keywords: ["渴血", "连结续航", "压力抚慰"],
    summary: "对生命温度与连结的执着。命中汲取生命、支援队友并平复精神压力。",
    quote: "“痛楚证明我们还活着，贴近我，别松手。”"
  },
  sloth: {
    keywords: ["坚壁", "护盾反打", "震颤破防"],
    summary: "拒绝无谓消耗的厚重壁垒。叠起高额护盾、以盾猛击并强推敌方混乱线。",
    quote: "“何必急着挥刀？等他们撞碎在墙上就够了。”"
  },
  gluttony: {
    keywords: ["吞噬", "碎片引擎", "无视护甲"],
    summary: "永不满足的饥饿熔炉。大量产出公共罪孽碎片供全队开大，吞除敌方增益与护盾。",
    quote: "“还不够……把他们的铠甲和希望一并嚼碎！”"
  },
  gloom: {
    keywords: ["沉沦", "威力压制", "精神直伤"],
    summary: "浸透骨髓的悲恸低语。直接压低敌人整轮意图威力，为全队创造绝对安全的拼点环境。",
    quote: "“沉下去吧，在深水里连挥拳的力气都会消失。”"
  },
  pride: {
    keywords: ["剑心", "拼点霸权", "差值处决"],
    summary: "不容置疑的绝对技艺。拥有全罪孽最高的拼点补正与突破上限的差值暴击。",
    quote: "“败者甚至不配让我投出第二颗骰子。”"
  },
  envy: {
    keywords: ["充能", "过载倾泻", "连锁雷击"],
    summary: "不甘落后的高压电流。借用自身最强属性或消耗罪孽池碎片，倾泻暴烈的多段追击。",
    quote: "“凭什么只有你能闪耀？把那份力量借我一用！”"
  }
};

/* 当回合【罪孽共鸣】：全队同回合打出 ≥2 同色触发共鸣，≥3 同色触发完全共鸣 */
const SIN_RESONANCE = {
  wrath:    { base: "本次伤害 +2", full: "本次伤害 +4", stats: { dmg: 2 }, fullStats: { dmg: 4 } },
  lust:     { base: "出招者或最低血队友恢复 2 HP", full: "恢复 4 HP", stats: { lustHeal: 2 }, fullStats: { lustHeal: 4 } },
  sloth:    { base: "出招者立即获得 3 点本回合护盾", full: "获得 5 点本回合护盾", stats: { shield: 3 }, fullStats: { shield: 5 } },
  gluttony: { base: "公共罪孽池额外 +1 颗本色碎片", full: "额外 +2 颗本色碎片", stats: { extraSin: 1 }, fullStats: { extraSin: 2 } },
  gloom:    { base: "所指目标本回合所有意图威力 -1（同目标取最高）", full: "所有意图威力 -2", stats: { foePowerDown: 1 }, fullStats: { foePowerDown: 2 } },
  pride:    { base: "本次拼点威力 +1", full: "本次拼点威力 +2", stats: { power: 1 }, fullStats: { power: 2 } },
  envy:     { base: "命中后追加 2 点无视耐性的雷击伤", full: "追加 4 点无视耐性的雷击伤", stats: { trueDmg: 2 }, fullStats: { trueDmg: 4 } }
};

/* 六维属性定义 */
const ATTR_DEFS = [
  { key: "力量", combat: "【打击】拼点 · 反击伤害", daily: "破门、角力、搬运、威慑" },
  { key: "灵巧", combat: "【斩击】拼点 · 闪避拼点", daily: "潜行、开锁、追逃、手艺" },
  { key: "认知", combat: "【突刺】拼点 · 弱点洞察", daily: "搜证、推理、医疗、奇点科技" },
  { key: "体魄", combat: "最大生命(16+4×体魄) · 格挡护盾", daily: "抗毒、长途奔袭、硬吃冲击" },
  { key: "意志", combat: "罪孽压力上限(3+意志)", daily: "抵抗恐慌、审讯、精神污染" },
  { key: "共感", combat: "支援增益 · E.G.O 亲和", daily: "交涉、话术、读心、安抚异想体" }
];
const BASE_FREE_POINTS = 6;   // 6 项基础各 1（共6）+ 初始自由分配 6 = 初始总点 12

/* 物理招式类型（不再设架势切换，直接绑在每个技能上） */
const PHYS_MODES = {
  slash:  { key: "slash",  label: "斩击", attr: "灵巧", desc: "以灵巧拼点，针对斩击弱点" },
  strike: { key: "strike", label: "打击", attr: "力量", desc: "以力量拼点，针对打击弱点" },
  pierce: { key: "pierce", label: "突刺", attr: "认知", desc: "以认知拼点，针对突刺弱点" }
};

/* 五阶都市危险度（串联玩家成长里程碑与 GM 30秒配怪尺） */
const RISK_ORDER = ["ZAYIN", "TETH", "HE", "WAW", "ALEPH"];
const RISK_TIERS = {
  ZAYIN: {
    label: "ZAYIN", rankText: "9~8 阶收尾人（初始建卡）",
    attrCap: 3, bonusPts: 0, slots: 1, egoSlots: ["ZAYIN"], charmCap: 1,
    unlockNote: "初始面板：单项属性上限 3，1 个行动槽，装备本命 ZAYIN E.G.O"
  },
  TETH: {
    label: "TETH", rankText: "7~6 阶收尾人（成长期）",
    attrCap: 4, bonusPts: 1, slots: 1, egoSlots: ["ZAYIN", "TETH"], charmCap: 1,
    unlockNote: "自由属性点 +1，单项上限突破至 4，解锁 TETH 级异想体 E.G.O 槽"
  },
  HE: {
    label: "HE", rankText: "5~4 阶收尾人（中坚突破）",
    attrCap: 4, bonusPts: 2, slots: 2, egoSlots: ["ZAYIN", "TETH", "HE"], charmCap: 1,
    unlockNote: "★ 永久解锁第 2 个行动槽！累计自由属性点 +2，解锁 HE 级 E.G.O 槽"
  },
  WAW: {
    label: "WAW", rankText: "3~2 阶收尾人（翼之特遣）",
    attrCap: 5, bonusPts: 3, slots: 2, egoSlots: ["ZAYIN", "TETH", "HE", "WAW"], charmCap: 2,
    unlockNote: "单项属性上限突破至 5！累计自由属性点 +3，解锁 WAW 级 E.G.O 槽与第 2 饰品槽"
  },
  ALEPH: {
    label: "ALEPH", rankText: "1 阶收尾人 / 都市之星（终局传奇）",
    attrCap: 5, bonusPts: 5, slots: 2, egoSlots: ["ZAYIN", "TETH", "HE", "WAW"], charmCap: 2,
    alephAwaken: true,
    unlockNote: "累计自由属性点 +5，本命 ZAYIN E.G.O 威力额外 +2 且免除压力消耗"
  }
};

/* GM 30秒配怪五阶数值基准尺（S = 参战罪人总行动槽数） */
const GM_SCALE_TABLE = {
  ZAYIN: { mobHp: 12, eliteHpPerS: 15, bossBodyPerS: 20, bossPartPerS: 10, light: [6, 4], heavy: [8, 6], ult: [10, 8] },
  TETH:  { mobHp: 16, eliteHpPerS: 18, bossBodyPerS: 25, bossPartPerS: 12, light: [7, 5], heavy: [9, 7], ult: [11, 9] },
  HE:    { mobHp: 22, eliteHpPerS: 20, bossBodyPerS: 25, bossPartPerS: 14, light: [8, 6], heavy: [11, 8], ult: [13, 11] },
  WAW:   { mobHp: 28, eliteHpPerS: 24, bossBodyPerS: 30, bossPartPerS: 16, light: [9, 7], heavy: [12, 10], ult: [15, 13] },
  ALEPH: { mobHp: 35, eliteHpPerS: 30, bossBodyPerS: 36, bossPartPerS: 20, light: [10, 8], heavy: [14, 12], ult: [17, 15] }
};

/* 人格同期化（Uptie Ⅰ ~ Ⅳ 阶） */
const UPTIE_LEVELS = {
  1: { lv: 1, roman: "Ⅰ阶同期", cost: 0, desc: "初始状态：3 个基础技能 + 普通守备" },
  2: { lv: 2, roman: "Ⅱ阶同期", cost: 3, desc: "消耗 3 纺锤：【守备】染上主导罪孽（可产碎片与共鸣），并解锁 1 条【人格被动】" },
  3: { lv: 3, roman: "Ⅲ阶同期", cost: 8, desc: "累计 8 纺锤：一/二/三技能基础伤害各 +1（变为 4/6/8），且二技能额外加选 1 条【轻词条】" },
  4: { lv: 4, roman: "Ⅳ阶同期", cost: 16, desc: "累计 16 纺锤：三技能完全体觉醒（自选「拼点威力额外 +1」或「冷却缩短至 1 回合」）" }
};

/* 三种守备姿态（无冷却，随时可拉线接敌） */
const DEFENSE_TYPES = {
  block: {
    key: "block", label: "格挡", attr: "体魄",
    formula: "不拼点 · 投 1D6 + 体魄 获得本回合护盾",
    effect: "不进行拼点胜负比较，投 1D6 + 体魄 获得等量本回合护盾并接下敌方该条攻击的基础伤害（不承受拼输差值与压力惩罚）；剩余护盾保留至本回合结束。"
  },
  evade: {
    key: "evade", label: "闪避", attr: "灵巧",
    formula: "投 1D6 + 灵巧 ≥ 敌方威力 则无伤连闪",
    effect: "投 1D6 + 灵巧 对抗敌方意图威力：大于或等于则完全无伤躲避，且保留该点数自动对本回合后续打向你的单方面攻击继续判定闪避；若小于则全额承受敌方基础伤害（不加差值）。"
  },
  counter: {
    key: "counter", label: "反击", attr: "力量",
    formula: "不拼点 · 先获体魄点护盾硬吃，未倒地则必反打 力量+3",
    effect: "不进行拼点，立即获得固定【体魄】点本回合护盾并承受敌方本次基础伤害；结算后只要你未倒地，立刻对攻击者造成【力量 + 3】点无视耐性的反击伤害。"
  }
};

/* 七大罪孽词条池（全部带机器可读 stats，当回合立即结算） */
const SIN_TRAITS = {
  wrath: {
    light: [
      { id: "wr_l1", label: "狂怒", effect: "本次伤害 +1", stats: { dmg: 1 } },
      { id: "wr_l2", label: "嗜痛", effect: "若当前 HP > 2，无视护盾自损 2 HP，使本次伤害 +3", stats: { selfHpCost: 2, dmg: 3 } },
      { id: "wr_l3", label: "余波", effect: "拉线拼赢时，对另一名敌人/部位造成 2 点伤害", stats: { winOnly: true, splashOne: 2 } }
    ],
    core: [
      { id: "wr_c1", label: "怒火中烧", effect: "若你当前 HP ≤ 混乱线，本次拼点威力 +1 且伤害 +3", stats: { cond: "hpBelowStagger", power: 1, dmg: 3 } },
      { id: "wr_c2", label: "舍身猛击", effect: "若当前 HP > 3，无视护盾自损 3 HP，本次拼点威力 +1 且伤害 +3", stats: { selfHpCost: 3, power: 1, dmg: 3 } },
      { id: "wr_c3", label: "横扫千军", effect: "命中时，对所有其他敌人/部位各造成 3 点伤害", stats: { splashAll: 3 } }
    ],
    ace: [
      { id: "wr_a1", label: "血债血偿", effect: "本次伤害 +3；若此击击杀目标或使其陷入【混乱】，你恢复 5 HP", stats: { dmg: 3, onKillOrStagger: { heal: 5 } } },
      { id: "wr_a2", label: "焦土轰击", effect: "命中后，全场所有其他敌人/部位均受到 4 点暴怒伤害", stats: { splashAll: 4 } }
    ],
    passive: [
      { id: "wr_p1", label: "不屈狂血", effect: "回合开始时若你当前 HP ≤ 混乱线，本回合你的所有攻击伤害 +2", stats: { lowHpDmg: 2 } },
      { id: "wr_p2", label: "复仇余烬", effect: "每当你承受敌方伤害未倒地，你本回合下一次攻击伤害 +2", stats: { hurtDmg: 2 } }
    ],
    egoZayin: [
      { id: "wr_e1", name: "怨愤", effect: "命中后敌方全体本回合受到的后续伤害 +2，且对另一部位宣泄 4 点伤害", stats: { allFoeVuln: 2, splashOne: 4 } },
      { id: "wr_e2", name: "憎恶", effect: "无视护盾自损 3 HP，使本次 E.G.O 拼点威力额外 +2、伤害额外 +5", stats: { selfHpCost: 3, power: 2, dmg: 5 } }
    ]
  },
  lust: {
    light: [
      { id: "lu_l1", label: "汲取", effect: "命中后你恢复 2 HP", stats: { selfHeal: 2 } },
      { id: "lu_l2", label: "鼓舞", effect: "打出时，令一名队友本回合下一次拼点威力 +1", stats: { allyBuff: { power: 1 } } },
      { id: "lu_l3", label: "抚慰", effect: "命中后，你或压力最高的一名队友罪孽压力 -1", stats: { allyOrSelfPressureDown: 1 } }
    ],
    core: [
      { id: "lu_c1", label: "鲜血盛宴", effect: "命中后你恢复 4 HP（若目标正处于【混乱】，改为恢复 6 HP）", stats: { selfHeal: 4, staggerHeal: 6 } },
      { id: "lu_c2", label: "狂热号令", effect: "打出时，令一名队友获得 3 点本回合护盾且本回合伤害 +2", stats: { allyBuff: { shield: 3, dmg: 2 } } },
      { id: "lu_c3", label: "放血割裂", effect: "命中后追加 3 点无视耐性的流血直伤", stats: { trueBonusDmg: 3 } }
    ],
    ace: [
      { id: "lu_a1", label: "生命绽放", effect: "命中后全队存活角色各恢复 4 HP，且你的罪孽压力 -1", stats: { teamHeal: 4, selfPressureDelta: -1 } },
      { id: "lu_a2", label: "执念缠身", effect: "本次拼点威力 +1；命中后你恢复 5 HP", stats: { power: 1, selfHeal: 5 } }
    ],
    passive: [
      { id: "lu_p1", label: "渴血本能", effect: "你的色欲技能每次命中额外使你恢复 1 HP", stats: { sinHitHeal: 1 } },
      { id: "lu_p2", label: "共鸣脉搏", effect: "每当全队触发色欲共鸣时，你的罪孽压力自动 -1", stats: { resCalm: true } }
    ],
    egoZayin: [
      { id: "lu_e1", name: "渴慕", effect: "命中后全队所有存活角色立即恢复 4 HP，且罪孽压力各 -1", stats: { teamHeal: 4, teamPressureDown: 1 } },
      { id: "lu_e2", name: "眷恋（纯支援）", effect: "不攻击敌人；立即为全队存活角色恢复 6 HP、获得 3 护盾并各减 1 点压力", stats: { supportOnly: true, teamHeal: 6, teamShield: 3, teamPressureDown: 1 } }
    ]
  },
  sloth: {
    light: [
      { id: "sl_l1", label: "蓄甲", effect: "打出时你立即获得 3 点本回合护盾", stats: { selfShield: 3 } },
      { id: "sl_l2", label: "震击", effect: "判定目标是否跌入【混乱】时，将其混乱线临时视作提高 3 点", stats: { staggerLineBoost: 3 } },
      { id: "sl_l3", label: "迟缓", effect: "无论成败，交锋后使目标本回合其余未结算意图威力 -1", stats: { foeOtherPowerDownAlways: 1 } }
    ],
    core: [
      { id: "sl_c1", label: "重装壁垒", effect: "打出时你与一名队友各获得 4 点本回合护盾", stats: { selfShield: 4, allyBuff: { shield: 4 } } },
      { id: "sl_c2", label: "盾牌猛击", effect: "本次伤害额外加上你当前的护盾值（最多 +5）", stats: { dmgFromShield: 5 } },
      { id: "sl_c3", label: "粉碎震荡", effect: "对已【混乱】目标伤害 +5；对未混乱目标伤害 +2 且无视耐性", stats: { dmg: 2, ignoreResist: true, staggerExtraDmg: 3 } }
    ],
    ace: [
      { id: "sl_a1", label: "不动明王", effect: "打出时先获得 6 点本回合护盾，且本次伤害额外 +4", stats: { selfShield: 6, dmg: 4 } },
      { id: "sl_a2", label: "大地震颤", effect: "拉线拼赢后，震碎目标另一条普通意图（对 Boss 躯干改为使其余意图威力 -2）", stats: { winOnly: true, breakExtraIntent: true } }
    ],
    passive: [
      { id: "sl_p1", label: "岩层护甲", effect: "每回合开始时，你自动获得 2 点本回合护盾", stats: { roundStartShield: 2 } },
      { id: "sl_p2", label: "钝感躯体", effect: "你的混乱线降低 2 点（更不容易陷入混乱）", stats: { staggerLineDown: 2 } }
    ],
    egoZayin: [
      { id: "sl_e1", name: "漠然", effect: "打出时全队获得 5 点本回合护盾，且本次将目标混乱线视作提高 6 点", stats: { teamShield: 5, staggerLineBoost: 6 } },
      { id: "sl_e2", name: "倦怠", effect: "命中后使目标本回合其余意图威力 -2，若目标已混乱则本次伤害额外 +6", stats: { foePowerDownHit: 2, staggerExtraDmg: 6 } }
    ]
  },
  gluttony: {
    light: [
      { id: "gl_l1", label: "丰饶", effect: "打出时往公共罪孽池额外 +1 颗暴食碎片", stats: { gainSameSin: 1 } },
      { id: "gl_l2", label: "啃噬", effect: "本次伤害无视目标的护盾与耐性", stats: { ignoreShield: true, ignoreResist: true } },
      { id: "gl_l3", label: "餐前饮", effect: "打出时你立即恢复 2 HP", stats: { selfHealStart: 2 } }
    ],
    core: [
      { id: "gl_c1", label: "暴食熔炉", effect: "打出时往公共罪孽池额外产出 2 颗主导罪孽颜色的碎片", stats: { gainCoreSin: 2 } },
      { id: "gl_c2", label: "吞吃入腹", effect: "抹除目标 1 条增益意图或其全部护盾并恢复你 5 HP；若皆无则本次伤害 +3", stats: { eatBuffOrShield: { heal: 5, altDmg: 3 } } },
      { id: "gl_c3", label: "腐蚀胃液", effect: "命中后，目标本回合受到的所有后续伤害 +2", stats: { foeVuln: 2 } }
    ],
    ace: [
      { id: "gl_a1", label: "饕餮盛宴", effect: "若此击击杀目标或破坏部位，恢复 6 HP 并产 3 颗主导色碎片；否则本次伤害 +4", stats: { onKillOrStagger: { heal: 6, coreSin: 3, altDmgIfNoKill: 4 } } },
      { id: "gl_a2", label: "暴食倾泻", effect: "自动消耗公共池最多 2 颗非本命杂色碎片，每颗使本次伤害 +3、你恢复 2 HP", stats: { spendPool: { max: 2, perPower: 0, perDmg: 3, perHeal: 2 } } }
    ],
    passive: [
      { id: "gl_p1", label: "应急储备", effect: "战斗第 1 回合开始时，自动往公共罪孽池放入 1 颗你的主导罪孽碎片", stats: { battleStartSin: 1 } },
      { id: "gl_p2", label: "消化循环", effect: "每当你通过技能恢复 HP 时，恢复量额外 +1", stats: { healPlus: 1 } }
    ],
    egoZayin: [
      { id: "gl_e1", name: "贪求", effect: "抹除目标所有增益意图与护盾，命中后恢复你 6 HP 并返还 2 颗主导罪孽碎片", stats: { stripAll: true, selfHeal: 6, refundSin: 2 } },
      { id: "gl_e2", name: "沉溺", effect: "命中后目标本回合受到的后续伤害 +3，且全队存活角色各恢复 3 HP", stats: { foeVuln: 3, teamHeal: 3 } }
    ]
  },
  gloom: {
    light: [
      { id: "gm_l1", label: "低语", effect: "本次拼点时，敌方该条意图威力 -1", stats: { foePowerDown: 1 } },
      { id: "gm_l2", label: "侵蚀", effect: "命中后，目标本回合无法恢复 HP 或获得护盾", stats: { foeNoHeal: true } },
      { id: "gm_l3", label: "苦修", effect: "若距离满压至少差 2 格，承受 1 点压力使本次伤害 +3", stats: { selfPressureCost: 1, dmg: 3 } }
    ],
    core: [
      { id: "gm_c1", label: "精神压垮", effect: "命中后，目标本回合所有尚未结算的意图威力全部 -2", stats: { foePowerDownHit: 2 } },
      { id: "gm_c2", label: "沉沦溃散", effect: "命中后追加 3 点无视耐性的精神直伤", stats: { trueBonusDmg: 3 } },
      { id: "gm_c3", label: "绝望共担", effect: "打出时你的罪孽压力 -1，且目标本回合造成的伤害 -2", stats: { selfPressureDelta: -1, foeDmgDealtDown: 2 } }
    ],
    ace: [
      { id: "gm_a1", label: "深渊凝视", effect: "本次拼点敌方威力 -2；命中后目标其余意图威力 -2 且受后续伤害 +2", stats: { foePowerDown: 2, foePowerDownHit: 2, foeVuln: 2 } },
      { id: "gm_a2", label: "悲恸洪流", effect: "命中后对敌方全体（含所有部位）各追加 3 点无视耐性的精神伤害", stats: { splashAllTrue: 3 } }
    ],
    passive: [
      { id: "gm_p1", label: "麻木心防", effect: "你的罪孽压力上限额外 +1", stats: { pressureCapBonus: 1 } },
      { id: "gm_p2", label: "低气压场", effect: "你的忧郁技能拉线拼赢时，额外削减目标本回合造成的伤害 -1", stats: { gloomWinWeak: 1 } }
    ],
    egoZayin: [
      { id: "gm_e1", name: "悲怆", effect: "敌方全体本回合所有意图威力 -2，且命中目标受到的后续伤害 +2", stats: { allFoePowerDown: 2, foeVuln: 2 } },
      { id: "gm_e2", name: "怅惘", effect: "命中后对敌方全体各追加 4 点无视耐性的精神伤害，并使你自己压力 -1", stats: { splashAllTrue: 4, selfPressureDelta: -1 } }
    ]
  },
  pride: {
    light: [
      { id: "pr_l1", label: "精准", effect: "本次拼点威力 +1", stats: { power: 1 } },
      { id: "pr_l2", label: "呼吸法", effect: "若你当前满血或拥有护盾，本次伤害 +2", stats: { cond: "fullOrShield", dmg: 2 } },
      { id: "pr_l3", label: "蔑视", effect: "拉线拼点获胜时（单方面偷袭不计），本次伤害 +2", stats: { cond: "clashed", dmg: 2 } }
    ],
    core: [
      { id: "pr_c1", label: "无瑕剑心", effect: "若你当前 HP 高于混乱线，本次拼点威力 +2", stats: { cond: "hpAboveStagger", power: 2 } },
      { id: "pr_c2", label: "致命暴击", effect: "差值加伤封顶提至 +6，且拼赢时差值保底按 2 计算", stats: { marginCap: 6, minMargin: 2 } },
      { id: "pr_c3", label: "完美计算", effect: "本次拼点可放弃投骰，直接将 1D6 出目固定视为 4", stats: { fixedRoll: 4 } }
    ],
    ace: [
      { id: "pr_a1", label: "君临处决", effect: "本次拼点威力 +2；差值加伤封顶提至 +6 且每点差值双倍加伤", stats: { power: 2, marginCap: 6, doubleMargin: true } },
      { id: "pr_a2", label: "断罪一闪", effect: "拼赢且差值 ≥ 3 时，顺势斩断同一目标另一条威力低于你本次拼点值的普通意图", stats: { winOnly: true, severWeakIntent: 3 } }
    ],
    passive: [
      { id: "pr_p1", label: "剑豪呼吸", effect: "每回合你第 1 次拉线拼点获胜时，最终伤害额外 +1", stats: { firstWinDmg: 1 } },
      { id: "pr_p2", label: "高傲姿态", effect: "满血状态下你的守备技能（格挡/闪避/反击）数值 +1", stats: { fullHpDefBonus: 1 } }
    ],
    egoZayin: [
      { id: "pr_e1", name: "狂妄", effect: "本次 E.G.O 拼点威力额外 +2（共+5），且差值加伤无上限", stats: { power: 2, unlimitMargin: true } },
      { id: "pr_e2", name: "矜傲", effect: "本次拼点威力 +1，命中后全队本回合差值加伤封顶全部提至 +6", stats: { power: 1, teamCritUncap: true } }
    ]
  },
  envy: {
    light: [
      { id: "en_l1", label: "蓄电", effect: "若公共罪孽池中已有 ≥ 3 颗碎片，本次伤害 +2", stats: { cond: "poolAtLeast3", dmg: 2 } },
      { id: "en_l2", label: "借势", effect: "若你的排线出手顺位不在 1 号位，本次拼点威力 +1", stats: { cond: "notFirstSlot", power: 1 } },
      { id: "en_l3", label: "电弧", effect: "拉线拼赢时，对目标追加 2 点无视耐性的雷击伤", stats: { winOnly: true, trueBonusDmg: 2 } }
    ],
    core: [
      { id: "en_c1", label: "过载释放", effect: "若池中有碎片，消耗 1 颗任意碎片使本次拼点威力 +1、伤害 +3", stats: { spendPool: { max: 1, perPower: 1, perDmg: 3, perHeal: 0 } } },
      { id: "en_c2", label: "模仿映射", effect: "本次拼点改用你六维中最高的那项属性，且伤害 +2", stats: { useBestAttr: true, dmg: 2 } },
      { id: "en_c3", label: "连锁闪电", effect: "命中后对目标追加 2 点伤害，并对另一名敌人/部位造成 3 点伤害", stats: { dmg: 2, splashOne: 3 } }
    ],
    ace: [
      { id: "en_a1", label: "超电磁炮", effect: "消耗公共池最多 2 颗碎片，每颗使本次拼点威力 +1、伤害 +3（满额 +2威力/+6伤）", stats: { spendPool: { max: 2, perPower: 1, perDmg: 3, perHeal: 0 } } },
      { id: "en_a2", label: "嫉恨追猎", effect: "若目标当前剩余 HP 数字高于你，本次拼点威力 +1 且伤害 +4", stats: { cond: "foeHpAboveSelf", power: 1, dmg: 4 } }
    ],
    passive: [
      { id: "en_p1", label: "静电回路", effect: "每当你在技能中消耗罪孽碎片（含开 E.G.O），你立即获得 3 点本回合护盾", stats: { spendSinShield: 3 } },
      { id: "en_p2", label: "争锋之心", effect: "对当前 HP 高于你的敌人进行拉线拼点时，伤害额外 +1", stats: { higherHpDmg: 1 } }
    ],
    egoZayin: [
      { id: "en_e1", name: "不甘", effect: "命中后为全队所有后手行动提供本回合拼点威力 +2、伤害 +2", stats: { teamNextBuff: { power: 2, dmg: 2 } }, },
      { id: "en_e2", name: "怨妒", effect: "本次拼点改用你最高属性，命中后对敌方全体各追加 3 点无视耐性伤害", stats: { useBestAttr: true, splashAllTrue: 3 } }
    ]
  }
};

/* 高阶异想体 E.G.O 预设库（TETH / HE / WAW 战利品一键装配） */
const PRESET_EGOS = {
  TETH: [
    {
      id: "ego_redshoes", rank: "TETH", name: "红舞鞋", sin: "lust", mode: "slash",
      cost: { lust: 2, wrath: 2 }, clashBonus: 4, baseDmg: 10, pressureCost: 2,
      effect: "命中后你恢复 4 HP，并使目标本回合其余意图威力 -2",
      stats: { selfHeal: 4, foePowerDownHit: 2 }
    },
    {
      id: "ego_regret", rank: "TETH", name: "悔恨", sin: "wrath", mode: "strike",
      cost: { wrath: 2, sloth: 2 }, clashBonus: 4, baseDmg: 10, pressureCost: 2,
      effect: "打出时移除自身 1 点压力，本次将目标混乱线视作提高 5 点，对已混乱目标伤害 +4",
      stats: { selfPressureDelta: -1, staggerLineBoost: 5, staggerExtraDmg: 4 }
    },
    {
      id: "ego_hexnail", rank: "TETH", name: "咒钉", sin: "envy", mode: "pierce",
      cost: { envy: 2, gloom: 2 }, clashBonus: 4, baseDmg: 10, pressureCost: 2,
      effect: "命中后目标本回合受到的所有后续伤害 +3 且禁疗禁盾",
      stats: { foeVuln: 3, foeNoHeal: true }
    }
  ],
  HE: [
    {
      id: "ego_magicbullet", rank: "HE", name: "魔弹", sin: "pride", mode: "pierce",
      cost: { pride: 3, gloom: 2, wrath: 1 }, clashBonus: 5, baseDmg: 13, pressureCost: 2,
      effect: "差值加伤不封顶，且命中后对场上所有其他敌人/部位贯穿造成 5 点傲慢伤害",
      stats: { unlimitMargin: true, splashAll: 5 }
    },
    {
      id: "ego_sunshower", rank: "HE", name: "狐雨", sin: "sloth", mode: "slash",
      cost: { sloth: 2, gloom: 2, gluttony: 2 }, clashBonus: 5, baseDmg: 12, pressureCost: 2,
      effect: "全队立即获得 5 点护盾，且敌方全体受到 5 点溅射伤害与本轮威力 -1",
      stats: { teamShield: 5, splashAll: 5, allFoePowerDown: 1 }
    },
    {
      id: "ego_fluid_sac", rank: "HE", name: "水袋（群体救场）", sin: "gloom", mode: "strike",
      cost: { gloom: 2, lust: 2, envy: 2 }, clashBonus: 5, baseDmg: 9, pressureCost: 2,
      effect: "命中后全队所有存活角色立即恢复 7 HP，且全队罪孽压力各 -2！",
      stats: { teamHeal: 7, teamPressureDown: 2 }
    }
  ],
  WAW: [
    {
      id: "ego_blind_obsession", rank: "WAW", name: "盲目迷恋", sin: "pride", mode: "pierce",
      cost: { pride: 3, gloom: 3, envy: 2 }, clashBonus: 6, baseDmg: 16, pressureCost: 3,
      effect: "全场所有其他敌人/部位受到 8 点伤害，且全队所有后手行动拼点威力 +2、伤害 +2",
      stats: { splashAll: 8, teamNextBuff: { power: 2, dmg: 2 } }
    },
    {
      id: "ego_yearning_mircalla", rank: "WAW", name: "血之渴望", sin: "lust", mode: "slash",
      cost: { lust: 4, wrath: 2, gluttony: 2 }, clashBonus: 6, baseDmg: 16, pressureCost: 3,
      effect: "全场所有其他敌人受到 7 点无视耐性的流血伤害，全队存活角色恢复 6 HP",
      stats: { splashAllTrue: 7, teamHeal: 6 }
    }
  ]
};

/* 通用武器改造 与 战术饰品库（去门派化，适配任何角色出身与武器外观） */
const WORKSHOP_WEAPONS = [
  { id: "wp_none", name: "基础武器（无改造）", cost: 0, effect: "无额外修正", stats: {} },
  { id: "wp_kurokumo", name: "锋刃研磨改造", cost: 300, effect: "你的【斩击】技能基础伤害 +1", stats: { modeDmg: { slash: 1 } } },
  { id: "wp_liu", name: "配重冲击改造", cost: 300, effect: "你的【打击】技能基础伤害 +1", stats: { modeDmg: { strike: 1 } } },
  { id: "wp_seven", name: "穿刺锋尖改造", cost: 300, effect: "你的【突刺】技能基础伤害 +1", stats: { modeDmg: { pierce: 1 } } },
  { id: "wp_wcorp", name: "蓄能发力机构", cost: 500, effect: "你的三技能基础伤害 +2", stats: { s3Dmg: 2 } },
  { id: "wp_rcorp", name: "轻量化平衡组件", cost: 600, effect: "你的二技能拼点威力 +1", stats: { s2Power: 1 } },
  { id: "wp_zwei", name: "重型护手加固", cost: 450, effect: "最大生命值 +4，且守备技能数值 +1", stats: { maxHpBonus: 4, defBonus: 1 } }
];

const EGO_GIFTS = [
  { id: "gf_none", name: "无饰品", effect: "—", stats: {} },
  { id: "gf_k_ampoule", name: "应急再生注射剂", effect: "每场战斗限 1 次：跌破混乱线时自动触发，立即恢复 10 HP 并免除本次混乱！", stats: { kAmpoule: 10 } },
  { id: "gf_shi_badge", name: "死境决意徽章", effect: "最大 HP -4（最低 12），但你的三技能拼点威力恒定 +1、伤害 +2", stats: { maxHpBonus: -4, s3Power: 1, s3Dmg: 2 } },
  { id: "gf_enkephalin", name: "精神镇静怀表", effect: "你的罪孽压力上限 +1，且首次发动 E.G.O 时压力消耗 -1（最低 0）", stats: { pressureCapBonus: 1, firstEgoCalm: 1 } },
  { id: "gf_ash_lighter", name: "共鸣引火器", effect: "战斗开始时，自动往公共罪孽池额外放入 1 颗你的显著罪孽碎片", stats: { startSecSin: 1 } },
  { id: "gf_wound_cleric", name: "染血缠手带", effect: "拉线拼点获胜且差值 ≥ 2 时，额外造成 2 点伤害", stats: { margin2BonusDmg: 2 } }
];

/* 辅助查找函数（供全项目共用） */
function findSinTrait(sin, tier, id) {
  return (SIN_TRAITS[sin]?.[tier] || []).find(t => t.id === id) || null;
}
function findWeapon(id) { return WORKSHOP_WEAPONS.find(w => w.id === id) || WORKSHOP_WEAPONS[0]; }
function findGift(id) { return EGO_GIFTS.find(g => g.id === id) || EGO_GIFTS[0]; }

/* 内置开箱即用的三套标准遭遇模板（配怪器与战斗器共用） */
const PRESET_ENCOUNTERS = [
  {
    key: "rats",
    title: "ZAYIN · 后巷清道夫小队（新手教学战）",
    tier: "ZAYIN",
    rewardNote: "通关奖励：每人 2 纺锤 + 150 安眼",
    enemies: [
      {
        name: "持刀恶棍", role: "mob", maxHp: 14, hasStagger: true, staggerLine: 7, breakStaggersBody: false,
        resists: { strike: "weak" },
        intents: [{ name: "生锈乱砍", cycle: "all", kind: "attack", power: 6, dmg: 4, winPressure: 0, unbreakable: false, buffPowerNext: 0, note: "" }]
      },
      {
        name: "铁管打手", role: "mob", maxHp: 16, hasStagger: true, staggerLine: 8, breakStaggersBody: false,
        resists: { pierce: "weak", slash: "endure" },
        intents: [{ name: "当头闷棍", cycle: "all", kind: "attack", power: 6, dmg: 5, winPressure: 0, unbreakable: false, buffPowerNext: 0, note: "" }]
      },
      {
        name: "后巷头目", role: "elite", maxHp: 28, hasStagger: true, staggerLine: 14, breakStaggersBody: false,
        resists: { pride: "weak", gloom: "weak", strike: "endure" },
        intents: [
          { name: "凶狠连刺", cycle: "odd", kind: "attack", power: 7, dmg: 5, winPressure: 0, unbreakable: false, buffPowerNext: 0, note: "单数轮使用" },
          { name: "破胆重劈", cycle: "even", kind: "attack", power: 8, dmg: 6, winPressure: 1, unbreakable: false, buffPowerNext: 0, note: "双数轮·拼赢使玩家压力+1" }
        ]
      }
    ]
  },
  {
    key: "redshoes",
    title: "TETH · 异想体《红舞鞋》（双部位破坏机制战）",
    tier: "TETH",
    rewardNote: "镇压奖励：每人 3 纺锤 + 提取 TETH 级 E.G.O【红舞鞋】",
    enemies: [
      {
        name: "红舞鞋·着魔躯干", role: "boss_body", maxHp: 48, hasStagger: true, staggerLine: 24, breakStaggersBody: false,
        resists: { strike: "weak", lust: "endure", slash: "endure" },
        intents: [
          { name: "着魔华尔兹", cycle: "all", kind: "attack", power: 7, dmg: 5, winPressure: 1, unbreakable: false, buffPowerNext: 0, note: "拼赢使目标压力+1" },
          { name: "狂热旋转", cycle: "all", kind: "attack", power: 8, dmg: 5, winPressure: 0, unbreakable: false, buffPowerNext: 0, note: "" }
        ]
      },
      {
        name: "红舞鞋·染血利斧（部位）", role: "boss_part", maxHp: 22, hasStagger: false, staggerLine: 0, breakStaggersBody: true,
        resists: { gloom: "weak", pierce: "weak" },
        intents: [
          { name: "磨利斧刃", cycle: "odd", kind: "buff", power: 0, dmg: 0, winPressure: 0, unbreakable: false, buffPowerNext: 2, note: "单数轮蓄力：未被抹除则下轮威力+2" },
          { name: "断足处决·红光", cycle: "even", kind: "attack", power: 10, dmg: 8, winPressure: 1, unbreakable: true, buffPowerNext: 0, note: "双数轮红光杀招" }
        ]
      }
    ]
  },
  {
    key: "shooter",
    title: "HE · 异想体《魔弹射手·幻影》（中坚双槽 Boss 战）",
    tier: "HE",
    rewardNote: "镇压奖励：每人 5 纺锤 + 提取 HE 级 E.G.O【魔弹】",
    enemies: [
      {
        name: "魔弹射手·本体", role: "boss_body", maxHp: 84, hasStagger: true, staggerLine: 42, breakStaggersBody: false,
        resists: { sloth: "weak", wrath: "weak", pierce: "endure", pride: "endure" },
        intents: [
          { name: "黑焰近身砸击", cycle: "all", kind: "attack", power: 8, dmg: 6, winPressure: 0, unbreakable: false, buffPowerNext: 0, note: "" },
          { name: "精准狙击", cycle: "all", kind: "attack", power: 10, dmg: 8, winPressure: 1, unbreakable: false, buffPowerNext: 0, note: "拼赢使目标压力+1" }
        ]
      },
      {
        name: "魔弹·第七发黑焰枪管（部位）", role: "boss_part", maxHp: 34, hasStagger: false, staggerLine: 0, breakStaggersBody: true,
        resists: { strike: "weak", envy: "weak" },
        intents: [
          { name: "装填黑焰", cycle: "odd", kind: "buff", power: 0, dmg: 0, winPressure: 0, unbreakable: false, buffPowerNext: 2, note: "单数轮装填：下轮魔弹威力+2" },
          { name: "第七颗魔弹·红光", cycle: "even", kind: "attack", power: 13, dmg: 11, winPressure: 2, unbreakable: true, buffPowerNext: 0, note: "双数轮终极杀招（需 E.G.O 或集火拆枪管！）" }
        ]
      }
    ]
  }
];

const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ============ 以下为建卡与成长器状态及计算逻辑 ============ */
const STORE_KEY = "limbus-trpg-v2-character";
const STEPS = [
  "档案与阶位", "六维属性", "罪孽光谱", "技能与守备", "E.G.O 装备", "武器与饰品", "总览与导出"
];

function defaultState() {
  return {
    name: "",
    title: "",
    gender: "不限",
    tier: "ZAYIN",
    uptie: 1,
    spindles: 0,
    money: 0,
    attrs: { 力量: 3, 灵巧: 2, 认知: 2, 体魄: 3, 意志: 1, 共感: 1 },
    spectrum: { core: "pride", sec: "envy", pot: "gloom", rej: "sloth" },
    skills: {
      s1: { name: "", mode: "slash", traitId: "gm_l1" },
      s2: { name: "", mode: "pierce", traitId: "en_c1", extraLightId: "en_l1" },
      s3: { name: "", mode: "strike", coreId: "pr_c1", aceId: "pr_a1", s4Awaken: "power" }
    },
    defense: "block",
    passiveId: "pr_p1",
    zayinEgo: { name: "", mode: "slash", secSinSlot: "sec", optId: "pr_e1" },
    extraEgos: { TETH: null, HE: null, WAW: null },
    gear: { weaponName: "", weaponId: "wp_none", gift1Id: "gf_none", gift2Id: "gf_none" }
  };
}

let state = defaultState();
let current = 0;

/* 属性池与衍生计算 */
const tierCfg = () => RISK_TIERS[state.tier] || RISK_TIERS.ZAYIN;
const totalAttrBudget = () => 6 + BASE_FREE_POINTS + tierCfg().bonusPts;
const sumAttrs = () => Object.values(state.attrs).reduce((a, b) => a + b, 0);

function gearHpBonus() {
  const w = findWeapon(state.gear.weaponId).stats.maxHpBonus || 0;
  const g1 = findGift(state.gear.gift1Id).stats.maxHpBonus || 0;
  const g2 = tierCfg().charmCap >= 2 ? (findGift(state.gear.gift2Id).stats.maxHpBonus || 0) : 0;
  return w + g1 + g2;
}
function gearPressureBonus() {
  const p = state.uptie >= 2 ? (findSinTrait(state.spectrum.core, "passive", state.passiveId)?.stats?.pressureCapBonus || 0) : 0;
  const g1 = findGift(state.gear.gift1Id).stats.pressureCapBonus || 0;
  const g2 = tierCfg().charmCap >= 2 ? (findGift(state.gear.gift2Id).stats.pressureCapBonus || 0) : 0;
  return p + g1 + g2;
}
function calcMaxHp() { return Math.max(12, 16 + state.attrs.体魄 * 4 + gearHpBonus()); }
function calcStaggerLine() {
  const base = Math.floor(calcMaxHp() / 2);
  const down = state.uptie >= 2 ? (findSinTrait(state.spectrum.core, "passive", state.passiveId)?.stats?.staggerLineDown || 0) : 0;
  return Math.max(4, base - down);
}
function calcPressureCap() { return 3 + state.attrs.意志 + gearPressureBonus(); }
function calcSlots() { return tierCfg().slots; }

/* 当罪孽光谱改动时，自动对齐一/二/三技能与本命 E.G.O 的合法默认词条 */
function reconcileCharacter() {
  const cap = tierCfg().attrCap;
  for (const k of Object.keys(state.attrs)) {
    state.attrs[k] = Math.max(1, Math.min(cap, state.attrs[k] || 1));
  }
  const { pot, sec, core } = state.spectrum;
  if (pot && !findSinTrait(pot, "light", state.skills.s1.traitId)) {
    state.skills.s1.traitId = SIN_TRAITS[pot].light[0].id;
  }
  if (sec && !findSinTrait(sec, "core", state.skills.s2.traitId)) {
    state.skills.s2.traitId = SIN_TRAITS[sec].core[0].id;
  }
  if (sec && !findSinTrait(sec, "light", state.skills.s2.extraLightId)) {
    state.skills.s2.extraLightId = SIN_TRAITS[sec].light[0].id;
  }
  if (core && !findSinTrait(core, "core", state.skills.s3.coreId)) {
    state.skills.s3.coreId = SIN_TRAITS[core].core[0].id;
  }
  if (core && !findSinTrait(core, "ace", state.skills.s3.aceId)) {
    state.skills.s3.aceId = SIN_TRAITS[core].ace[0].id;
  }
  if (core && !findSinTrait(core, "passive", state.passiveId)) {
    state.passiveId = SIN_TRAITS[core].passive[0].id;
  }
  if (core && !findSinTrait(core, "egoZayin", state.zayinEgo.optId)) {
    state.zayinEgo.optId = SIN_TRAITS[core].egoZayin[0].id;
  }
}

/* 校验函数 */
function validateAttrs() {
  const errors = [];
  const cap = tierCfg().attrCap;
  const budget = totalAttrBudget();
  const cur = sumAttrs();
  if (Object.values(state.attrs).some(v => v > cap)) errors.push(`当前 ${state.tier} 阶位单项属性上限为 ${cap}。`);
  if (cur < budget) errors.push(`还有 ${budget - cur} 点自由属性尚未分配。`);
  if (cur > budget) errors.push(`属性总和超出了 ${cur - budget} 点（请调低部分属性）。`);
  return { ok: errors.length === 0, errors };
}
function validateSpectrum() {
  const { core, sec, pot, rej } = state.spectrum;
  const arr = [core, sec, pot, rej].filter(Boolean);
  if (arr.length < 4) return { ok: false, msg: "请选齐主导、显著、潜在、排斥四项罪孽。" };
  if (new Set(arr).size < 4) return { ok: false, msg: "四项罪孽必须互不相同。" };
  return { ok: true, msg: "罪孽光谱合法。" };
}
function canLeave(step) {
  if (step === 0) return state.name.trim().length > 0;
  if (step === 1) return validateAttrs().ok;
  if (step === 2) return validateSpectrum().ok;
  return true;
}

/* 生成标准化的 2.0 角色导出对象（直接供战斗器读取，无需任何文本解析） */
function buildData() {
  reconcileCharacter();
  const { pot, sec, core, rej } = state.spectrum;
  const uptie = state.uptie;
  const wp = findWeapon(state.gear.weaponId);
  const gf1 = findGift(state.gear.gift1Id);
  const gf2 = tierCfg().charmCap >= 2 ? findGift(state.gear.gift2Id) : EGO_GIFTS[0];
  const allGearStats = [wp.stats, gf1.stats, gf2.stats];

  const modeBonusDmg = (m) => allGearStats.reduce((n, s) => n + (s?.modeDmg?.[m] || 0), 0);
  const gearSum = (k) => allGearStats.reduce((n, s) => n + (s?.[k] || 0), 0);
  const uptieDmg = uptie >= 3 ? 1 : 0;

  // S1
  const m1 = PHYS_MODES[state.skills.s1.mode] || PHYS_MODES.slash;
  const t1 = findSinTrait(pot, "light", state.skills.s1.traitId);
  const s1 = {
    slot: "s1", slotLabel: "一技能",
    name: state.skills.s1.name.trim() || `${SIN_LABELS[pot]}·${m1.label}Ⅰ`,
    sin: pot, sinLabel: SIN_LABELS[pot],
    mode: m1.key, modeLabel: m1.label, attr: m1.attr,
    skillPower: 0,
    clashBonus: (state.attrs[m1.attr] || 1),
    baseDmg: 3 + uptieDmg + modeBonusDmg(m1.key),
    cd: 0,
    traits: t1 ? [t1] : []
  };

  // S2
  const m2 = PHYS_MODES[state.skills.s2.mode] || PHYS_MODES.pierce;
  const t2c = findSinTrait(sec, "core", state.skills.s2.traitId);
  const t2l = uptie >= 3 ? findSinTrait(sec, "light", state.skills.s2.extraLightId) : null;
  const s2 = {
    slot: "s2", slotLabel: "二技能",
    name: state.skills.s2.name.trim() || `${SIN_LABELS[sec]}·${m2.label}Ⅱ`,
    sin: sec, sinLabel: SIN_LABELS[sec],
    mode: m2.key, modeLabel: m2.label, attr: m2.attr,
    skillPower: 1 + gearSum("s2Power"),
    clashBonus: (state.attrs[m2.attr] || 1) + 1 + gearSum("s2Power"),
    baseDmg: 5 + uptieDmg + modeBonusDmg(m2.key),
    cd: 1,
    traits: [t2c, t2l].filter(Boolean)
  };

  // S3
  const m3 = PHYS_MODES[state.skills.s3.mode] || PHYS_MODES.strike;
  const t3c = findSinTrait(core, "core", state.skills.s3.coreId);
  const t3a = findSinTrait(core, "ace", state.skills.s3.aceId);
  const s4Pwr = (uptie >= 4 && state.skills.s3.s4Awaken === "power") ? 1 : 0;
  const s4Cd = (uptie >= 4 && state.skills.s3.s4Awaken === "cd") ? 1 : 2;
  const s3 = {
    slot: "s3", slotLabel: "三技能",
    name: state.skills.s3.name.trim() || `${SIN_LABELS[core]}·${m3.label}Ⅲ`,
    sin: core, sinLabel: SIN_LABELS[core],
    mode: m3.key, modeLabel: m3.label, attr: m3.attr,
    skillPower: 2 + s4Pwr + gearSum("s3Power"),
    clashBonus: (state.attrs[m3.attr] || 1) + 2 + s4Pwr + gearSum("s3Power"),
    baseDmg: 7 + uptieDmg + modeBonusDmg(m3.key) + gearSum("s3Dmg"),
    cd: s4Cd,
    s4Awaken: uptie >= 4 ? state.skills.s3.s4Awaken : null,
    traits: [t3c, t3a].filter(Boolean)
  };

  // Defense
  const defDef = DEFENSE_TYPES[state.defense] || DEFENSE_TYPES.block;
  const defSin = uptie >= 2 ? core : null;
  const defBonus = gearSum("defBonus");
  const defense = {
    type: defDef.key, label: defDef.label, attr: defDef.attr,
    sin: defSin, sinLabel: defSin ? SIN_LABELS[defSin] : null,
    bonus: (state.attrs[defDef.attr] || 1) + defBonus,
    counterDmg: defDef.key === "counter" ? (state.attrs.力量 || 1) + 3 + defBonus : 0,
    effect: defDef.effect
  };

  // Passive (Uptie II+)
  const passiveObj = uptie >= 2 ? findSinTrait(core, "passive", state.passiveId) : null;

  // E.G.Os
  const zOpt = findSinTrait(core, "egoZayin", state.zayinEgo.optId) || SIN_TRAITS[core].egoZayin[0];
  const zMode = PHYS_MODES[state.zayinEgo.mode] || PHYS_MODES.slash;
  const zSecSin = state.zayinEgo.secSinSlot === "pot" ? pot : sec;
  const zCost = { [core]: 2 };
  zCost[zSecSin] = (zCost[zSecSin] || 0) + 1;
  const alephBonus = tierCfg().alephAwaken ? 2 : 0;
  const egos = [{
    id: "ego_zayin",
    rank: "ZAYIN",
    name: state.zayinEgo.name.trim() || zOpt.name,
    sin: core, sinLabel: SIN_LABELS[core],
    mode: zMode.key, modeLabel: zMode.label, attr: zMode.attr,
    cost: zCost,
    clashBonus: (state.attrs[zMode.attr] || 1) + 3 + alephBonus + (zOpt.stats?.power || 0),
    skillPower: 3 + alephBonus,
    baseDmg: zOpt.stats?.supportOnly ? 0 : 8 + (zOpt.stats?.dmg || 0),
    pressureCost: tierCfg().alephAwaken ? 0 : 1,
    effect: zOpt.effect,
    stats: zOpt.stats || {}
  }];

  for (const rk of ["TETH", "HE", "WAW"]) {
    if (!tierCfg().egoSlots.includes(rk)) continue;
    const eqId = state.extraEgos[rk];
    if (!eqId) continue;
    const pre = (PRESET_EGOS[rk] || []).find(e => e.id === eqId);
    if (pre) {
      const em = PHYS_MODES[pre.mode] || PHYS_MODES.slash;
      egos.push({
        id: pre.id, rank: rk, name: pre.name,
        sin: pre.sin, sinLabel: SIN_LABELS[pre.sin],
        mode: em.key, modeLabel: em.label, attr: em.attr,
        cost: { ...pre.cost },
        clashBonus: (state.attrs[em.attr] || 1) + pre.clashBonus + (pre.stats?.power || 0),
        skillPower: pre.clashBonus,
        baseDmg: pre.baseDmg,
        pressureCost: pre.pressureCost,
        effect: pre.effect,
        stats: pre.stats || {}
      });
    }
  }

  return {
    version: 2,
    元数据: { 系统: "Limbus Company TRPG 2.0", 类型: "角色卡", 生成时间: new Date().toISOString() },
    name: state.name.trim() || "无名罪人",
    title: state.title.trim() || "",
    gender: state.gender,
    tier: state.tier,
    uptie: state.uptie,
    spindles: state.spindles,
    money: state.money,
    attrs: { ...state.attrs },
    derived: {
      maxHp: calcMaxHp(),
      staggerLine: calcStaggerLine(),
      pressureCap: calcPressureCap(),
      slots: calcSlots()
    },
    spectrum: {
      core, coreLabel: SIN_LABELS[core],
      sec, secLabel: SIN_LABELS[sec],
      pot, potLabel: SIN_LABELS[pot],
      rej, rejLabel: SIN_LABELS[rej]
    },
    skills: [s1, s2, s3],
    defense,
    passive: passiveObj,
    egos,
    gear: {
      weapon: (() => {
        const customName = (state.gear.weaponName || "").trim();
        const displayName = customName
          ? (wp.id === "wp_none" ? customName : `${customName}（${wp.name}）`)
          : wp.name;
        return { ...wp, customName, displayName };
      })(),
      gifts: [gf1, ...(tierCfg().charmCap >= 2 ? [gf2] : [])].filter(g => g.id !== "gf_none")
    },
    _rawState: JSON.parse(JSON.stringify(state))
  };
}

/* 生成跑团群名片 + 骰娘 .st 录卡指令 + 一键出招宏文本 */
function costText(costObj) {
  return Object.entries(costObj || {}).map(([k, v]) => `${SIN_LABELS[k]}×${v}`).join(" + ");
}
function buildDicebotText(d) {
  const lines = [];
  lines.push(`═══ 【${d.name}】${d.title ? `· ${d.title} ` : ""}(${d.tier} / ${UPTIE_LEVELS[d.uptie].roman}) ═══`);
  lines.push(`HP ${d.derived.maxHp}/${d.derived.maxHp}（混乱线 ${d.derived.staggerLine}）｜压力 0/${d.derived.pressureCap}｜行动槽 ${d.derived.slots}`);
  lines.push(`属性：力${d.attrs.力量} 敏${d.attrs.灵巧} 知${d.attrs.认知} 体${d.attrs.体魄} 志${d.attrs.意志} 感${d.attrs.共感}`);
  lines.push(`光谱：主导[${d.spectrum.coreLabel}] 显著[${d.spectrum.secLabel}] 潜在[${d.spectrum.potLabel}] 排斥[${d.spectrum.rejLabel}]`);
  if (d.passive) lines.push(`被动：【${d.passive.label}】${d.passive.effect}`);
  if (d.gear.weapon.id !== "wp_none" || d.gear.weapon.customName || d.gear.gifts.length) {
    const showWp = (d.gear.weapon.id !== "wp_none" || d.gear.weapon.customName) ? d.gear.weapon.displayName : null;
    const gs = [showWp, ...d.gear.gifts.map(g => g.name)].filter(Boolean);
    lines.push(`装备：${gs.join(" / ")}`);
  }
  lines.push(``);
  lines.push(`▼ 常用群聊行动小尾巴（复制挂在消息末尾）：`);
  lines.push(`[${d.name} | HP ${d.derived.maxHp}/${d.derived.maxHp}(混${d.derived.staggerLine}) | 压 0/${d.derived.pressureCap} | CD:无]`);
  lines.push(``);
  lines.push(`▼ 赵骰 / 豹骰 / 海豹骰 一键录卡指令：`);
  lines.push(`.st hp${d.derived.maxHp} maxhp${d.derived.maxHp} 护盾0 压力0 压力上限${d.derived.pressureCap} 力量${d.attrs.力量} 灵巧${d.attrs.灵巧} 认知${d.attrs.认知} 体魄${d.attrs.体魄} 意志${d.attrs.意志} 共感${d.attrs.共感}`);
  lines.push(``);
  lines.push(`▼ 战斗出招速查（直接复制对应行发群）：`);
  for (const s of d.skills) {
    const cdTxt = s.cd ? `CD:${s.cd}轮` : "无CD";
    const trTxt = s.traits.map(t => `「${t.label}」${t.effect}`).join("；");
    lines.push(`▸ ${s.slotLabel}【${s.name}】(${s.modeLabel}/${s.sinLabel} · ${cdTxt}) → 拼点 .r 1d6+${s.clashBonus} ｜ 基础伤 ${s.baseDmg} ｜ ${trTxt}`);
  }
  const df = d.defense;
  if (df.type === "block") {
    lines.push(`▸ 守备【格挡】${df.sinLabel ? `(${df.sinLabel})` : ""} → 护盾 .r 1d6+${df.bonus}（不拼点直接抵伤）`);
  } else if (df.type === "evade") {
    lines.push(`▸ 守备【闪避】${df.sinLabel ? `(${df.sinLabel})` : ""} → 闪避 .r 1d6+${df.bonus}（≥威力则无伤并保留连闪）`);
  } else {
    lines.push(`▸ 守备【反击】${df.sinLabel ? `(${df.sinLabel})` : ""} → 不拼点，获 ${df.bonus} 盾硬吃后必反打 ${df.counterDmg} 点无视耐性伤害`);
  }
  for (const eg of d.egos) {
    lines.push(`▸ ${eg.rank} E.G.O【${eg.name}】(耗 ${costText(eg.cost)} · 压+${eg.pressureCost}) → ${eg.stats?.supportOnly ? "纯支援免拼点" : `拼点 .r 1d6+${eg.clashBonus} ｜ 基础伤 ${eg.baseDmg}`} ｜ ${eg.effect}`);
  }
  return lines.join("\n");
}

/* ============ 页面 DOM 渲染与交互（仅在 index.html 中生效） ============ */
const stageCard = document.getElementById("stageCard");

if (stageCard) {
  const stepChips = document.getElementById("stepChips");
  const sideSummary = document.getElementById("sideSummary");
  const btnBack = document.getElementById("btnBack");
  const btnNext = document.getElementById("btnNext");

  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => t.classList.remove("show"), 2000);
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ state, current })); } catch (e) {}
  }
  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (raw && raw.state) {
        state = Object.assign(defaultState(), raw.state);
        state.attrs = Object.assign(defaultState().attrs, raw.state.attrs || {});
        state.spectrum = Object.assign(defaultState().spectrum, raw.state.spectrum || {});
        state.skills = {
          s1: Object.assign(defaultState().skills.s1, raw.state.skills?.s1 || {}),
          s2: Object.assign(defaultState().skills.s2, raw.state.skills?.s2 || {}),
          s3: Object.assign(defaultState().skills.s3, raw.state.skills?.s3 || {})
        };
        state.zayinEgo = Object.assign(defaultState().zayinEgo, raw.state.zayinEgo || {});
        state.extraEgos = Object.assign(defaultState().extraEgos, raw.state.extraEgos || {});
        state.gear = Object.assign(defaultState().gear, raw.state.gear || {});
        current = Math.max(0, Math.min(STEPS.length - 1, raw.current || 0));
      }
    } catch (e) {}
    reconcileCharacter();
  }

  function renderChips() {
    stepChips.innerHTML = STEPS.map((s, i) => {
      const reachable = i <= current || (i === current + 1 && canLeave(current));
      const cls = i === current ? "active" : (i < current ? "done" : (!reachable ? "locked" : ""));
      return `<div class="chip ${cls}" data-step="${i}">${i + 1}. ${s}</div>`;
    }).join("");
    stepChips.querySelectorAll(".chip").forEach(el => {
      el.onclick = () => {
        const idx = +el.dataset.step;
        if (idx <= current || (idx === current + 1 && canLeave(current))) {
          current = idx; render();
        } else {
          toast("请先完成当前步骤必填项");
        }
      };
    });
  }

  function renderSummary() {
    const d = buildData();
    sideSummary.innerHTML = `
      <div class="srow editable" data-goto="0"><span class="sk">罪人 / 阶位</span>
        <span class="sv">${escapeHtml(state.name) || "未命名"} · <span class="risk risk-${d.tier}">${d.tier}</span></span></div>
      <div class="srow editable" data-goto="0"><span class="sk">同期化</span>
        <span class="sv">${UPTIE_LEVELS[d.uptie].roman}</span></div>
      <div class="srow editable" data-goto="1" style="border-bottom:none"><span class="sk">六维（${sumAttrs()}/${totalAttrBudget()}）</span></div>
      <div class="attr-mini">${ATTR_DEFS.map(a => `<span>${a.key}<b>${d.attrs[a.key]}</b></span>`).join("")}</div>
      <div style="height:8px"></div>
      <div class="srow editable" data-goto="1"><span class="sk">生命 / 混乱线</span><span class="sv">${d.derived.maxHp} / ${d.derived.staggerLine}</span></div>
      <div class="srow editable" data-goto="1"><span class="sk">压力上限 / 槽数</span><span class="sv">${d.derived.pressureCap} 格 / ${d.derived.slots} 槽</span></div>
      <div class="srow editable" data-goto="2"><span class="sk">主导 / 显著 / 潜在</span>
        <span class="sv">${d.spectrum.coreLabel} · ${d.spectrum.secLabel} · ${d.spectrum.potLabel}</span></div>
      <div class="srow editable" data-goto="3"><span class="sk">一技能（无CD）</span><span class="sv">1D6+${d.skills[0].clashBonus} / 伤${d.skills[0].baseDmg}</span></div>
      <div class="srow editable" data-goto="3"><span class="sk">二技能（CD1）</span><span class="sv">1D6+${d.skills[1].clashBonus} / 伤${d.skills[1].baseDmg}</span></div>
      <div class="srow editable" data-goto="3"><span class="sk">三技能（CD${d.skills[2].cd}）</span><span class="sv">1D6+${d.skills[2].clashBonus} / 伤${d.skills[2].baseDmg}</span></div>
      <div class="srow editable" data-goto="3"><span class="sk">守备姿态</span><span class="sv">${d.defense.label}${d.defense.sinLabel ? `(${d.defense.sinLabel})` : ""}</span></div>
      <div class="srow editable" data-goto="4"><span class="sk">已装 E.G.O</span><span class="sv">${d.egos.map(e => e.rank).join(" · ")}</span></div>
    `;
    sideSummary.querySelectorAll(".editable").forEach(el => {
      el.onclick = () => {
        const to = +el.dataset.goto;
        if (to <= current || canLeave(current)) { current = to; render(); }
      };
    });
  }

  /* ---- 步骤 0：基本档案与战役阶位 ---- */
  function renderStep0() {
    stageCard.innerHTML = `
      <h2>第一步 · 基本档案与战役阶位</h2>
      <p class="lead">初始建卡保持默认的 <b>ZAYIN · Ⅰ阶同期</b> 即可；战役推进后随时可回来提升阶位与同期化等级。</p>
      <div class="grid2">
        <label class="field">
          <span class="lab">罪人姓名（必填）</span>
          <input type="text" id="inName" maxlength="24" placeholder="例如：李箱 / 浮士德 / 你的角色名" value="${escapeHtml(state.name)}">
        </label>
        <label class="field">
          <span class="lab">人格称号 / 所属协会（选填）</span>
          <input type="text" id="inTitle" maxlength="30" placeholder="例如：七协会南部6科 / 黑云会若众" value="${escapeHtml(state.title)}">
        </label>
      </div>
      <label class="field">
        <span class="lab">性别</span>
        <div class="opt-row" id="genderRow">
          ${["男", "女", "其他", "不限"].map(g => `<div class="opt${state.gender === g ? " sel" : ""}" data-g="${g}">${g}</div>`).join("")}
        </div>
      </label>
      <label class="field">
        <span class="lab">当前都市危险等级（决定属性上限、行动槽与高阶 E.G.O 槽）</span>
        <div class="opt-row" id="tierRow">
          ${RISK_ORDER.map(rk => `<div class="opt${state.tier === rk ? " sel" : ""}" data-rk="${rk}">
            <span class="risk risk-${rk}">${rk}</span>
            <small>${RISK_TIERS[rk].slots}行动槽 · 上限${RISK_TIERS[rk].attrCap}</small>
          </div>`).join("")}
        </div>
        <p class="hint">▸ ${tierCfg().rankText}：${tierCfg().unlockNote}</p>
      </label>
      <label class="field">
        <span class="lab">人格同期化阶段（团间消耗纺锤升级技能面板）</span>
        <div class="opt-row" id="uptieRow">
          ${[1, 2, 3, 4].map(lv => `<div class="opt${state.uptie === lv ? " sel" : ""}" data-up="${lv}">
            <b>${UPTIE_LEVELS[lv].roman}</b>
            <small>${lv === 1 ? "初始免费" : `累计 ${UPTIE_LEVELS[lv].cost} 纺锤`}</small>
          </div>`).join("")}
        </div>
        <p class="hint">▸ ${UPTIE_LEVELS[state.uptie].desc}</p>
      </label>
    `;
    document.getElementById("inName").oninput = (e) => { state.name = e.target.value; renderNav(); renderSummary(); saveState(); };
    document.getElementById("inTitle").oninput = (e) => { state.title = e.target.value; saveState(); };
    stageCard.querySelectorAll("[data-g]").forEach(el => el.onclick = () => { state.gender = el.dataset.g; render(); });
    stageCard.querySelectorAll("[data-rk]").forEach(el => el.onclick = () => { state.tier = el.dataset.rk; reconcileCharacter(); render(); });
    stageCard.querySelectorAll("[data-up]").forEach(el => el.onclick = () => { state.uptie = +el.dataset.up; reconcileCharacter(); render(); });
  }

  /* ---- 步骤 1：六维属性与衍生值 ---- */
  function renderStep1() {
    const cap = tierCfg().attrCap;
    const budget = totalAttrBudget();
    const cur = sumAttrs();
    const rem = budget - cur;
    const v = validateAttrs();

    stageCard.innerHTML = `
      <h2>第二步 · 六维属性与衍生数值</h2>
      <p class="lead">所有判定统一为 <b>1D6 + 属性</b>。初始每项为 1，分配自由点数（当前 <span class="risk risk-${state.tier}">${state.tier}</span> 单项上限 <b>${cap}</b>）。</p>
      <div class="pool">
        <span class="badge">总预算 <b>${budget}</b> 点</span>
        <span class="badge ${rem !== 0 ? "bad" : "ok"}">剩余可分配 <b>${rem}</b> 点</span>
        <span class="badge">单项上限 <b>${cap}</b></span>
      </div>
      <div class="attr-list">
        ${ATTR_DEFS.map(d => {
          const val = state.attrs[d.key];
          const dots = [1, 2, 3, 4, 5].map(i =>
            `<span class="dot${i <= val ? " on" : ""}${i > cap ? " locked" : ""}" data-k="${d.key}" data-v="${i}">${i}</span>`
          ).join("");
          return `<div class="attr">
            <div class="name">${d.key}<small>${d.combat}<br>${d.daily}</small></div>
            <div class="dots">${dots}</div>
            <div class="stepper">
              <button data-k="${d.key}" data-d="-1" ${val <= 1 ? "disabled" : ""}>−</button>
              <span class="val">${val}</span>
              <button data-k="${d.key}" data-d="1" ${val >= cap ? "disabled" : ""}>+</button>
            </div>
          </div>`;
        }).join("")}
      </div>
      <div class="warns">
        ${v.ok ? `<div class="warn ok">✔ 属性分配合法！</div>`
               : v.errors.map(e => `<div class="warn">✕ <span>${e}</span></div>`).join("")}
      </div>
      <div class="grid4" style="margin-top:18px">
        <div class="stat"><div class="k">最大生命值</div><div class="v">${calcMaxHp()}</div><div class="note">16 + 体魄(${state.attrs.体魄})×4${gearHpBonus() ? ` + 装备(${gearHpBonus()})` : ""}</div></div>
        <div class="stat"><div class="k">混乱线 (Stagger)</div><div class="v">${calcStaggerLine()}</div><div class="note">首次 ≤ 此值陷入混乱</div></div>
        <div class="stat"><div class="k">罪孽压力上限</div><div class="v">${calcPressureCap()} 格</div><div class="note">3 + 意志(${state.attrs.意志})${gearPressureBonus() ? ` + 加成(${gearPressureBonus()})` : ""}</div></div>
        <div class="stat"><div class="k">每轮行动槽</div><div class="v">${calcSlots()} 槽</div><div class="note">${calcSlots() >= 2 ? "HE阶已解锁双动！" : "HE阶晋升解锁第2槽"}</div></div>
      </div>
    `;
    stageCard.querySelectorAll(".dot:not(.locked)").forEach(el => el.onclick = () => {
      state.attrs[el.dataset.k] = +el.dataset.v; render();
    });
    stageCard.querySelectorAll(".stepper button").forEach(el => el.onclick = () => {
      const k = el.dataset.k;
      state.attrs[k] = Math.max(1, Math.min(cap, state.attrs[k] + (+el.dataset.d)));
      render();
    });
  }

  /* ---- 步骤 2：罪孽光谱 ---- */
  function renderStep2() {
    const sp = state.spectrum;
    const roles = [
      { key: "core", label: "主导(三技能)", cls: "" },
      { key: "sec",  label: "显著(二技能)", cls: "" },
      { key: "pot",  label: "潜在(一技能)", cls: "" },
      { key: "rej",  label: "排斥(劣势)",   cls: "rej" }
    ];
    const v = validateSpectrum();

    stageCard.innerHTML = `
      <h2>第三步 · 罪孽光谱与当回合共鸣</h2>
      <p class="lead">从七罪中选出你的 <b>主导、显著、潜在、排斥</b> 四项罪孽（互不重复）。战斗中全队同回合打出 ≥2 个同色技能即触发【罪孽共鸣】。</p>
      <div class="warns" style="margin:0 0 14px">
        <div class="warn ${v.ok ? "ok" : ""}">${v.ok ? "✔" : "✕"} <span>${v.msg}</span></div>
      </div>
      <div class="sin-spectrum-grid">
        ${SIN_ORDER.map(k => {
          const def = SIN_DEFINITIONS[k];
          const res = SIN_RESONANCE[k];
          return `<div class="sin-card sin-${k}">
            <div class="sin-head">
              <span class="sin-sym">${sinIcon(k)}</span>
              <span class="sin-name">${SIN_LABELS[k]}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-bottom:6px">${def.summary}</div>
            <div style="font-size:12px;color:var(--accent-2);background:#141722;padding:5px 8px;border-radius:6px">
              <b>共鸣(2)：</b>${res.base}<br><b>完全(3+)：</b>${res.full}
            </div>
            <div class="role-btns">
              ${roles.map(r => `<button class="role-btn ${r.cls}${sp[r.key] === k ? " on" : ""}" data-role="${r.key}" data-sin="${k}">${r.label}</button>`).join("")}
            </div>
          </div>`;
        }).join("")}
      </div>
    `;
    stageCard.querySelectorAll("[data-role]").forEach(el => el.onclick = () => {
      const role = el.dataset.role, sin = el.dataset.sin;
      // 若该罪孽原本挂在别的槽位，交换或清空旧槽位，避免重复点击繁琐
      for (const rk of ["core", "sec", "pot", "rej"]) {
        if (rk !== role && state.spectrum[rk] === sin) state.spectrum[rk] = state.spectrum[role];
      }
      state.spectrum[role] = sin;
      reconcileCharacter();
      render();
    });
  }

  /* ---- 步骤 3：人格三技能、守备与被动 ---- */
  function renderStep3() {
    reconcileCharacter();
    const d = buildData();
    const { pot, sec, core } = state.spectrum;

    const modeSelector = (slotKey, curMode) => `
      <div class="opt-row" style="margin-bottom:10px">
        ${Object.values(PHYS_MODES).map(m => `<div class="opt${curMode === m.key ? " sel" : ""}" data-smode="${slotKey}:${m.key}" style="padding:7px 10px">
          <b>${m.label}</b>（${m.attr} ${state.attrs[m.attr]}）
        </div>`).join("")}
      </div>`;

    const traitCards = (list, curId, bindAttr) => `
      <div class="qa-options">
        ${list.map(t => `<div class="qa-option${curId === t.id ? " sel" : ""}" data-pick="${bindAttr}:${t.id}">
          <div class="qa-opt-label">${t.label}</div>
          <div class="qa-opt-effect">${t.effect}</div>
        </div>`).join("")}
      </div>`;

    stageCard.innerHTML = `
      <h2>第四步 · 人格三技能与守备构筑</h2>
      <p class="lead">招式物理类型（斩/打/突）直接绑定在每个技能上，无需切换架势。角色卡会自动为你算好骰娘指令。</p>
      <div class="skill-builder">
        <!-- 一技能 -->
        <div class="skill-box sin-${pot}">
          <div class="skill-top">
            <span class="sin-icon-inline">${sinIcon(pot)}</span>
            <b>一技能（常用技 · ${SIN_LABELS[pot]} · 无冷却）</b>
            <span class="skill-formula">.r 1d6+${d.skills[0].clashBonus} ｜ 基础伤 ${d.skills[0].baseDmg}</span>
          </div>
          <input type="text" data-sname="s1" placeholder="自定义招式名（留空默认：${SIN_LABELS[pot]}·${PHYS_MODES[state.skills.s1.mode].label}Ⅰ）" value="${escapeHtml(state.skills.s1.name)}" style="margin-bottom:10px">
          ${modeSelector("s1", state.skills.s1.mode)}
          <div class="hint">选择 1 条【${SIN_LABELS[pot]}·轻词条】：</div>
          ${traitCards(SIN_TRAITS[pot].light, state.skills.s1.traitId, "s1")}
        </div>

        <!-- 二技能 -->
        <div class="skill-box sin-${sec}">
          <div class="skill-top">
            <span class="sin-icon-inline">${sinIcon(sec)}</span>
            <b>二技能（主力技 · ${SIN_LABELS[sec]} · 冷却 1 回合）</b>
            <span class="skill-formula">.r 1d6+${d.skills[1].clashBonus} ｜ 基础伤 ${d.skills[1].baseDmg}</span>
          </div>
          <input type="text" data-sname="s2" placeholder="自定义招式名（留空默认：${SIN_LABELS[sec]}·${PHYS_MODES[state.skills.s2.mode].label}Ⅱ）" value="${escapeHtml(state.skills.s2.name)}" style="margin-bottom:10px">
          ${modeSelector("s2", state.skills.s2.mode)}
          <div class="hint">选择 1 条【${SIN_LABELS[sec]}·核心词条】：</div>
          ${traitCards(SIN_TRAITS[sec].core, state.skills.s2.traitId, "s2core")}
          ${state.uptie >= 3 ? `
            <div class="hint" style="margin-top:12px;color:var(--accent-2)">★ Ⅲ阶同期解锁：为二技能额外加选 1 条【${SIN_LABELS[sec]}·轻词条】：</div>
            ${traitCards(SIN_TRAITS[sec].light, state.skills.s2.extraLightId, "s2light")}
          ` : `<p class="hint">（升至 Ⅲ 阶同期后，一/二/三技能伤害各 +1，且此处可额外多镶嵌 1 条轻词条）</p>`}
        </div>

        <!-- 三技能 -->
        <div class="skill-box sin-${core}">
          <div class="skill-top">
            <span class="sin-icon-inline">${sinIcon(core)}</span>
            <b>三技能（王牌技 · ${SIN_LABELS[core]} · 冷却 ${d.skills[2].cd} 回合）</b>
            <span class="skill-formula">.r 1d6+${d.skills[2].clashBonus} ｜ 基础伤 ${d.skills[2].baseDmg}</span>
          </div>
          <input type="text" data-sname="s3" placeholder="自定义招式名（留空默认：${SIN_LABELS[core]}·${PHYS_MODES[state.skills.s3.mode].label}Ⅲ）" value="${escapeHtml(state.skills.s3.name)}" style="margin-bottom:10px">
          ${modeSelector("s3", state.skills.s3.mode)}
          <div class="hint">① 选择 1 条【${SIN_LABELS[core]}·核心词条】：</div>
          ${traitCards(SIN_TRAITS[core].core, state.skills.s3.coreId, "s3core")}
          <div class="hint" style="margin-top:10px">② 选择 1 条【${SIN_LABELS[core]}·王牌词条】：</div>
          ${traitCards(SIN_TRAITS[core].ace, state.skills.s3.aceId, "s3ace")}
          ${state.uptie >= 4 ? `
            <div class="hint" style="margin-top:12px;color:var(--accent-2)">★ Ⅳ阶同期觉醒方向（二选一）：</div>
            <div class="opt-row" style="margin-top:6px">
              <div class="opt${state.skills.s3.s4Awaken === "power" ? " sel" : ""}" data-s4="power"><b>极意突破</b><small>三技能拼点威力额外 +1</small></div>
              <div class="opt${state.skills.s3.s4Awaken === "cd" ? " sel" : ""}" data-s4="cd"><b>高频回转</b><small>三技能冷却从 2 回合缩至 1 回合</small></div>
            </div>
          ` : ""}
        </div>

        <!-- 守备姿态 -->
        <div class="skill-box" style="--sin-c:${state.uptie >= 2 ? SIN_COLORS[core] : "#9096a6"}">
          <div class="skill-top">
            <b>守备技能（无冷却${state.uptie >= 2 ? ` · Ⅱ阶已染【${SIN_LABELS[core]}】属性` : ""}）</b>
          </div>
          <div class="qa-options">
            ${Object.values(DEFENSE_TYPES).map(df => `<div class="qa-option${state.defense === df.key ? " sel" : ""}" data-def="${df.key}">
              <div class="qa-opt-label">${df.label}（${df.formula}）</div>
              <div class="qa-opt-effect">${df.effect}</div>
            </div>`).join("")}
          </div>
          ${state.uptie >= 2 ? `
            <div class="hint" style="margin-top:14px;color:var(--accent-2)">★ Ⅱ阶同期解锁：选择你的【${SIN_LABELS[core]}·人格被动】：</div>
            ${traitCards(SIN_TRAITS[core].passive, state.passiveId, "passive")}
          ` : `<p class="hint">（升至 Ⅱ 阶同期后，守备将染上你的主导罪孽颜色，并在此处解锁 1 条常驻人格被动）</p>`}
        </div>
      </div>
    `;

    stageCard.querySelectorAll("[data-sname]").forEach(el => el.oninput = () => {
      state.skills[el.dataset.sname].name = el.value; saveState();
    });
    stageCard.querySelectorAll("[data-smode]").forEach(el => el.onclick = () => {
      const [sk, mk] = el.dataset.smode.split(":");
      state.skills[sk].mode = mk; render();
    });
    stageCard.querySelectorAll("[data-pick]").forEach(el => el.onclick = () => {
      const [where, id] = el.dataset.pick.split(":");
      if (where === "s1") state.skills.s1.traitId = id;
      else if (where === "s2core") state.skills.s2.traitId = id;
      else if (where === "s2light") state.skills.s2.extraLightId = id;
      else if (where === "s3core") state.skills.s3.coreId = id;
      else if (where === "s3ace") state.skills.s3.aceId = id;
      else if (where === "passive") state.passiveId = id;
      render();
    });
    stageCard.querySelectorAll("[data-s4]").forEach(el => el.onclick = () => {
      state.skills.s3.s4Awaken = el.dataset.s4; render();
    });
    stageCard.querySelectorAll("[data-def]").forEach(el => el.onclick = () => {
      state.defense = el.dataset.def; render();
    });
  }

  /* ---- 步骤 4：E.G.O 装备栏 ---- */
  function renderStep4() {
    reconcileCharacter();
    const { core, sec, pot } = state.spectrum;
    const d = buildData();
    const zEgo = d.egos[0];

    const extraBlocks = ["TETH", "HE", "WAW"].map(rk => {
      const unlocked = tierCfg().egoSlots.includes(rk);
      if (!unlocked) {
        return `<div class="sheet" style="opacity:.55">
          <h4><span class="risk risk-${rk}">${rk}</span> 异想体 E.G.O 槽（尚未解锁）</h4>
          <p class="hint">晋升至 ${rk} 危险等级后开放此装备槽。</p>
        </div>`;
      }
      const list = PRESET_EGOS[rk] || [];
      const cur = state.extraEgos[rk];
      return `<div class="sheet">
        <h4><span class="risk risk-${rk}">${rk}</span> 异想体提取 E.G.O 槽</h4>
        <div class="qa-options">
          <div class="qa-option${!cur ? " sel" : ""}" data-xego="${rk}:">
            <div class="qa-opt-label">暂不装备</div>
            <div class="qa-opt-effect">留空此槽位，待击败对应危险等级异想体后提取装备。</div>
          </div>
          ${list.map(e => `<div class="qa-option${cur === e.id ? " sel" : ""}" data-xego="${rk}:${e.id}">
            <div class="qa-opt-label">【${e.name}】(${PHYS_MODES[e.mode].label}/${SIN_LABELS[e.sin]} · 耗 ${costText(e.cost)})</div>
            <div class="qa-opt-effect">拼点 +${e.clashBonus} ｜ 基础伤 ${e.baseDmg} ｜ 压力 +${e.pressureCost}<br>${e.effect}</div>
          </div>`).join("")}
        </div>
      </div>`;
    }).join("");

    stageCard.innerHTML = `
      <h2>第五步 · E.G.O 显现与提取装备</h2>
      <p class="lead">发动 E.G.O 直接消耗【公共罪孽池】中的对应碎片，自带高额拼点补正，专门正面击碎敌方高威力红光杀招。</p>
      <div class="skill-box sin-${core}" style="margin-bottom:18px">
        <div class="skill-top">
          <span class="risk risk-ZAYIN">ZAYIN</span>
          <b>本命初始 E.G.O（${SIN_LABELS[core]} · 耗 ${costText(zEgo.cost)} · 压力+${zEgo.pressureCost}）</b>
          <span class="skill-formula">${zEgo.stats?.supportOnly ? "纯支援免拼点" : `.r 1d6+${zEgo.clashBonus} ｜ 基础伤 ${zEgo.baseDmg}`}</span>
        </div>
        <div class="grid2" style="margin-bottom:10px">
          <label class="field" style="margin:0">
            <span class="lab">本命 E.G.O 名称（选填）</span>
            <input type="text" id="inZName" placeholder="例如：昨日之影 / 未寄出的信（留空则使用所选情感名）" value="${escapeHtml(state.zayinEgo.name)}">
          </label>
          <label class="field" style="margin:0">
            <span class="lab">第 3 颗碎片消耗颜色</span>
            <div class="opt-row">
              <div class="opt${state.zayinEgo.secSinSlot === "sec" ? " sel" : ""}" data-zsin="sec" style="padding:7px">显著：${SIN_LABELS[sec]}</div>
              <div class="opt${state.zayinEgo.secSinSlot === "pot" ? " sel" : ""}" data-zsin="pot" style="padding:7px">潜在：${SIN_LABELS[pot]}</div>
            </div>
          </label>
        </div>
        <div class="opt-row" style="margin-bottom:10px">
          ${Object.values(PHYS_MODES).map(m => `<div class="opt${state.zayinEgo.mode === m.key ? " sel" : ""}" data-zmode="${m.key}" style="padding:6px 10px">
            ${m.label}（${m.attr} ${state.attrs[m.attr]}）
          </div>`).join("")}
        </div>
        <div class="hint">选择本命 E.G.O 特效（心象情感）：</div>
        <div class="qa-options">
          ${SIN_TRAITS[core].egoZayin.map(o => `<div class="qa-option${state.zayinEgo.optId === o.id ? " sel" : ""}" data-zopt="${o.id}">
            <div class="qa-opt-label">${o.name}</div>
            <div class="qa-opt-effect">${o.effect}</div>
          </div>`).join("")}
        </div>
      </div>
      ${extraBlocks}
    `;

    document.getElementById("inZName").oninput = (e) => { state.zayinEgo.name = e.target.value; saveState(); };
    stageCard.querySelectorAll("[data-zsin]").forEach(el => el.onclick = () => { state.zayinEgo.secSinSlot = el.dataset.zsin; render(); });
    stageCard.querySelectorAll("[data-zmode]").forEach(el => el.onclick = () => { state.zayinEgo.mode = el.dataset.zmode; render(); });
    stageCard.querySelectorAll("[data-zopt]").forEach(el => el.onclick = () => { state.zayinEgo.optId = el.dataset.zopt; render(); });
    stageCard.querySelectorAll("[data-xego]").forEach(el => el.onclick = () => {
      const [rk, id] = el.dataset.xego.split(":");
      state.extraEgos[rk] = id || null;
      render();
    });
  }

  /* ---- 步骤 5：武器改造与战术饰品 ---- */
  function renderStep5() {
    const charm2Unlocked = tierCfg().charmCap >= 2;
    stageCard.innerHTML = `
      <h2>第六步 · 武器改造与战术饰品（整备栏）</h2>
      <p class="lead">可自由填写角色的任意武器外观（刀剑、枪械、长柄、拳套、工具等不限出身与形制），并在获得赏金或战利品后装配通用武器改造与战术饰品，数值将自动计入面板。</p>
      <div class="grid2" style="margin-bottom:16px">
        <label class="field" style="margin:0">
          <span class="lab">当前持有纺锤点（XP 记录）</span>
          <input type="number" id="inSpindles" min="0" value="${state.spindles}">
        </label>
        <label class="field" style="margin:0">
          <span class="lab">当前持有安眼 / 赏金</span>
          <input type="number" id="inMoney" min="0" value="${state.money}">
        </label>
      </div>
      <div class="sheet">
        <h4>武器外观与通用改造方向（限 1 项）</h4>
        <label class="field" style="margin-bottom:12px">
          <span class="lab">自定义武器名称 / 外观（选填，不绑定任何势力或形制）</span>
          <input type="text" id="inWeaponName" maxlength="28" placeholder="例如：双手巨剑 / 改装左轮 / 手杖剑 / 战术拳套 / 手术刀…" value="${escapeHtml(state.gear.weaponName || "")}">
        </label>
        <div class="qa-options">
          ${WORKSHOP_WEAPONS.map(w => `<div class="qa-option${state.gear.weaponId === w.id ? " sel" : ""}" data-wp="${w.id}">
            <div class="qa-opt-label">${w.name}${w.cost ? ` <small style="color:var(--muted)">(${w.cost} 安眼)</small>` : ""}</div>
            <div class="qa-opt-effect">${w.effect}</div>
          </div>`).join("")}
        </div>
      </div>
      <div class="sheet">
        <h4>战术饰品 / 消耗品槽 1</h4>
        <div class="qa-options">
          ${EGO_GIFTS.map(g => `<div class="qa-option${state.gear.gift1Id === g.id ? " sel" : ""}" data-gf1="${g.id}">
            <div class="qa-opt-label">${g.name}</div>
            <div class="qa-opt-effect">${g.effect}</div>
          </div>`).join("")}
        </div>
      </div>
      ${charm2Unlocked ? `<div class="sheet">
        <h4>战术饰品槽 2（WAW 阶已解锁）</h4>
        <div class="qa-options">
          ${EGO_GIFTS.map(g => `<div class="qa-option${state.gear.gift2Id === g.id ? " sel" : ""}" data-gf2="${g.id}">
            <div class="qa-opt-label">${g.name}</div>
            <div class="qa-opt-effect">${g.effect}</div>
          </div>`).join("")}
        </div>
      </div>` : ""}
    `;
    document.getElementById("inSpindles").onchange = (e) => { state.spindles = Math.max(0, +e.target.value || 0); saveState(); };
    document.getElementById("inMoney").onchange = (e) => { state.money = Math.max(0, +e.target.value || 0); saveState(); };
    document.getElementById("inWeaponName").oninput = (e) => { state.gear.weaponName = e.target.value; saveState(); renderSummary(); };
    stageCard.querySelectorAll("[data-wp]").forEach(el => el.onclick = () => { state.gear.weaponId = el.dataset.wp; render(); });
    stageCard.querySelectorAll("[data-gf1]").forEach(el => el.onclick = () => { state.gear.gift1Id = el.dataset.gf1; render(); });
    stageCard.querySelectorAll("[data-gf2]").forEach(el => el.onclick = () => { state.gear.gift2Id = el.dataset.gf2; render(); });
  }

  /* ---- 步骤 6：总览与三合一导出 ---- */
  function renderStep6() {
    const d = buildData();
    const botText = buildDicebotText(d);

    stageCard.innerHTML = `
      <h2>第七步 · 人格总览与导出</h2>
      <p class="lead">可直接一键复制骰娘录卡指令与出招宏进跑团群开打，或导出长图发群、导出 JSON 供战斗器读取与日后升级。</p>
      <div class="export-row" style="margin-bottom:18px">
        <button class="btn primary" id="btnCopyBot">📋 复制群名片 & 骰娘指令包</button>
        <button class="btn" id="btnExportImg">🖼 导出角色卡长图 (PNG)</button>
        <button class="btn" id="btnExportJson">⬇ 导出角色 JSON</button>
      </div>

      <div class="sheet">
        <h4>${escapeHtml(d.name)}${d.title ? ` · <span style="color:var(--muted);font-weight:400">${escapeHtml(d.title)}</span>` : ""}
          <span class="risk risk-${d.tier}">${d.tier}</span>
          <span class="ptag">${UPTIE_LEVELS[d.uptie].roman}</span>
        </h4>
        <table class="sh kv">
          <tr><td>生命值 / 混乱线</td><td><b>${d.derived.maxHp}</b> HP（首次 ≤ <b>${d.derived.staggerLine}</b> 陷入混乱）</td></tr>
          <tr><td>罪孽压力 / 行动槽</td><td>上限 <b>${d.derived.pressureCap}</b> 格 ｜ 每回合 <b>${d.derived.slots}</b> 行动槽</td></tr>
          <tr><td>六维属性</td><td>${ATTR_DEFS.map(a => `${a.key} <b>${d.attrs[a.key]}</b>`).join(" · ")}</td></tr>
          <tr><td>罪孽光谱</td><td>主导 <b>${d.spectrum.coreLabel}</b>(优势) · 显著 <b>${d.spectrum.secLabel}</b> · 潜在 <b>${d.spectrum.potLabel}</b> · 排斥 <b style="color:var(--danger)">${d.spectrum.rejLabel}</b>(劣势)</td></tr>
          ${d.passive ? `<tr><td>Ⅱ阶人格被动</td><td><b>【${d.passive.label}】</b>${d.passive.effect}</td></tr>` : ""}
          <tr><td>武器与饰品</td><td>${escapeHtml(d.gear.weapon.displayName)}${d.gear.gifts.length ? " · " + d.gear.gifts.map(g => escapeHtml(g.name)).join(" · ") : ""}</td></tr>
        </table>
      </div>

      <div class="sheet">
        <h4>战斗技能与守备（直接照抄骰娘指令）</h4>
        <table class="sh">
          <tr><th>栏位</th><th>名称与属性</th><th>骰娘指令 / 伤害</th><th>词条效果</th></tr>
          ${d.skills.map(s => `<tr>
            <td style="white-space:nowrap"><b>${s.slotLabel}</b><br><small style="color:var(--muted)">${s.cd ? `冷却 ${s.cd} 轮` : "无冷却"}</small></td>
            <td style="white-space:nowrap"><span class="sin-icon-inline">${sinIcon(s.sin)}</span><b>${escapeHtml(s.name)}</b><br><small style="color:var(--muted)">${s.modeLabel}(${s.attr}) · ${s.sinLabel}</small></td>
            <td style="white-space:nowrap"><code style="color:var(--accent-2)">.r 1d6+${s.clashBonus}</code><br>基础伤害 <b>${s.baseDmg}</b></td>
            <td>${s.traits.map(t => `<b>【${t.label}】</b>${t.effect}`).join("<br>")}</td>
          </tr>`).join("")}
          <tr>
            <td><b>守备</b><br><small style="color:var(--muted)">无冷却</small></td>
            <td><b>${d.defense.label}</b>${d.defense.sinLabel ? `<br><small style="color:var(--accent-2)">染 ${d.defense.sinLabel} 属性</small>` : ""}</td>
            <td style="white-space:nowrap">${d.defense.type === "counter"
              ? `护盾 <b>${d.defense.bonus}</b><br>反伤 <b>${d.defense.counterDmg}</b>`
              : `<code style="color:var(--accent-2)">.r 1d6+${d.defense.bonus}</code>`}</td>
            <td>${d.defense.effect}</td>
          </tr>
        </table>
      </div>

      <div class="sheet">
        <h4>E.G.O 装备列表</h4>
        <table class="sh">
          <tr><th>等级</th><th>名称</th><th>消耗 / 压力</th><th>拼点 / 伤害</th><th>专属效果</th></tr>
          ${d.egos.map(eg => `<tr>
            <td><span class="risk risk-${eg.rank}">${eg.rank}</span></td>
            <td><span class="sin-icon-inline">${sinIcon(eg.sin)}</span><b>${escapeHtml(eg.name)}</b></td>
            <td style="white-space:nowrap">${costText(eg.cost)}<br><small style="color:var(--danger)">压力 +${eg.pressureCost}</small></td>
            <td style="white-space:nowrap">${eg.stats?.supportOnly ? "免拼点支援" : `<code style="color:var(--accent-2)">.r 1d6+${eg.clashBonus}</code><br>基础伤害 <b>${eg.baseDmg}</b>`}</td>
            <td>${eg.effect}</td>
          </tr>`).join("")}
        </table>
      </div>

      <div class="sheet">
        <h4>跑团群名片 & 骰娘一键文本预览</h4>
        <textarea class="code-box" id="botPreview" readonly>${escapeHtml(botText)}</textarea>
      </div>
    `;

    document.getElementById("btnCopyBot").onclick = () => {
      navigator.clipboard?.writeText(botText).then(() => toast("已复制群名片与骰娘指令包！")).catch(() => {
        const ta = document.getElementById("botPreview");
        ta.select(); document.execCommand("copy"); toast("已复制！");
      });
    };
    document.getElementById("btnExportJson").onclick = exportJSON;
    document.getElementById("btnExportImg").onclick = () => exportImage(d);
  }

  function exportJSON() {
    const d = buildData();
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${d.name}_LimbusTRPG_v2.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出 2.0 角色 JSON");
  }

  /* 两遍测高绘制黑金角色卡 PNG */
  function paintSheet(ctx, d, H, measure) {
    const W = 780, M = 44, LH = 24;
    let y = 58;
    const on = (fn) => { if (!measure) fn(); };

    if (!measure) {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#191c26"); bg.addColorStop(1, "#0a0b0f");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#c8a24b"; ctx.lineWidth = 3; ctx.strokeRect(16, 16, W - 32, H - 32);
    }
    ctx.textBaseline = "alphabetic";

    const split = (txt, font, maxW) => {
      ctx.font = font;
      const s = String(txt || "—");
      const out = []; let cur = "";
      for (const ch of s) {
        if (cur && ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    };
    const put = (lines, x, font, color) => {
      on(() => { ctx.font = font; ctx.fillStyle = color; lines.forEach((t, i) => ctx.fillText(t, x, y + i * LH)); });
      y += lines.length * LH;
    };
    const sec = (title) => {
      y += 12;
      on(() => {
        ctx.font = "bold 18px 'Microsoft YaHei',sans-serif";
        ctx.fillStyle = "#c8a24b";
        ctx.fillText(title, M, y);
        ctx.strokeStyle = "#2a2e3a"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(M, y + 7); ctx.lineTo(W - M, y + 7); ctx.stroke();
      });
      y += LH + 6;
    };
    const kv = (k, v, color = "#e8e9ee") => {
      const lines = split(v, "15px 'Microsoft YaHei',sans-serif", W - M - 230);
      on(() => { ctx.font = "15px 'Microsoft YaHei',sans-serif"; ctx.fillStyle = "#9096a6"; ctx.fillText(k, M + 8, y); });
      put(lines, 230, "15px 'Microsoft YaHei',sans-serif", color);
    };

    on(() => {
      ctx.font = "bold 25px 'Microsoft YaHei',sans-serif";
      ctx.fillStyle = "#e6c76a";
      ctx.fillText(`Limbus Company TRPG 2.0 · ${d.name}`, M, y);
      ctx.font = "14px 'Microsoft YaHei',sans-serif";
      ctx.fillStyle = "#9096a6";
      ctx.fillText(`${d.title ? d.title + " · " : ""}${d.tier} 阶位 · ${UPTIE_LEVELS[d.uptie].roman}`, M, y + 24);
    });
    y += 46;

    sec("核心面板与罪孽光谱");
    kv("生命 / 混乱线", `HP ${d.derived.maxHp}  ｜  混乱线 ${d.derived.staggerLine}（首次跌至或低于时陷入混乱）`, "#e6c76a");
    kv("压力上限 / 槽位", `压力上限 ${d.derived.pressureCap} 格  ｜  每轮 ${d.derived.slots} 个行动槽`);
    kv("六维属性", ATTR_DEFS.map(a => `${a.key} ${d.attrs[a.key]}`).join("   "));
    kv("罪孽光谱", `主导[${d.spectrum.coreLabel}] · 显著[${d.spectrum.secLabel}] · 潜在[${d.spectrum.potLabel}] · 排斥[${d.spectrum.rejLabel}]`);
    if (d.passive) kv("人格被动", `【${d.passive.label}】${d.passive.effect}`);
    kv("武器与饰品", `${d.gear.weapon.displayName}${d.gear.gifts.length ? " / " + d.gear.gifts.map(g => g.name).join(" / ") : ""}`);

    sec("战斗三技能与守备");
    for (const s of d.skills) {
      const head = `${s.slotLabel}【${s.name}】 (${s.modeLabel}/${s.sinLabel} · ${s.cd ? `CD:${s.cd}` : "无CD"})  →  拼点 1D6+${s.clashBonus}  |  基础伤害 ${s.baseDmg}`;
      put(split(head, "bold 15px 'Microsoft YaHei',sans-serif", W - M * 2 - 12), M + 8, "bold 15px 'Microsoft YaHei',sans-serif", "#e6c76a");
      for (const t of s.traits) {
        put(split(`  ▸ 【${t.label}】${t.effect}`, "14px 'Microsoft YaHei',sans-serif", W - M * 2 - 20), M + 16, "14px 'Microsoft YaHei',sans-serif", "#e8e9ee");
      }
      y += 4;
    }
    const df = d.defense;
    put(split(`守备【${df.label}】${df.sinLabel ? `(${df.sinLabel})` : ""}  →  ${df.type === "counter" ? `获${df.bonus}盾硬吃后反打${df.counterDmg}伤` : `1D6+${df.bonus}`}`, "bold 15px 'Microsoft YaHei',sans-serif", W - M * 2 - 12), M + 8, "bold 15px 'Microsoft YaHei',sans-serif", "#e6c76a");
    put(split(`  ▸ ${df.effect}`, "14px 'Microsoft YaHei',sans-serif", W - M * 2 - 20), M + 16, "14px 'Microsoft YaHei',sans-serif", "#cfd3e0");

    sec("E.G.O 装备栏");
    for (const eg of d.egos) {
      put(split(`[${eg.rank}] 【${eg.name}】 (${eg.sinLabel} · 耗 ${costText(eg.cost)} · 压+${eg.pressureCost})  →  ${eg.stats?.supportOnly ? "纯支援" : `拼点 1D6+${eg.clashBonus} | 基础伤 ${eg.baseDmg}`}`, "bold 15px 'Microsoft YaHei',sans-serif", W - M * 2 - 12), M + 8, "bold 15px 'Microsoft YaHei',sans-serif", "#e6c76a");
      put(split(`  ▸ ${eg.effect}`, "14px 'Microsoft YaHei',sans-serif", W - M * 2 - 20), M + 16, "14px 'Microsoft YaHei',sans-serif", "#e8e9ee");
      y += 4;
    }

    y += 18;
    on(() => {
      ctx.font = "12px 'Microsoft YaHei',sans-serif";
      ctx.fillStyle = "#5a5f6e";
      ctx.fillText(`Limbus Company TRPG 2.0 · 生成于 ${new Date().toLocaleString("zh-CN")}`, M, y);
    });
    return y + 36;
  }

  function exportImage(d) {
    const cv = document.getElementById("exportCanvas");
    const ctx = cv.getContext("2d");
    cv.width = 780;
    const h = Math.ceil(paintSheet(ctx, d, 0, true));
    cv.height = Math.max(480, h);
    paintSheet(ctx, d, cv.height, false);
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png");
    a.download = `${d.name}_LimbusTRPG_v2.png`;
    a.click();
    toast("已导出角色长图 PNG");
  }

  function renderNav() {
    btnBack.disabled = current === 0;
    if (current === STEPS.length - 1) {
      btnNext.textContent = "✔ 已在总览页";
      btnNext.disabled = true;
    } else {
      btnNext.textContent = "下一步 →";
      btnNext.disabled = !canLeave(current);
    }
  }

  function render() {
    reconcileCharacter();
    renderChips();
    [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6][current]();
    renderNav();
    renderSummary();
    saveState();
  }

  btnBack.onclick = () => { if (current > 0) { current--; render(); } };
  btnNext.onclick = () => { if (current < STEPS.length - 1 && canLeave(current)) { current++; render(); } };

  document.getElementById("btnReset").onclick = () => {
    if (!confirm("确定清空当前角色数据，从头创建新罪人吗？")) return;
    state = defaultState(); current = 0; render(); toast("已重置为新角色");
  };

  const impBtn = document.getElementById("btnImportJson");
  const impIn = document.getElementById("importJsonInput");
  impBtn.onclick = () => impIn.click();
  impIn.onchange = (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d._rawState) {
          state = Object.assign(defaultState(), d._rawState);
          reconcileCharacter();
          current = 0;
          render();
          toast(`已读入「${d.name}」，可直接调整阶位与同期化升级！`);
        } else {
          toast("该 JSON 不是 2.0 版建卡器导出的文件（旧版角色请前往 1.0 归档查看）");
        }
      } catch (err) { toast("读取失败：" + err.message); }
    };
    r.readAsText(f);
    ev.target.value = "";
  };

  loadState();
  render();
}
