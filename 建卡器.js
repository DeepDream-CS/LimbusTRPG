/* ============ 数据模型 ============ */
const ATTR_DEFS = [
  {key:"力量", use:"近战蛮力、搬运、破坏、压制、抵抗击退"},
  {key:"灵巧", use:"速度、反应、射击、潜行、精密操作"},
  {key:"体魄", use:"生命值、耐力、抵抗毒素和身体异常"},
  {key:"认知", use:"观察、调查、知识、技术、分析敌人机制"},
  {key:"意志", use:"精神稳定、忍耐、抵抗恐惧、驾驭E.G.O"},
  {key:"共感", use:"说服、威胁、识人、欺骗、支援他人"},
];
const LEVEL_MEANING = {1:"明显不擅长",2:"普通成年人",3:"接受过专业训练",4:"行业中的优秀人物",5:"都市中的非正常水平"};
const SPEED_TABLE = {
  1:{range:"1—3",dice:"1D3"},
  2:{range:"2—4",dice:"1D3＋1"},
  3:{range:"2—5",dice:"1D4＋1"},
  4:{range:"3—6",dice:"1D4＋2"},
  5:{range:"4—7",dice:"1D4＋3"},
};
const BASE_POINTS = 8;      // 额外可分配点数
const TOTAL_TARGET = 14;    // 六项总和固定

/* ============ 罪孽数据 ============ */
const SIN_ORDER = ["wrath","lust","sloth","gluttony","gloom","pride","envy"];
const SIN_LABELS = {
  wrath:"暴怒", lust:"色欲", sloth:"怠惰", gluttony:"暴食",
  gloom:"忧郁", pride:"傲慢", envy:"嫉妒"
};
// 每种罪孽对应的图标文件（放在 图片/ 目录下，文件名为中文罪孽名）
const SIN_ICON_FILES = {
  wrath:"暴怒", lust:"色欲", sloth:"怠惰", gluttony:"暴食",
  gloom:"忧郁", pride:"傲慢", envy:"嫉妒"
};
// 返回图标 <img>；alt 用中文名，兼顾无障碍与图片缺失时的回退
function sinIcon(key){
  return `<img class="sin-icon" src="图片/${SIN_ICON_FILES[key]}.png" alt="${SIN_LABELS[key]}" loading="lazy">`;
}
const SIN_DEFINITIONS = {
  wrath:{keywords:["冲突","反抗","破坏","强迫","报复"],summary:"通过对抗、破坏或强制手段改变现状。",quote:"既然问题挡在面前，那就把它打碎。"},
  lust:{keywords:["欲望","依恋","诱惑","情感联系","执着"],summary:"追求爱情、关注、认可、美感、刺激或其他满足。",quote:"只要能够得到我想要的东西，代价并不重要。"},
  sloth:{keywords:["停滞","回避","等待","麻木","拒绝改变"],summary:"通过拖延、回避或拒绝行动保存自己。",quote:"只要我不采取行动，事情也许会自己过去。"},
  gluttony:{keywords:["获取","占有","积累","吞噬","索取"],summary:"不断获取物资、知识、权力、经历或他人的价值。",quote:"现在拥有的还远远不够。"},
  gloom:{keywords:["失落","痛苦","承受","牺牲","自责"],summary:"沉浸痛苦、承担代价或将牺牲视为自身价值。",quote:"既然痛苦无法消失，那就由我继续承受。"},
  pride:{keywords:["自我证明","控制","正确","优越","完美"],summary:"通过控制、专业和证明正确来维持自我价值。",quote:"只有按照我的方式，事情才不会出错。"},
  envy:{keywords:["比较","模仿","夺取","竞争","不甘"],summary:"渴望、模仿、超越或夺取他人拥有的事物。",quote:"为什么他能够拥有，而我不能？"}
};
// 数值等级名称与说明：0 排斥 / 1 潜在 / 2 显著 / 3 主导
const SIN_LEVEL_NAMES = ["排斥","潜在","显著","主导"];
const SIN_LEVEL_DESC = [
  "角色刻意压抑或无法面对这种冲动。",
  "偶尔浮现，但不主导行动。",
  "明显且经常影响角色的选择。",
  "角色最本能、最难摆脱的行动方式。"
];
const SIN_POINTS = 8;   // 罪孽总点数
const SIN_MAX = 3;      // 单项上限

/* ============ 罪孽卡片系统数据 ============ */

/* 攻击模式（6.2）
   speed 决定该模式下如何取得接线权（拦下敌人的攻击）：
     roll   斩击 —— 按属性查 SPEED_TABLE 投骰，速度 ≥ 敌方速度时可接线
     fixed  突刺 —— 速度恒等于属性值，不投骰
     ignore 打击 —— 无视速度无条件接线，代价是防御拼点减值 */
const ATTACK_MODES = {
  slash:  {label:"斩击", attr:"灵巧", desc:"以速度与精准斩开对手", speed:"roll"},
  strike: {label:"打击", attr:"力量", desc:"以沉重力量碾压对手", speed:"ignore"},
  pierce: {label:"突刺", attr:"认知", desc:"以精准判断直取要害", speed:"fixed"}
};
/* 打击模式无条件接线的代价：力量越高罚得越轻，避免用 1 点力量白嫖接线权 */
const STRIKE_CLASH_PENALTY = {1:-4, 2:-3, 3:-2, 4:-1, 5:-1};

/* 罪孽特性可用表（7.2） */
const SIN_TRAIT_OPTIONS = {
  wrath:["attack","defense"],
  lust:["attack","buff"],
  sloth:["counter","shield"],   // 怠惰不走常规防御，改为反击 / 援护
  gluttony:["attack","defense"],
  gloom:["attack","debuff"],
  pride:["attack","defense"],
  envy:["attack","defense","support"]
};
const SIN_CONDITIONAL_TRAITS = {
  gluttony:{special:2},
  pride:{multiAttack:2}
};
const TRAIT_LABELS = {
  attack:"攻击", defense:"防御", buff:"增益", shield:"援护",
  special:"特殊", debuff:"减益", multiAttack:"多重攻击", support:"辅助",
  counter:"反击"
};

/* 基础卡片数值（7.5-7.7） */
const CARD_BASE_EFFECT = {
  attack:"拼点胜利 → 造成 3 + 差值 的伤害",
  defense:"拼点胜利 → 完全格挡；失败 → 你恢复 2 HP",
  buff:"你或一名友方立即恢复 2 HP",
  shield:"拼点胜利 → 友方不受伤害；失败 → 你替友方受全部伤害，你获得 2 临时生命",
  debuff:"一名敌人本轮拼点骰 -1",
  support:"你或一名友方本轮拼点骰 +1",
  counter:"拼点胜利 → 完全格挡，并对攻击者造成 3 点伤害；失败 → 你获得 2 点临时生命"
};
const CARD_SKILL_BASE = {
  attack:     {small:"基础伤害 5 + 差值", large:"基础伤害 8 + 差值"},
  defense:    {small:"拼点胜利完全格挡；失败→恢复5HP", large:"拼点胜利完全格挡；失败→恢复8HP"},
  buff:       {small:"恢复3HP+获得2临时生命", large:"恢复5HP+获得4临时生命"},
  // 援护大技能：满组时的一次性倾泻。条件与【切换】写在基础效果里，第三问只负责收益分支
  shield:     {small:"拼点胜利→友方不受伤害，你获得3临时生命；失败→你替友方受全部伤害，你获得5临时生命", large:"【仅当本组所有卡片均未使用时可打出】弃掉本组其余全部卡片，每弃掉一张你获得 3 点临时生命；拼点胜利→友方不受伤害；失败→你替友方受全部伤害。结算后【切换】到另一组卡片"},
  // 反击大技能：空组时的爆发，把攒下的壳一次性换成伤害，与援护构成循环的两端
  counter:    {small:"拼点胜利 → 完全格挡并对攻击者造成 5 点伤害；失败 → 你获得 3 点临时生命", large:"【仅当本组已无其他可用卡时可打出】消耗你当前全部临时生命（含本卡获得的），本次反击基础伤害 ＝ 8 ＋ 消耗掉的点数。拼点胜利 → 完全格挡并造成 基础伤害 ＋ 差值；拼点失败 → 你照常受到伤害，但仍对攻击者造成基础伤害的一半（向下取整）。结算后【切换】到另一组卡片"},
  debuff:     {small:"一名敌人本轮拼点骰 -2", large:"一名敌人本轮拼点骰 -3"},
  support:    {small:"拼点骰+2", large:"拼点骰+3"},
  special:    {small:"弃掉一张未使用卡片，恢复3HP", large:"弃掉两张未使用卡片，恢复5HP"},
  multiAttack:{small:"额外消耗本组一张未使用的基础攻击卡，本回合发动两次攻击、各自独立拼点，每次基础伤害3；无基础攻击卡可消耗时只发动一次，基础伤害5", large:"额外消耗本组一张未使用的基础攻击卡，本回合发动两次攻击、各自独立拼点，每次基础伤害5；无基础攻击卡可消耗时只发动一次，基础伤害8"}
};

/* 七罪技能特效问答数据（8.1-8.7） */
const SIN_TRAIT_QA = {
  wrath:{
    attack:{
      small:[
        {question:"你的怒火从何而来？",options:[
          {label:"愤怒",effect:"伤害 +2"},
          {label:"燃烧",effect:"命中后目标在本轮结束时受到 2 点灼烧伤害"},
          {label:"重压",effect:"目标的防御拼点骰 -1"}
        ]},
        {question:"它让你能够____。",options:[
          {label:"尽情释放",effect:"你的拼点骰 +1"},
          {label:"挑战众人",effect:"命中时目标相邻的一名敌人受到 3 点伤害"},
          {label:"破釜沉舟",effect:"你受到 2 点伤害，本次伤害 +3"}
        ]}
      ],
      large:[
        {question:"你的怒火从何而来？",options:[
          {label:"愤怒",effect:"伤害 +3"},
          {label:"燃烧",effect:"命中后目标在本轮结束时受到 3 点灼烧伤害"},
          {label:"积怨",effect:"若你本轮已受到过伤害，本次伤害 +4"}
        ]},
        {question:"它让你能够____。",options:[
          {label:"尽情释放",effect:"你的拼点骰 +2"},
          {label:"挑战众人",effect:"命中时所有其他敌人受到 3 点伤害"},
          {label:"破釜沉舟",effect:"你受到 3 点伤害，本次伤害 +5"}
        ]},
        {question:"怒火的尽头是什么？",options:[
          {label:"精疲力竭",effect:"你获得 4 点临时生命，但本轮不能打出防御卡"},
          {label:"怒不可遏",effect:"若此攻击使目标 HP 降至混乱线以下，你恢复 4 HP"},
          {label:"【切换】怒焰冲天",effect:"切换到此攻击模式时，你对所有敌人造成 2 点伤害"}
        ]}
      ]
    },
    defense:{
      small:[
        {question:"你如何以怒还怒？",options:[
          {label:"反击",effect:"防御胜利时，对攻击者造成 3 点伤害"},
          {label:"震慑",effect:"攻击者本轮拼点骰 -1"},
          {label:"蛮力",effect:"防御胜利时，攻击者本轮当前速度 -2"}
        ]},
        {question:"你的防线由什么构成？",options:[
          {label:"暴戾",effect:"你的防御拼点骰 +1"},
          {label:"嗜血",effect:"防御胜利时你恢复 2 HP"},
          {label:"不退半步",effect:"防御失败时你恢复 3 HP"}
        ]}
      ],
      large:[
        {question:"你如何以怒还怒？",options:[
          {label:"反击",effect:"防御胜利时，对攻击者造成 5 点伤害"},
          {label:"震慑",effect:"攻击者本轮拼点骰 -2"},
          {label:"蛮力",effect:"防御胜利时，攻击者本轮当前速度 -3"}
        ]},
        {question:"你的防线由什么构成？",options:[
          {label:"暴戾",effect:"你的防御拼点骰 +2"},
          {label:"嗜血",effect:"防御胜利时你恢复 4 HP"},
          {label:"不退半步",effect:"防御失败时你恢复 5 HP"}
        ]},
        {question:"愤怒的壁垒能撑多久？",options:[
          {label:"以攻代守",effect:"防御胜利时额外造成 2 点伤害，防御失败时仍对攻击者造成 2 点伤害"},
          {label:"怒焰护体",effect:"防御胜利时，攻击者受到 3 点灼烧伤害"},
          {label:"【切换】怒焰之壁",effect:"切换到此攻击模式时，你获得 3 点临时生命"}
        ]}
      ]
    }
  },
  lust:{
    attack:{
      small:[
        {question:"你的攻击中蕴含什么？",options:[
          {label:"魅力",effect:"命中后一名友方恢复 2 HP"},
          {label:"执念",effect:"命中后你的拼点骰 +1（本次攻击中立即生效）"},
          {label:"诱惑",effect:"目标本轮拼点骰 -1"}
        ]},
        {question:"你从中得到了什么？",options:[
          {label:"满足",effect:"命中后你恢复 2 HP"},
          {label:"渴望",effect:"命中后你对同一目标立即再造成 2 点伤害"},
          {label:"牵绊",effect:"命中后你和一名友方各恢复 1 HP"}
        ]}
      ],
      large:[
        {question:"你的攻击中蕴含什么？",options:[
          {label:"魅力",effect:"命中后一名友方恢复 4 HP"},
          {label:"执念",effect:"你的拼点骰 +2"},
          {label:"诱惑",effect:"目标本轮拼点骰 -2"}
        ]},
        {question:"你从中得到了什么？",options:[
          {label:"满足",effect:"命中后你恢复 4 HP"},
          {label:"渴望",effect:"命中后你对同一目标立即再造成 3 点伤害"},
          {label:"牵绊",effect:"命中后你和所有友方各恢复 2 HP"}
        ]},
        {question:"欲望的终点是？",options:[
          {label:"独占",effect:"本次伤害 +2，你对同一目标再立即造成 2 点伤害"},
          {label:"沉溺",effect:"你获得 4 点临时生命"},
          {label:"【切换】欲念缠绕",effect:"切换到此攻击模式时，你恢复 3 HP，一名友方恢复 2 HP"}
        ]}
      ]
    },
    buff:{
      small:[
        {question:"你想强化什么？",options:[
          {label:"锋芒",effect:"你或一名友方本轮拼点骰 +2"},
          {label:"坚韧",effect:"你或一名友方获得 3 点临时生命"},
          {label:"敏锐",effect:"你或一名友方本轮当前速度 +2"}
        ]},
        {question:"增益的代价是什么？",options:[
          {label:"微痛",effect:"你受到 1 点伤害，效果数值 +1"},
          {label:"无偿",effect:"你和一名友方各恢复 2 HP"},
          {label:"依赖",effect:"你受到 1 点伤害，一名友方本轮拼点骰 +1"}
        ]}
      ],
      large:[
        {question:"你想强化什么？",options:[
          {label:"锋芒",effect:"你或一名友方本轮拼点骰 +3"},
          {label:"坚韧",effect:"你或一名友方获得 5 点临时生命"},
          {label:"敏锐",effect:"你或一名友方本轮当前速度 +3"}
        ]},
        {question:"增益的代价是什么？",options:[
          {label:"微痛",effect:"你受到 2 点伤害，效果数值 +2"},
          {label:"无偿",effect:"你和所有友方各恢复 2 HP"},
          {label:"依赖",effect:"你受到 1 点伤害，一名友方本轮拼点骰 +2"}
        ]},
        {question:"增幅的极致是？",options:[
          {label:"共鸣",effect:"所有友方本轮拼点骰 +1"},
          {label:"持久",effect:"你和一名友方各获得 3 点临时生命"},
          {label:"【切换】欲望之潮",effect:"切换到此攻击模式时，你和所有友方各恢复 2 HP"}
        ]}
      ]
    }
  },
  /* 怠惰：攒厚壳、用壳还击。小技能围绕临时生命与「按剩余临时生命换伤害」，
     大技能的第三问才解锁空组/满组的一次性大招（条件与【切换】写在 CARD_SKILL_BASE 里）。 */
  sloth:{
    counter:{
      small:[
        {question:"你靠什么撑过这一击？",options:[
          {label:"蓄势",effect:"你获得 4 点临时生命"},
          {label:"龟缩",effect:"你的防御拼点骰 +2，你获得 2 点临时生命"},
          {label:"韧壳",effect:"拼点失败时你改为获得 6 点临时生命"}
        ]},
        {question:"反击的力道从何而来？",options:[
          {label:"厚积薄发",effect:"反击伤害额外 + 你当前临时生命的一半（向下取整）"},
          {label:"以静制动",effect:"反击伤害额外 +3；若你本轮尚未受到伤害，改为 +5"},
          {label:"卸力反打",effect:"反击伤害额外 + 本次被格挡下来的伤害的一半（向下取整）"}
        ]}
      ],
      large:[
        {question:"你靠什么撑过这一击？",options:[
          {label:"蓄势",effect:"你获得 6 点临时生命"},
          {label:"龟缩",effect:"你的防御拼点骰 +3，你获得 4 点临时生命"},
          {label:"韧壳",effect:"拼点失败时你改为获得 9 点临时生命"}
        ]},
        {question:"反击的力道从何而来？",options:[
          {label:"厚积薄发",effect:"消耗临时生命换取伤害时，每 1 点改为 2 点伤害"},
          {label:"以静制动",effect:"本次反击基础伤害额外 +5；若你本轮尚未受到伤害，改为 +8"},
          {label:"卸力反打",effect:"本次反击基础伤害额外 + 本次被格挡下来的全部伤害"}
        ]},
        {question:"沉睡到最后一刻，醒来时是什么？",options:[
          {label:"【切换】倾泻",effect:"本次反击基础伤害额外 +6；结算后切换到另一组时，你本轮拼点骰 +2"},
          {label:"溅射",effect:"本次反击的伤害同时对与攻击者相邻的所有敌人各造成一次"},
          {label:"【切换】不死不休",effect:"拼点失败时改为对攻击者造成基础伤害的全额；若本次反击击杀攻击者，你恢复 6 HP 并获得 4 点临时生命"}
        ]}
      ]
    },
    shield:{
      small:[
        {question:"你用什么替他挡下来？",options:[
          {label:"厚甲",effect:"你获得 5 点临时生命"},
          {label:"分担",effect:"你与被庇护的友方各获得 3 点临时生命"},
          {label:"垫背",effect:"拼点失败时你改为获得 8 点临时生命"}
        ]},
        {question:"挡下之后呢？",options:[
          {label:"反压",effect:"拼点胜利时，对攻击者造成等同于你当前临时生命一半的伤害（向下取整）"},
          {label:"稳住阵脚",effect:"被庇护的友方本轮拼点骰 +2"},
          {label:"顺势",effect:"你的援护拼点骰 +2；拼点胜利时你额外获得 2 点临时生命"}
        ]}
      ],
      large:[
        {question:"你用什么替他挡下来？",options:[
          {label:"厚甲",effect:"你获得 8 点临时生命"},
          {label:"分担",effect:"你与所有友方各获得 4 点临时生命"},
          {label:"垫背",effect:"拼点失败时你改为获得 12 点临时生命"}
        ]},
        {question:"挡下之后呢？",options:[
          {label:"反压",effect:"拼点胜利时，对攻击者造成等同于你当前临时生命的伤害"},
          {label:"稳住阵脚",effect:"所有友方本轮拼点骰 +2"},
          {label:"顺势",effect:"你的援护拼点骰 +3；拼点胜利时你额外获得 4 点临时生命"}
        ]},
        {question:"把整组都押上去，换来什么？",options:[
          {label:"倾覆",effect:"每弃掉一张卡片改为获得 5 点临时生命"},
          {label:"壁垒",effect:"本轮内所有友方受到的伤害 -3"},
          {label:"【切换】久眠",effect:"结算后切换到另一组时，你再获得 4 点临时生命，且下一轮你的防御与援护拼点骰 +2"}
        ]}
      ]
    }
  },
  gluttony:{
    attack:{
      small:[
        {question:"你要吞噬什么？",options:[
          {label:"血肉",effect:"命中后你恢复等同于造成伤害一半的 HP（向下取整）"},
          {label:"力量",effect:"目标本轮拼点骰 -1"},
          {label:"养分",effect:"你立即恢复 3 HP（无论是否命中）"}
        ]},
        {question:"你的胃口有多大？",options:[
          {label:"贪得无厌",effect:"若此攻击击杀目标，你额外恢复 5 HP"},
          {label:"细嚼慢咽",effect:"你本卡的所有恢复效果 +2"},
          {label:"饥不择食",effect:"你受到 2 点伤害，本次伤害 +3"}
        ]}
      ],
      large:[
        {question:"你要吞噬什么？",options:[
          {label:"血肉",effect:"命中后你恢复等同于造成伤害一半的 HP（向下取整）"},
          {label:"力量",effect:"目标本轮拼点骰 -2"},
          {label:"养分",effect:"你立即恢复 5 HP（无论是否命中）"}
        ]},
        {question:"你的胃口有多大？",options:[
          {label:"贪得无厌",effect:"若此攻击击杀目标，你额外恢复 8 HP"},
          {label:"细嚼慢咽",effect:"你本卡的所有恢复效果 +3"},
          {label:"饥不择食",effect:"你受到 4 点伤害，本次伤害 +5"}
        ]},
        {question:"吞噬的尽头是？",options:[
          {label:"消化吸收",effect:"你获得 5 点临时生命"},
          {label:"吐故纳新",effect:"额外弃掉一张未使用卡片，你恢复 5 HP"},
          {label:"【切换】暴食之躯",effect:"切换到此攻击模式时，你恢复 3 HP，并获得 2 点临时生命"}
        ]}
      ]
    },
    defense:{
      small:[
        {question:"你如何从防御中汲取？",options:[
          {label:"吞噬攻击",effect:"防御胜利时你恢复 3 HP"},
          {label:"吸收冲击",effect:"防御失败时你恢复 2 HP"},
          {label:"储备",effect:"你获得 2 点临时生命"}
        ]},
        {question:"你的壁垒靠什么维持？",options:[
          {label:"暴食本能",effect:"你的防御拼点骰 +1，但恢复效果 -1"},
          {label:"贪婪",effect:"若你当前 HP 低于一半，你的防御拼点骰 +2"},
          {label:"索取",effect:"防御胜利时攻击者受到 2 点伤害"}
        ]}
      ],
      large:[
        {question:"你如何从防御中汲取？",options:[
          {label:"吞噬攻击",effect:"防御胜利时你恢复 5 HP"},
          {label:"吸收冲击",effect:"防御失败时你恢复 3 HP"},
          {label:"储备",effect:"你获得 4 点临时生命"}
        ]},
        {question:"你的壁垒靠什么维持？",options:[
          {label:"暴食本能",effect:"你的防御拼点骰 +2，但恢复效果 -2"},
          {label:"贪婪",effect:"若你当前 HP 低于一半，你的防御拼点骰 +3"},
          {label:"索取",effect:"防御胜利时攻击者受到 3 点伤害"}
        ]},
        {question:"吞噬之壁的尽头是？",options:[
          {label:"反刍",effect:"防御成功时，你对攻击者造成 3 点伤害"},
          {label:"饱腹",effect:"防御成功时你恢复 3 HP 并获得 2 点临时生命"},
          {label:"【切换】饥饿循环",effect:"切换到此攻击模式时，你恢复 2 HP"}
        ]}
      ]
    },
    special:{
      small:[
        {question:"你舍弃什么来换取更多？",options:[
          {label:"丢弃锋芒",effect:"弃掉一张攻击卡，恢复 3 HP"},
          {label:"丢弃坚壁",effect:"弃掉一张防御卡，恢复 3 HP"},
          {label:"丢弃积累",effect:"弃掉任意一张未使用卡片，恢复 3 HP"}
        ]},
        {question:"循环加速后你得到什么？",options:[
          {label:"饥饿感",effect:"你本轮拼点骰 +1"},
          {label:"满足感",effect:"你额外恢复 2 HP"},
          {label:"空虚感",effect:"你受到 1 点伤害，但本轮当前速度 +2"}
        ]}
      ],
      large:[
        {question:"你舍弃什么来换取更多？",options:[
          {label:"丢弃锋芒",effect:"弃掉两张攻击卡，恢复 5 HP"},
          {label:"丢弃坚壁",effect:"弃掉两张防御卡，恢复 5 HP"},
          {label:"丢弃积累",effect:"弃掉两张任意未使用卡片，恢复 5 HP"}
        ]},
        {question:"循环加速后你得到什么？",options:[
          {label:"饥饿感",effect:"你本轮拼点骰 +2"},
          {label:"满足感",effect:"你额外恢复 3 HP"},
          {label:"空虚感",effect:"你受到 2 点伤害，但本轮当前速度 +3"}
        ]},
        {question:"贪婪的尽头是？",options:[
          {label:"鲸吞",effect:"弃掉当前组中所有剩余未使用卡片，你恢复等同于弃掉卡片数×2的HP，当前组立即刷新"},
          {label:"反刍",effect:"从弃掉的卡片中选择一张加入当前组（本次不消耗）"},
          {label:"【切换】饥饿吞噬",effect:"切换到此攻击模式时，你弃掉一张卡片并恢复 3 HP"}
        ]}
      ]
    }
  },
  gloom:{
    attack:{
      small:[
        {question:"你的痛苦如何伤害他人？",options:[
          {label:"腐蚀",effect:"目标本轮拼点骰 -1"},
          {label:"沉重",effect:"命中后目标本轮当前速度 -2"},
          {label:"侵蚀",effect:"命中后目标本轮不能恢复 HP、不能获得临时生命"}
        ]},
        {question:"你付出的代价是什么？",options:[
          {label:"自责",effect:"你受到 2 点伤害，本次伤害 +3"},
          {label:"麻木",effect:"你本轮拼点骰 -1，但本次伤害 +2"},
          {label:"承受",effect:"你本轮防御拼点骰 -2，但目标的攻击拼点骰 -2"}
        ]}
      ],
      large:[
        {question:"你的痛苦如何伤害他人？",options:[
          {label:"腐蚀",effect:"目标本轮拼点骰 -2"},
          {label:"沉重",effect:"命中后目标本轮当前速度 -3"},
          {label:"侵蚀",effect:"命中后目标本轮不能恢复 HP、不能获得临时生命，且本轮拼点骰 -1"}
        ]},
        {question:"你付出的代价是什么？",options:[
          {label:"自责",effect:"你受到 3 点伤害，本次伤害 +4"},
          {label:"麻木",effect:"你本轮拼点骰 -1，但本次伤害 +3"},
          {label:"承受",effect:"你本轮防御拼点骰 -2，但目标的攻击拼点骰 -3"}
        ]},
        {question:"苦难的尽头是？",options:[
          {label:"共鸣",effect:"若你当前 HP 低于 50%，本次伤害 +4"},
          {label:"绝望蔓延",effect:"与目标相邻的敌人本轮拼点骰各 -2，且本轮受到的伤害各 +2"},
          {label:"【切换】忧郁气场",effect:"切换到此攻击模式时，所有敌人本轮拼点骰 -1"}
        ]}
      ]
    },
    debuff:{
      small:[
        {question:"你要夺走什么？",options:[
          {label:"力量",effect:"目标本轮攻击拼点骰额外 -1"},
          {label:"意志",effect:"目标本轮防御拼点骰额外 -1"},
          {label:"敏锐",effect:"目标本轮当前速度 -2"}
        ]},
        {question:"痛苦如何扩散？",options:[
          {label:"蔓延",effect:"与目标相邻的一名敌人本轮拼点骰 -1"},
          {label:"加深",effect:"目标本轮受到的伤害 +2"},
          {label:"自苦",effect:"你受到 2 点伤害，目标本轮拼点骰额外 -2"}
        ]}
      ],
      large:[
        {question:"你要夺走什么？",options:[
          {label:"力量",effect:"目标本轮攻击拼点骰额外 -2"},
          {label:"意志",effect:"目标本轮防御拼点骰额外 -2"},
          {label:"敏锐",effect:"目标本轮当前速度 -3"}
        ]},
        {question:"痛苦如何扩散？",options:[
          {label:"蔓延",effect:"与目标相邻的所有敌人本轮拼点骰各 -1"},
          {label:"加深",effect:"目标本轮受到的伤害 +3"},
          {label:"自苦",effect:"你受到 3 点伤害，目标本轮拼点骰额外 -3"}
        ]},
        {question:"剥夺的尽头是？",options:[
          {label:"虚弱领域",effect:"所有敌人本轮当前速度 -1"},
          {label:"以痛止痛",effect:"你受到 2 点伤害，一名友方本轮拼点骰 +2"},
          {label:"【切换】绝望之影",effect:"切换到此攻击模式时，所有敌人本轮当前速度 -2"}
        ]}
      ]
    }
  },
  pride:{
    attack:{
      small:[
        {question:"你如何证明自己？",options:[
          {label:"精准",effect:"你的拼点骰 +1"},
          {label:"从容",effect:"若你本轮尚未受到伤害，你的拼点骰 +2"},
          {label:"优越",effect:"若你的当前 HP 高于目标，伤害 +2"}
        ]},
        {question:"你的方式是什么？",options:[
          {label:"完美计算",effect:"你可以在看到对方拼点骰结果后，再决定是否使用此卡（若不用则不消耗）"},
          {label:"全面压制",effect:"命中后目标本轮不能打出防御卡"},
          {label:"临机应变",effect:"若拼点失败，你立即打出一张防御卡作为反应（额外消耗该卡）"}
        ]}
      ],
      large:[
        {question:"你如何证明自己？",options:[
          {label:"精准",effect:"你的拼点骰 +2"},
          {label:"从容",effect:"若你本轮尚未受到伤害，你的拼点骰 +3"},
          {label:"优越",effect:"若你的当前 HP 高于目标，伤害 +3"}
        ]},
        {question:"你的方式是什么？",options:[
          {label:"完美计算",effect:"你可以在看到对方拼点骰结果后，再决定是否使用此卡（若不用则不消耗）"},
          {label:"全面压制",effect:"命中后目标本轮不能打出防御卡"},
          {label:"临机应变",effect:"若拼点失败，你仅受到基础伤害，且对目标造成 2 点伤害"}
        ]},
        {question:"完美的代价是？",options:[
          {label:"不容差错",effect:"若此卡未命中，你受到 3 点伤害"},
          {label:"游刃有余",effect:"你获得 3 点临时生命"},
          {label:"【切换】王者之姿",effect:"切换到此攻击模式时，你本轮拼点骰 +1，恢复 2 HP"}
        ]}
      ]
    },
    defense:{
      small:[
        {question:"你如何化解攻击？",options:[
          {label:"看穿",effect:"你的防御拼点骰 +1"},
          {label:"以退为进",effect:"防御胜利时，你对攻击者造成 2 点伤害"},
          {label:"偏转",effect:"防御失败时你恢复 3 HP"}
        ]},
        {question:"你的防线有什么特色？",options:[
          {label:"无懈可击",effect:"攻击者本轮拼点骰 -1"},
          {label:"指挥若定",effect:"防御胜利时，一名友方本轮拼点骰 +1"},
          {label:"游刃有余",effect:"防御成功后，你可以免费切换攻击模式"}
        ]}
      ],
      large:[
        {question:"你如何化解攻击？",options:[
          {label:"看穿",effect:"你的防御拼点骰 +2"},
          {label:"以退为进",effect:"防御胜利时，你对攻击者造成 3 点伤害"},
          {label:"偏转",effect:"防御失败时你恢复 5 HP"}
        ]},
        {question:"你的防线有什么特色？",options:[
          {label:"无懈可击",effect:"攻击者本轮拼点骰 -2"},
          {label:"指挥若定",effect:"防御胜利时，所有友方本轮拼点骰 +1"},
          {label:"游刃有余",effect:"防御成功后，你可以免费切换攻击模式并恢复 2 HP"}
        ]},
        {question:"完美的壁垒能撑多久？",options:[
          {label:"完美防御",effect:"若你的拼点值高出攻击方 4 或以上，攻击者受到 3 点伤害"},
          {label:"全盘掌控",effect:"防御成功时你获得 3 点临时生命"},
          {label:"【切换】绝对防御",effect:"切换到此攻击模式时，你获得 4 点临时生命"}
        ]}
      ]
    },
    multiAttack:{
      small:[
        {question:"你如何展开双重打击？",options:[
          {label:"连击",effect:"两次攻击的目标可以不同"},
          {label:"集中",effect:"两次攻击对同一目标时，第二次拼点骰 +1"},
          {label:"变招",effect:"第二次攻击改用你另一组攻击模式的拼点属性（两组模式相同时改为第二次拼点骰 +1）"}
        ]},
        {question:"多重攻击的节奏是？",options:[
          {label:"迅捷",effect:"两次攻击在本回合内连续结算"},
          {label:"压制",effect:"若第一次攻击命中，目标不能对第二次攻击进行防御"},
          {label:"灵活",effect:"你可以在第一次攻击结果出来后，再决定第二次攻击的目标"}
        ]}
      ],
      large:[
        {question:"你如何展开双重打击？",options:[
          {label:"连击",effect:"两次攻击的目标可以不同"},
          {label:"集中",effect:"两次攻击对同一目标时，第二次拼点骰 +2"},
          {label:"变招",effect:"第二次攻击改用你另一组攻击模式的拼点属性（两组模式相同时改为第二次拼点骰 +2）"}
        ]},
        {question:"多重攻击的节奏是？",options:[
          {label:"迅捷",effect:"两次攻击在本回合内连续结算"},
          {label:"压制",effect:"若第一次攻击命中，目标不能对第二次攻击进行防御"},
          {label:"灵活",effect:"你可以在第一次攻击结果出来后，再决定第二次攻击的目标"}
        ]},
        {question:"双重打击的极致是？",options:[
          {label:"无间断",effect:"若两次攻击均命中，目标本轮不能行动"},
          {label:"精益求精",effect:"你加入的那张额外攻击卡也获得本卡的一条特效"},
          {label:"【切换】绝对支配",effect:"切换到此攻击模式时，你本轮拼点骰 +2"}
        ]}
      ]
    }
  },
  envy:{
    attack:{
      small:[
        {question:"你羡慕什么？",options:[
          {label:"力量",effect:"若目标本次用于拼点的属性值高于你，本次伤害 +3"},
          {label:"运气",effect:"命中后你本轮当前速度 +2"},
          {label:"拥有",effect:"若目标的当前 HP 高于你，本次伤害 +3"}
        ]},
        {question:"你会怎么做？",options:[
          {label:"夺过来",effect:"目标本轮拼点骰 -1"},
          {label:"模仿",effect:"本次攻击改用你另一组攻击模式的拼点属性（两组模式相同时改为拼点骰 +1）"},
          {label:"毁掉",effect:"命中后你对同一目标立即造成 2 点额外伤害"}
        ]}
      ],
      large:[
        {question:"你羡慕什么？",options:[
          {label:"力量",effect:"若目标本次用于拼点的属性值高于你，本次伤害 +4"},
          {label:"运气",effect:"命中后你本轮当前速度 +3"},
          {label:"拥有",effect:"若目标的当前 HP 高于你，本次伤害 +4"}
        ]},
        {question:"你会怎么做？",options:[
          {label:"夺过来",effect:"目标本轮拼点骰 -2"},
          {label:"模仿",effect:"本次攻击改用你另一组攻击模式的拼点属性，且你的拼点骰 +1（两组模式相同时改为拼点骰 +2）"},
          {label:"毁掉",effect:"命中后你对同一目标立即造成 3 点额外伤害"}
        ]},
        {question:"不甘的尽头是？",options:[
          {label:"同归于尽",effect:"你和目标各受到 3 点伤害"},
          {label:"后来居上",effect:"若本次伤害使目标 HP 降至低于你，你恢复 3 HP"},
          {label:"【切换】不甘之眼",effect:"切换到此攻击模式时，你选择一名敌人，其本轮拼点骰 -1"}
        ]}
      ]
    },
    defense:{
      small:[
        {question:"你如何模仿他人的防御？",options:[
          {label:"借鉴",effect:"你的防御拼点骰 +1"},
          {label:"反射",effect:"若攻击者本轮使用了防御卡，你的防御拼点骰 +2"},
          {label:"超越",effect:"防御失败时你恢复 3 HP"}
        ]},
        {question:"防御后你得到了什么？",options:[
          {label:"经验",effect:"防御成功时你获得 2 点临时生命"},
          {label:"稳固",effect:"防御成功时你恢复 2 HP"},
          {label:"冷静",effect:"防御成功时你的罪孽压力 -1（最低为0）"}
        ]}
      ],
      large:[
        {question:"你如何模仿他人的防御？",options:[
          {label:"借鉴",effect:"你的防御拼点骰 +2"},
          {label:"反射",effect:"若攻击者本轮使用了防御卡，你的防御拼点骰 +3"},
          {label:"超越",effect:"防御失败时你恢复 5 HP"}
        ]},
        {question:"防御后你得到了什么？",options:[
          {label:"经验",effect:"防御成功时你获得 4 点临时生命"},
          {label:"稳固",effect:"防御成功时你恢复 3 HP"},
          {label:"冷静",effect:"防御成功时你的罪孽压力 -1（最低为0）"}
        ]},
        {question:"嫉妒之壁的尽头是？",options:[
          {label:"全盘模仿",effect:"防御成功时，你获得本次攻击者所用卡片的一条特效，本轮内有效"},
          {label:"后来居上",effect:"若你的 HP 低于攻击者，防御成功时你恢复 3 HP"},
          {label:"【切换】不甘之壁",effect:"切换到此攻击模式时，你获得 3 点临时生命"}
        ]}
      ]
    },
    support:{
      small:[
        {question:"你想影响什么？",options:[
          {label:"局势",effect:"一名友方本轮拼点骰 +2"},
          {label:"对比",effect:"一名敌人本轮拼点骰 -2"},
          {label:"侵蚀",effect:"一名敌人本轮当前速度 -2"}
        ]},
        {question:"你的手段是什么？",options:[
          {label:"竞争",effect:"一名友方本轮拼点骰 +1，一名敌人本轮拼点骰 -1"},
          {label:"窃取",effect:"一名敌人本轮拼点骰 -1，一名友方恢复 2 HP"},
          {label:"标记",effect:"你对一名敌人立即造成 1 点伤害"}
        ]}
      ],
      large:[
        {question:"你想影响什么？",options:[
          {label:"局势",effect:"一名友方本轮拼点骰 +3"},
          {label:"对比",effect:"一名敌人本轮拼点骰 -3"},
          {label:"侵蚀",effect:"一名敌人本轮当前速度 -3"}
        ]},
        {question:"你的手段是什么？",options:[
          {label:"竞争",effect:"一名友方本轮拼点骰 +2，一名敌人本轮拼点骰 -2"},
          {label:"窃取",effect:"一名敌人本轮拼点骰 -2，一名友方恢复 3 HP"},
          {label:"标记",effect:"你对一名敌人立即造成 2 点伤害"}
        ]},
        {question:"嫉妒的尽头是？",options:[
          {label:"公之于众",effect:"一名敌人本轮拼点骰 -2"},
          {label:"【切换】不甘之眼",effect:"切换到此攻击模式时，一名敌人本轮拼点骰 -1，一名友方本轮拼点骰 +1"},
          {label:"逆转",effect:"若场上任何敌人 HP 高于所有友方，你恢复 3 HP"}
        ]}
      ]
    }
  }
};

/* ============ E.G.O 系统数据（ZAYIN 档） ============ */
const EGO_TYPES = {
  assault:   {label:"侵袭", clash:true},
  blessing:  {label:"庇佑", clash:false},
  corruption:{label:"蚀变", clash:false}
};

const EGO_TYPE_BASE = {
  assault:    "拼点胜利 → 造成 8 + 差值 的伤害；你的拼点骰 +1",
  blessing:   "你与一名友方各恢复 4 HP，各获得 3 点临时生命",
  corruption: "本轮你的拼点骰 +2；所有敌人本轮拼点骰 -1"
};

/* 核心罪孽专属特效（免费附带，不占问答名额）。忧郁在庇佑型下文案被替换（庇佑型不产生伤害数字） */
const EGO_SIN_EFFECT = {
  wrath:   {label:"燃尽",effect:"所有敌人本轮受到的伤害 +1"},
  lust:    {label:"执心",effect:"本轮你每次恢复 HP 时，额外恢复 1 点"},
  sloth:   {label:"静止",effect:"所有敌人本轮当前速度 -1"},
  gluttony:{label:"吞食",effect:"本轮你造成伤害后，恢复其中 1/3（向下取整）"},
  gloom:   {label:"共苦",effect:"你受到 2 点伤害，本次 E.G.O 所有数值效果 +2",
            effectBlessing:"你本轮拼点骰 -2，本次 E.G.O 所有数值效果 +2"},
  pride:   {label:"君临",effect:"本轮本次目标不能打出防御卡"},
  envy:    {label:"夺冠",effect:"若场上有敌人当前 HP 高于你，本次 E.G.O 所有数值效果 +2"}
};
function getEgoSinEffect(){
  const sin = egoSin();
  if(!sin) return null;
  const base = EGO_SIN_EFFECT[sin];
  if(!base) return null;
  if(sin==="gloom" && state.ego.type==="blessing") return {label:base.label, effect:base.effectBlessing};
  return {label:base.label, effect:base.effect};
}

/* 三种类型各自的问答题库，结构与 SIN_TRAIT_QA 的问答数组一致 */
const EGO_TYPE_QA = {
  assault:[
    {question:"你的罪孽如何显形？",options:[
      {label:"撕裂",effect:"你的拼点骰额外 +2"},
      {label:"贯穿",effect:"目标本轮防御拼点骰 -3"},
      {label:"崩落",effect:"本次伤害 +3"}
    ]},
    {question:"代价由谁承担？",options:[
      {label:"自噬",effect:"你受到 3 点伤害，本次伤害 +5"},
      {label:"共担",effect:"一名友方受到 2 点伤害，你的拼点骰额外 +2"},
      {label:"独扛",effect:"本轮你不能打出防御卡与援护卡，本次伤害 +4"}
    ]},
    {question:"它的终点是？",options:[
      {label:"波及",effect:"与目标相邻的敌人各受到 5 点伤害"},
      {label:"余烬",effect:"命中后所有敌人本轮受到的伤害 +2"},
      {label:"反噬",effect:"若此次攻击未命中，你受到 6 点伤害；若命中，你恢复 5 HP"}
    ]},
    {question:"它退去之后留下什么？",options:[
      {label:"余烬未熄",effect:"本轮结束时，本次 E.G.O 命中过的敌人各受到 3 点伤害"},
      {label:"乘胜",effect:"若本次 E.G.O 击杀了目标，你恢复 6 HP 并获得 4 点临时生命"},
      {label:"平息",effect:"本轮结束时你恢复 4 HP，你的罪孽压力 -1（最低为0）"}
    ]}
  ],
  blessing:[
    {question:"它以什么形式庇护？",options:[
      {label:"覆盖",effect:"所有友方额外获得 3 点临时生命"},
      {label:"净化",effect:"所有友方本轮免疫拼点骰降低与当前速度降低效果"},
      {label:"唤起",effect:"所有友方本轮拼点骰额外 +1"}
    ]},
    {question:"庇护的代价是？",options:[
      {label:"燃身",effect:"你本轮拼点骰 -3，本卡所有恢复与临时生命数值 +3"},
      {label:"独醒",effect:"本轮你不能打出攻击卡，所有友方本轮受到的伤害 -2"},
      {label:"牵引",effect:"你本轮拼点骰 -2，所有友方本轮当前速度 +2"}
    ]},
    {question:"庇佑的尽头是？",options:[
      {label:"不灭",effect:"本轮内友方的 HP 不会降至 1 以下"},
      {label:"回响",effect:"本轮内友方每次拼点获胜，该友方恢复 2 HP"},
      {label:"同心",effect:"所有友方本轮拼点骰再 +1，你恢复 5 HP"}
    ]},
    {question:"庇护退去后留下什么？",options:[
      {label:"余温",effect:"本轮结束时，所有友方各恢复 3 HP"},
      {label:"移情",effect:"本轮内每有一名友方受到伤害，你恢复 2 HP"},
      {label:"慰藉",effect:"本轮结束时，你与一名友方的罪孽压力各 -1（最低为0）"}
    ]}
  ],
  corruption:[
    {question:"侵蚀从哪里开始？",options:[
      {label:"肢体",effect:"本轮你的攻击拼点骰额外 +2"},
      {label:"感官",effect:"本轮你的当前速度 +3、防御拼点骰 +2"},
      {label:"气场",effect:"所有敌人本轮当前速度额外 -2"}
    ]},
    {question:"它向外散播什么？",options:[
      {label:"恐惧",effect:"所有敌人本轮防御拼点骰 -2"},
      {label:"衰弱",effect:"所有敌人本轮受到的伤害 +2"},
      {label:"停滞",effect:"所有敌人本轮不能恢复 HP、不能获得临时生命"}
    ]},
    {question:"蚀变的尽头是？",options:[
      {label:"异形",effect:"本轮你每次拼点获胜，恢复 3 HP"},
      {label:"支配",effect:"本轮你可以额外打出一张罪孽卡（不占用行动槽）"},
      {label:"崩坏",effect:"本轮结束时你受到 5 点伤害，但本轮内你所有拼点骰再 +2"}
    ]},
    {question:"蚀变退去后留下什么？",options:[
      {label:"残秽",effect:"本轮结束时，所有敌人各受到 3 点伤害"},
      {label:"不可逆",effect:"本次 E.G.O 的所有效果延续到下一轮，下一轮结束时你受到 6 点伤害"},
      {label:"蜕壳",effect:"本轮结束时你恢复 4 HP，你的罪孽压力 -1（最低为0）"}
    ]}
  ]
};
function getEgoQA(){ return EGO_TYPE_QA[state.ego.type]||[]; }

/* E.G.O 校验：核心罪孽存在 + 已选类型 + 名称已填 + 问答已按当前特效数量答完 */
function validateEgoProfile(){
  if(!egoSin()) return false;
  if(!state.ego.type) return false;
  if(state.ego.name.trim()==="") return false;
  const ec = egoEffectCount();
  const qa = getEgoQA();
  if(state.ego.answers.length<ec) return false;
  for(let i=0;i<ec;i++){
    if(state.ego.answers[i]==null || !qa[i]) return false;
  }
  return true;
}

/* E.G.O 拼点信息：不属于任何卡组，使用哪个攻击模式属性取决于临场状态，因此不指定具体 gid */
function getEgoClashInfo(){
  // 逐组标明，避免读成「两个属性任选其一」
  const per = ["A","B"].map((g,i)=>{
    const k = state.attackModes[i];
    return k ? `${g}组 ${ATTACK_MODES[k].attr}(${ATTACK_MODES[k].label})` : `${g}组 未选择模式`;
  }).join("，");
  return {
    formula:`拼点值 = 1D6 + 发动时所处卡组的拼点属性 + 拼点修正（${per}）`,
    dmg:`伤害 = 基础伤害 + (我方拼点值 - 对方拼点值)`,
    noDefDmg:`无防御卡：攻击自动命中，防御方拼点值 = 体魄；伤害 = 基础伤害 + (我方拼点值 - 防御方拼点值)，差值最低为0`
  };
}

/* 汇总 E.G.O 的完整可读数据，供总览页/JSON导出/图片导出统一复用 */
function buildEgoExport(){
  const sin = egoSin();
  const type = state.ego.type;
  const ec = egoEffectCount();
  const qa = getEgoQA();
  const qaResolved = [];
  for(let i=0;i<ec;i++){
    const ai = state.ego.answers[i];
    if(ai!=null && qa[i]?.options?.[ai]){
      qaResolved.push({question:qa[i].question, label:qa[i].options[ai].label, effect:qa[i].options[ai].effect});
    }
  }
  return {
    name: state.ego.name,
    sin, sinLabel: sin?SIN_LABELS[sin]:null,
    grade: EGO_GRADE,
    type, typeLabel: type?EGO_TYPES[type].label:null,
    effectCount: ec,
    shardCap: egoShardCap(),
    shardCost: egoShardCost(),
    corrosionDC: egoCorrosionDC(),
    baseEffect: type?EGO_TYPE_BASE[type]:null,
    sinEffect: getEgoSinEffect(),
    qa: qaResolved,
    description: state.ego.description
  };
}

function defaultSinProfile(){
  return {
    values:{wrath:0,lust:0,sloth:0,gluttony:0,gloom:0,pride:0,envy:0},
    coreSin:null, rejectedSins:[], sinPressure:0
  };
}

function defaultEgoProfile(){
  return { name:"", type:null, answers:[], description:"" };
}

const state = {
  name:"",
  gender:"",
  attrs:{力量:1,灵巧:1,体魄:1,认知:1,意志:1,共感:1},
  sins: defaultSinProfile(),
  ego: defaultEgoProfile(),
  attackModes:["",""],
  cardGroups:{a:{},b:{}},
};

// 罪孽模块的子步骤（0..3）
let sinSub = 0;
const SIN_SUBSTEPS = ["认识罪孽","分配点数","核心与排斥","罪孽档案"];

// 罪孽卡片模块的子步骤（0..5）
let cardSub = 0;
const CARD_SUBSTEPS = ["卡片总览","A组特性","A组问答","B组特性","B组问答","卡片预览"];
let cardGroupIdx = 0; // 特性/问答中当前罪孽索引

const STEPS = ["前置信息","基础属性","衍生数值","罪孽倾向","E.G.O","攻击模式","罪孽卡片","总览与导出"];
let current = 0;

/* ============ 派生计算 ============ */
const sumAttrs = () => Object.values(state.attrs).reduce((a,b)=>a+b,0);
const spentPoints = () => sumAttrs() - ATTR_DEFS.length; // 已用的额外点数
const maxHP = () => 12 + state.attrs.体魄*4;
const panic1 = () => Math.floor(maxHP()*0.5);
const panic2 = () => Math.floor(maxHP()*0.25);
const speedInfo = () => SPEED_TABLE[state.attrs.灵巧];   // 斩击模式的速度骰

/* 某攻击模式下的速度与接线方式。速度绑定攻击模式而非单一属性，
   所以同一角色切换卡组时接线方式也会跟着换。 */
function modeSpeedInfo(modeKey){
  const m = ATTACK_MODES[modeKey];
  if(!m) return null;
  const v = state.attrs[m.attr];
  if(m.speed==="roll"){
    const sp = SPEED_TABLE[v];
    return {kind:"roll", speedText:`${sp.range}（${sp.dice}）`,
      rule:`投骰决定速度，速度 ≥ 敌方速度时可接线`};
  }
  if(m.speed==="fixed"){
    return {kind:"fixed", speedText:`${v}（固定，不投骰）`,
      rule:`速度恒等于${m.attr}(${v})，≥ 敌方速度时可接线`};
  }
  const pen = STRIKE_CLASH_PENALTY[v];
  return {kind:"ignore", speedText:"无视速度", penalty:pen,
    rule:`无条件接线，防御拼点 ${pen}（由力量${v}决定）`};
}
/* 卡组标题用的模式说明：拼点属性 + 接线方式，一处生成供各页面复用 */
function groupModeDesc(gid){
  const modeKey = state.attackModes[gid==="a"?0:1];
  if(!modeKey) return "未选择攻击模式";
  const m = ATTACK_MODES[modeKey], si = modeSpeedInfo(modeKey);
  return `${m.label}模式 · 拼点属性 ${m.attr} · 速度 ${si.speedText} · ${si.rule}`;
}

/* 固定值（所有初始角色统一） */
const ACTION_SLOTS = 1;        // 行动槽固定为 1

/* 罪孽压力承载上限 = 意志 + 2（初始压力恒为 0，战斗中累积） */
const sinPressureCap = () => state.attrs.意志 + 2;

/* ============ E.G.O：派生计算（全部由既有数据推导，不单独存储） ============ */
const EGO_GRADE = "ZAYIN"; // 车卡阶段固定档位，TETH/HE 属于成长解锁
const egoSin = () => state.sins.coreSin;                 // 罪孽属性 = 核心罪孽
/* 特效数量 = 共感，每点一条；上限由题库题数决定（三种类型各 4 题） */
const EGO_MAX_EFFECTS = 4;
const egoEffectCount = () => Math.min(state.attrs.共感, EGO_MAX_EFFECTS);
const egoShardCap = () => state.attrs.意志 + 2;
const egoShardCost = () => 1;
const egoCorrosionDC = () => 4 + egoEffectCount();

/* 共感变化后，截断超出新特效数量的已选问答（不静默丢弃——记录供 UI 提示） */
let egoTruncatedNotice = false;
function reconcileEgoProfile(){
  const ec = egoEffectCount();
  if(state.ego.answers.length > ec){
    state.ego.answers.length = ec;
    egoTruncatedNotice = true;
  }
}

/* ============ 罪孽：纯逻辑（可独立测试） ============ */
const sumSins = (values) => SIN_ORDER.reduce((a,k)=>a+(values[k]||0),0);
function getMaxedSins(values){ return SIN_ORDER.filter(k=>values[k]===SIN_MAX); }
function getZeroSins(values){ return SIN_ORDER.filter(k=>values[k]===0); }

/* 点数分配校验：有且仅有一项主导（3点） */
function validateSinAllocation(values){
  const errors=[];
  const total=sumSins(values);
  const remaining=SIN_POINTS-total;
  const maxedSinCount=getMaxedSins(values).length;
  const zeroSinCount=getZeroSins(values).length;

  const allInt = SIN_ORDER.every(k=>Number.isInteger(values[k]) && values[k]>=0 && values[k]<=SIN_MAX);
  if(!allInt) errors.push("罪孽数值必须为 0 至 3 之间的整数。");
  if(remaining>0) errors.push(`还剩 ${remaining} 点罪孽点数未分配。`);
  if(remaining<0) errors.push(`罪孽点数超过上限 ${-remaining} 点。`);
  if(maxedSinCount<1) errors.push("必须有且仅有一项罪孽达到 3（主要罪孽）。");
  if(maxedSinCount>1) errors.push("只能有一项罪孽达到 3（主要罪孽）。");
  if(zeroSinCount<1) errors.push("至少需要保留一项数值为 0 的罪孽。");

  return {isValid:errors.length===0, errors, total, remaining, maxedSinCount, zeroSinCount};
}

/* 整体完成校验 */
function validateSinProfile(profile){
  const errors=[];
  const alloc=validateSinAllocation(profile.values);
  if(!alloc.isValid) errors.push(...alloc.errors);
  if(!profile.coreSin) errors.push("核心罪孽未派生。");
  else if(profile.values[profile.coreSin]!==SIN_MAX) errors.push("核心罪孽的数值必须为 3。");
  const zeros=getZeroSins(profile.values);
  const rej=profile.rejectedSins||[];
  if(rej.length!==zeros.length || !zeros.every(k=>rej.includes(k)))
    errors.push("排斥罪孽必须为全部数值为 0 的罪孽。");
  if(profile.sinPressure!==0) errors.push("初始罪孽压力必须为 0。");
  return {isValid:errors.length===0, errors};
}

/* 修改点数后同步核心/排斥罪孽（均自动派生，不需玩家选择） */
function reconcileSinProfile(){
  const p=state.sins;
  const v=p.values;
  // 核心罪孽 = 唯一为 3 的项；否则清空
  const maxed=getMaxedSins(v);
  p.coreSin = (maxed.length===1) ? maxed[0] : null;
  // 排斥罪孽 = 所有为 0 的项（自动）
  p.rejectedSins = getZeroSins(v);
}

/* ============ 罪孽卡片系统：辅助函数 ============ */

/* 获取罪孽可用特性列表（含条件特性） */
function getAvailableTraits(sinKey){
  const val=state.sins.values[sinKey];
  const base=SIN_TRAIT_OPTIONS[sinKey]||[];
  const cond=SIN_CONDITIONAL_TRAITS[sinKey]||{};
  const extra=Object.keys(cond).filter(t=>val>=cond[t]);
  return [...base,...extra];
}

/* 获取某罪孽的卡片等级 key */
function sinCardLevel(sinKey){
  const v=state.sins.values[sinKey];
  if(v===0) return "none";
  if(v===1) return "basic";
  if(v===2) return "small";
  return "large";
}

/* 获取罪孽问答数据 */
function getSinQA(sinKey,trait,level){
  return SIN_TRAIT_QA[sinKey]?.[trait]?.[level]||[];
}

/* 规则更新后被移除的特性，读档时清空并在启动时提示（不静默丢弃） */
let removedTraitNotices = [];

/* 罪孽值变化后同步卡片组 */
function reconcileCardGroups(){
  removedTraitNotices = [];
  for(const gid of ["a","b"]){
    const g=state.cardGroups[gid];
    for(const k of SIN_ORDER){
      const val=state.sins.values[k];
      if(val===0){
        delete g[k];
      } else if(!g[k]){
        g[k]={trait:null,answers:[]};
      } else {
        // 特性已从该罪孽的可选表中移除（如怠惰的「防御」被反击替代）→ 清空并记录
        if(g[k].trait && !getAvailableTraits(k).includes(g[k].trait)){
          removedTraitNotices.push(`${gid==="a"?"A组":"B组"} · ${SIN_LABELS[k]}·${TRAIT_LABELS[g[k].trait]||g[k].trait}`);
          g[k].trait=null;
          g[k].answers=[];
        }
        // 条件特性降级：罪孽值降至1时，已选的 special/multiAttack 无效
        const cond=SIN_CONDITIONAL_TRAITS[k]||{};
        if(g[k].trait && cond[g[k].trait] && val<cond[g[k].trait]){
          g[k].trait=null;
          g[k].answers=[];
        }
        // 问答数不匹配时截断
        const expected=g[k].trait? getSinQA(k,g[k].trait,val>=3?"large":val>=2?"small":"basic").length : 0;
        if(g[k].answers.length>expected) g[k].answers.length=expected;
      }
    }
  }
}

/* 校验单个卡片组是否完成 */
function validateCardGroup(gid){
  const errors=[];
  const g=state.cardGroups[gid];
  for(const k of SIN_ORDER){
    const val=state.sins.values[k];
    if(val===0) continue;
    if(!g[k]||!g[k].trait) errors.push(`${SIN_LABELS[k]}尚未选择特性。`);
    else {
      const expected=getSinQA(k,g[k].trait,val>=3?"large":val>=2?"small":"basic").length;
      if(g[k].answers.length<expected || g[k].answers.some(a=>a===null||a===undefined)){
        errors.push(`${SIN_LABELS[k]}·${TRAIT_LABELS[g[k].trait]}的技能问答尚未完成。`);
      }
    }
  }
  return {isValid:errors.length===0,errors};
}

/* 构建卡片组导出数据 */
/* 获取特性的拼点信息 */
function getClashInfo(trait, gid){
  const modeKey=state.attackModes[gid==="a"?0:1];
  const modeAttr=modeKey?ATTACK_MODES[modeKey].attr:"—";
  const modeLabel=modeKey?ATTACK_MODES[modeKey].label:"—";
  if(trait==="attack"){
    return {clash:true, formula:`拼点值 = 1D6 + ${modeAttr}(${modeLabel}) + 拼点修正`,
      dmg:`伤害 = 基础伤害 + (我方拼点值 - 对方拼点值)`,
      noDefDmg:`无防御卡：攻击自动命中，防御方拼点值 = 体魄（不投骰）；伤害 = 基础伤害 + (我方拼点值 - 防御方拼点值)，差值最低为0`};
  }
  if(trait==="multiAttack"){
    return {clash:true, formula:`拼点值 = 1D6 + ${modeAttr}(${modeLabel}) + 拼点修正（两次分别结算）`,
      dmg:`伤害 = 基础伤害 + (我方拼点值 - 对方拼点值)`,
      noDefDmg:`无防御卡：攻击自动命中，防御方拼点值 = 体魄（不投骰）；伤害 = 基础伤害 + (我方拼点值 - 防御方拼点值)，差值最低为0`};
  }
  // 防御/援护/反击统一用体魄；打击模式的接线减值在此体现
  if(trait==="defense"||trait==="shield"||trait==="counter"){
    const si=modeSpeedInfo(modeKey);
    const pen=(si&&si.kind==="ignore")?` ${si.penalty}（${modeLabel}无视速度接线的代价）`:"";
    return {clash:true, formula:`拼点值 = 1D6 + 体魄 + 拼点修正${pen}`,
      dmg:null, noDefDmg:null};
  }
  return {clash:false, formula:null, dmg:null, noDefDmg:null};
}

function buildCardGroupExport(gid){
  const g=state.cardGroups[gid];
  const result={};
  for(const k of SIN_ORDER){
    const val=state.sins.values[k];
    if(val===0) continue;
    const entry=g[k]||{};
    const level=val>=3?"large":val>=2?"small":"basic";
    const effects=[];
    if(entry.trait){
      if(level==="basic"){
        effects.push(CARD_BASE_EFFECT[entry.trait]||"");
      } else {
        effects.push(CARD_SKILL_BASE[entry.trait]?.[level]||"");
        const qa=getSinQA(k,entry.trait,level);
        (entry.answers||[]).forEach((a,i)=>{
          if(a!=null && qa[i]?.options?.[a]) effects.push(`${qa[i].options[a].label}——${qa[i].options[a].effect}`);
        });
      }
    }
    result[k]={
      level, trait:entry.trait||null, effects,
      clash: entry.trait? getClashInfo(entry.trait, gid) : null
    };
  }
  return result;
}

/* 属性规则校验，返回 {ok, errors:[...]} */
function validateAttrs(){
  const errors=[];
  const vals=Object.values(state.attrs);
  const count4 = vals.filter(v=>v===4).length;
  const has5 = vals.some(v=>v>=5);
  const has1 = vals.some(v=>v===1);
  const total = sumAttrs();
  const spent = spentPoints();

  if(has5) errors.push("初始角色不能拥有 5 点属性。");
  if(count4>2) errors.push(`最多只能有两项属性达到 4（当前 ${count4} 项）。`);
  if(!has1) errors.push("至少需要保留一项属性为 1。");
  if(spent<BASE_POINTS) errors.push(`还需分配 ${BASE_POINTS-spent} 点（额外点数共 ${BASE_POINTS} 点）。`);
  if(spent>BASE_POINTS) errors.push(`超出分配 ${spent-BASE_POINTS} 点。`);
  if(total!==TOTAL_TARGET) errors.push(`六项总和必须为 ${TOTAL_TARGET}（当前 ${total}）。`);
  return {ok:errors.length===0, errors};
}

/* 每一步是否可离开（进入下一步） */
function canLeave(step){
  if(step===0) return state.name.trim()!=="" && state.gender!=="";
  if(step===1) return validateAttrs().ok;
  if(step===3) return validateSinProfile(state.sins).isValid;
  if(step===4) return validateEgoProfile();
  if(step===5) return state.attackModes[0]!=="" && state.attackModes[1]!=="";
  if(step===6) return validateCardGroup("a").isValid && validateCardGroup("b").isValid;
  return true;
}

/* 罪孽子步骤是否可离开（推进到下一子步骤） */
function canLeaveSinSub(sub){
  const p=state.sins;
  if(sub===0) return true;                                  // 认识罪孽
  if(sub===1) return validateSinAllocation(p.values).isValid; // 分配点数
  if(sub===2) return !!p.coreSin && p.values[p.coreSin]===SIN_MAX; // 核心与排斥（自动派生）
  return true; // 档案预览
}

/* 罪孽卡片子步骤是否可离开 */
function canLeaveCardSub(sub){
  if(sub===0) return true;                                   // 卡片总览
  if(sub===1) return validateCardGroupTraits("a");           // A组特性
  if(sub===2) return validateCardGroupQA("a");               // A组问答
  if(sub===3) return validateCardGroupTraits("b");           // B组特性
  if(sub===4) return validateCardGroupQA("b");               // B组问答
  return true; // 卡片预览
}
function validateCardGroupTraits(gid){
  const g=state.cardGroups[gid];
  for(const k of SIN_ORDER){
    if(state.sins.values[k]===0) continue;
    if(!g[k]||!g[k].trait) return false;
  }
  return true;
}
function validateCardGroupQA(gid){
  const g=state.cardGroups[gid];
  for(const k of SIN_ORDER){
    const val=state.sins.values[k];
    if(val===0) continue;
    if(!g[k]||!g[k].trait) return false;
    const level=val>=3?"large":val>=2?"small":"basic";
    const expected=getSinQA(k,g[k].trait,level).length;
    if(g[k].answers.length<expected || g[k].answers.some(a=>a===null||a===undefined)) return false;
  }
  return true;
}

/* ============ 渲染 ============ */
const stageCard = document.getElementById("stageCard");
const stepChips = document.getElementById("stepChips");
const sideSummary = document.getElementById("sideSummary");
const btnBack = document.getElementById("btnBack");
const btnNext = document.getElementById("btnNext");

function renderChips(){
  stepChips.innerHTML="";
  STEPS.forEach((s,i)=>{
    const c=document.createElement("div");
    c.className="chip";
    c.textContent=`${i+1}. ${s}`;
    if(i===current) c.classList.add("active");
    else if(i<current) c.classList.add("done");
    // 只能跳到已完成或当前步；未解锁的步骤锁定
    const reachable = i<=current || (i===current+1 && canLeave(current));
    if(!reachable && i>current) c.classList.add("locked");
    c.onclick=()=>{
      if(i<=current){ if(i===3) sinSub=Math.min(sinSub,SIN_SUBSTEPS.length-1); if(i===6) cardSub=Math.min(cardSub,CARD_SUBSTEPS.length-1); current=i; render(); }
      else if(i===current+1 && canLeave(current)){ current=i; if(i===3) sinSub=0; if(i===6) cardSub=0; render(); }
    };
    stepChips.appendChild(c);
  });
}

function render(){
  renderChips();
  if(current===0) renderStep0();
  else if(current===1) renderStep1();
  else if(current===2) renderStep2();
  else if(current===3) renderSinStep();
  else if(current===4) renderEgoStep();
  else if(current===5) renderAttackMode();
  else if(current===6) renderCardStep();
  else renderStep3();
  renderNav();
  renderSummary();
  saveState();
}

function renderNav(){
  // 仅在最开始（第 0 步）隐藏返回按钮
  btnBack.style.visibility = (current===0) ? "hidden" : "visible";

  if(current===STEPS.length-1){
    btnNext.style.display="none";
    return;
  }
  btnNext.style.display="";

  if(current===3){
    // 罪孽模块内部子步骤推进
    const last=sinSub===SIN_SUBSTEPS.length-1;
    btnNext.disabled=!canLeaveSinSub(sinSub);
    btnNext.textContent = last ? "确认罪孽档案 →" : "下一步 →";
  }else if(current===6){
    // 罪孽卡片模块内部子步骤推进
    const last=cardSub===CARD_SUBSTEPS.length-1;
    btnNext.disabled=!canLeaveCardSub(cardSub);
    btnNext.textContent = last ? "确认卡片配置 →" : "下一步 →";
  }else{
    btnNext.disabled=!canLeave(current);
    btnNext.textContent = "下一步 →";
  }
}

/* -------- 步骤 0：前置信息 -------- */
function renderStep0(){
  stageCard.innerHTML=`
    <h2>前置信息</h2>
    <p class="lead">先确定你的角色基本身份。</p>
    <label class="field">
      <span class="lab">角色名字</span>
      <input type="text" id="fName" placeholder="输入角色名字" value="${escapeHtml(state.name)}">
    </label>
    <label class="field">
      <span class="lab">性别</span>
      <div class="gender-row" id="genderRow">
        ${["男","女"].map(g=>`<div class="opt ${state.gender===g?'sel':''}" data-g="${g}">${g}</div>`).join("")}
      </div>
    </label>
  `;
  const fName=document.getElementById("fName");
  fName.oninput=e=>{state.name=e.target.value; renderNav(); renderSummary(); renderChips();};
  document.getElementById("genderRow").querySelectorAll(".opt").forEach(o=>{
    o.onclick=()=>{
      state.gender=o.dataset.g;
      renderStep0(); renderNav(); renderSummary(); renderChips();
    };
  });
}

/* -------- 步骤 1：属性分配 -------- */
function renderStep1(){
  const v=validateAttrs();
  const spent=spentPoints();
  const remain=BASE_POINTS-spent;
  const count4=Object.values(state.attrs).filter(x=>x===4).length;

  stageCard.innerHTML=`
    <h2>第一部分 · 基础属性分配</h2>
    <p class="lead">六项属性数值范围 1—5。所有属性初始为 1，你额外拥有 8 点自由分配。</p>
    <div class="attr-help">
      <b>分配规则：</b> 初始单项最高 4 · 最多两项达到 4 · 至少保留一项为 1 · 六项总和固定为 <b>14</b>。
      <br>*初始角色不能拥有 5 点（5 点只能通过成长、义体改造或特殊剧情获得）。
      <br><b>等级含义：</b> 1 明显不擅长 · 2 普通成年人 · 3 接受过专业训练 · 4 行业优秀人物 · 5 都市非正常水平
    </div>
    <div class="pool">
      <span class="badge ${remain<0?'bad':''}">剩余点数 <b>${remain}</b> / ${BASE_POINTS}</span>
      <span class="badge">总和 <b>${sumAttrs()}</b> / ${TOTAL_TARGET}</span>
      <span class="badge ${count4>2?'bad':''}">4 点项 <b>${count4}</b> / 2</span>
    </div>
    <div class="attr-list" id="attrList"></div>
    <div class="warns" id="warns"></div>
  `;
  const list=document.getElementById("attrList");
  ATTR_DEFS.forEach(def=>{
    const val=state.attrs[def.key];
    const row=document.createElement("div");
    row.className="attr";
    // dots 1..5
    let dots="";
    for(let i=1;i<=5;i++){
      const on=i<=val?"on":"";
      // 点击 dot i 会把值设为 i；但需在校验范围内（1..4，且不破坏其他硬性上限由 setAttr 处理）
      const locked = i===5 ? "locked" : "";
      dots+=`<div class="dot ${on} ${locked}" data-k="${def.key}" data-i="${i}" title="${LEVEL_MEANING[i]}">${i}</div>`;
    }
    row.innerHTML=`
      <div class="name">${def.key}<small>${def.use}</small></div>
      <div class="dots">${dots}</div>
      <div class="stepper">
        <button data-k="${def.key}" data-d="-1" ${val<=1?'disabled':''}>−</button>
        <span class="val">${val}</span>
        <button data-k="${def.key}" data-d="1" ${val>=4?'disabled':''}>+</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll(".dot").forEach(d=>{
    d.onclick=()=>{
      if(d.classList.contains("locked")) return;
      setAttr(d.dataset.k, parseInt(d.dataset.i,10));
    };
  });
  list.querySelectorAll(".stepper button").forEach(b=>{
    b.onclick=()=>{
      if(b.disabled) return;
      const cur=state.attrs[b.dataset.k];
      setAttr(b.dataset.k, cur+parseInt(b.dataset.d,10));
    };
  });
  renderWarns(v);
}

function setAttr(key,newVal){
  newVal=Math.max(1,Math.min(4,newVal)); // 初始硬性上限 4，下限 1
  state.attrs[key]=newVal;
  reconcileEgoProfile();
  renderStep1(); renderNav(); renderSummary(); renderChips();
}

function renderWarns(v){
  const box=document.getElementById("warns");
  box.innerHTML="";
  if(v.ok){
    box.innerHTML=`<div class="warn ok">✔ 属性分配合法，可以进入下一步。</div>`;
  }else{
    v.errors.forEach(e=>{
      const d=document.createElement("div");
      d.className="warn";
      d.innerHTML=`✕ <span>${e}</span>`;
      box.appendChild(d);
    });
  }
}

/* -------- 步骤 2：衍生数值 -------- */
function renderStep2(){
  // 速度绑定攻击模式，所以这里列出三种模式各自的接线方式供玩家在第 5 步前参考
  const modeRows=Object.keys(ATTACK_MODES).map(k=>{
    const m=ATTACK_MODES[k], si=modeSpeedInfo(k);
    return `<tr><td>${m.label}（${m.attr} ${state.attrs[m.attr]}）</td><td>${si.speedText}</td><td>${si.rule}</td></tr>`;
  }).join("");
  stageCard.innerHTML=`
    <h2>第一部分 · 衍生数值</h2>
    <p class="lead">以下数值由你的基础属性自动计算得出，确认无误后进入总览。</p>
    <div class="grid2">
      <div class="stat">
        <div class="k">最大生命值</div>
        <div class="v">${maxHP()}</div>
        <div class="note">= 12 ＋ 体魄(${state.attrs.体魄}) × 4</div>
      </div>
      <div class="stat">
        <div class="k">混乱线</div>
        <div class="v">${panic1()} / ${panic2()}</div>
        <div class="note">第一混乱线 50%（${panic1()}）· 第二混乱线 25%（${panic2()}），向下取整</div>
      </div>
      <div class="stat">
        <div class="k">行动槽</div>
        <div class="v">${ACTION_SLOTS}</div>
        <div class="note">所有初始角色固定拥有 1 个行动槽</div>
      </div>
      <div class="stat">
        <div class="k">防御拼点</div>
        <div class="v">1D6 ＋ ${state.attrs.体魄}</div>
        <div class="note">防御与援护统一使用体魄(${state.attrs.体魄})；接不到线时防御方拼点值 ＝ 体魄，不投骰</div>
      </div>
      <div class="stat">
        <div class="k">罪孽压力上限</div>
        <div class="v">${sinPressureCap()}</div>
        <div class="note">＝ 意志(${state.attrs.意志}) ＋ 2；初始压力恒为 0，战斗中累积</div>
      </div>
      <div class="stat">
        <div class="k">E.G.O 特效数量</div>
        <div class="v">${egoEffectCount()}</div>
        <div class="note">＝ 共感(${state.attrs.共感})，每点共感一条特效（上限 ${EGO_MAX_EFFECTS}）</div>
      </div>
      <div class="stat" style="grid-column:1/-1">
        <div class="k">速度 / 接线</div>
        <div class="note" style="margin:6px 0 0">接线（拦下敌人的攻击）由你所处的<b>攻击模式</b>决定，而不是某一条属性。三种模式各有一条进入拼点的路径：</div>
        <table class="sh auto" style="margin-top:10px">
          <tr><td style="color:var(--muted)">模式</td><td style="color:var(--muted)">速度</td><td style="color:var(--muted)">接线方式</td></tr>
          ${modeRows}
        </table>
        <div class="note" style="margin-top:8px">在第 5 步为两组卡片各选一种模式；切换卡组时接线方式随之改变。</div>
      </div>
    </div>
    <div class="attr-help" style="margin-top:18px">
      <b>混乱线：</b> 混乱线是随当前 HP 实时判定的状态，而非一次性触发的效果。
      <br>· 当前 HP ≤ 第一混乱线 → 所有拼点骰 -1
      <br>· 当前 HP ≤ 第二混乱线 → 所有拼点骰 -2（不与上一条叠加）
      <br>· HP 被治疗回到线上时，惩罚立即解除
      <br>· 恐慌判定：首次跌破第二混乱线时，进行 1D6＋意志 ≥ 7 的判定，失败则本回合由 GM 接管；每场战斗只判定一次
      <br><b>意志的作用：</b> 碎片承载上限、罪孽压力上限（均为 意志＋2）、恐慌判定、E.G.O 侵蚀判定、创伤稳定性。
      <br><b>共感的作用：</b> E.G.O 特效数量（每点一条）、援护与支援类判定。
      <br>本游戏只有一种伤害，所有伤害都先扣临时生命、再扣 HP，不存在无视临时生命的伤害类型，也不存在任何减伤检定。
      <br><b>接线：</b> 敌我同时投掷速度，敌方先公布速度并选定目标，我方再决定是否接线。
      <br>· 接不到线时不能打出防御卡与援护卡，但仍可打出增益/减益卡，或单方面攻击敌人
      <br>· <b>进攻不受速度限制</b>——高速敌人只是无法被接线，你依然可以攻击到他
    </div>
  `;
}

/* ================= 步骤 3：罪孽倾向 ================= */
let sinReaderIdx = 0; // 认识罪孽的当前卡片

function renderSinStep(){
  const sub=sinSub;
  const subChips=SIN_SUBSTEPS.map((s,i)=>{
    const cls=i===sub?"active":(i<sub?"done":"");
    return `<span class="subchip ${cls}" data-sub="${i}">${i+1}. ${s}</span>`;
  }).join("");
  stageCard.innerHTML=`
    <h2>第二部分 · 罪孽倾向</h2>
    <div class="subchips">${subChips}</div>
    <div id="sinBody"></div>
  `;
  // 子步骤导航（只能回到已完成或当前）
  stageCard.querySelectorAll(".subchip").forEach(el=>{
    el.onclick=()=>{
      const t=parseInt(el.dataset.sub,10);
      if(t<=sinSub || (t===sinSub+1 && canLeaveSinSub(sinSub))){ sinSub=t; render(); }
      else toast("请先完成当前步骤");
    };
  });
  const body=document.getElementById("sinBody");
  if(sub===0) renderSinRead(body);
  else if(sub===1) renderSinAllocate(body);
  else if(sub===2) renderSinCoreReject(body);
  else renderSinProfilePreview(body);
}

/* --- 子步骤1：认识罪孽 --- */
function renderSinRead(body){
  const total=SIN_ORDER.length;
  if(sinReaderIdx<0) sinReaderIdx=0;
  if(sinReaderIdx>total-1) sinReaderIdx=total-1;
  const key=SIN_ORDER[sinReaderIdx];
  const def=SIN_DEFINITIONS[key];
  body.innerHTML=`
    <p class="lead">先了解七种罪孽的倾向。逐张阅读，再开始分配点数。</p>
    <div class="sin-card big sin-${key}">
      <div class="sin-head">
        <span class="sin-sym">${sinIcon(key)}</span>
        <span class="sin-name">${SIN_LABELS[key]}</span>
        <span class="sin-count">${sinReaderIdx+1} / ${total}</span>
      </div>
      <div class="sin-keys">${def.keywords.map(k=>`<span class="tag">${k}</span>`).join("")}</div>
      <p class="sin-summary">${def.summary}</p>
      <blockquote class="sin-quote">“${def.quote}”</blockquote>
    </div>
    <div class="reader-nav">
      <button class="btn ghost" id="sinPrev" ${sinReaderIdx===0?'disabled':''} aria-label="上一张罪孽卡">← 上一张</button>
      <div class="dots-row" id="sinDots" role="tablist" aria-label="罪孽卡片"></div>
      ${sinReaderIdx<total-1
        ? `<button class="btn" id="sinNextCard" aria-label="下一张罪孽卡">下一张 →</button>`
        : `<button class="btn primary" id="sinStartAlloc">开始分配罪孽 →</button>`}
    </div>
  `;
  const dots=body.querySelector("#sinDots");
  SIN_ORDER.forEach((k,i)=>{
    const d=document.createElement("button");
    d.className="rdot rdot-icon"+(i===sinReaderIdx?" on":"");
    d.innerHTML=sinIcon(k);
    d.title=SIN_LABELS[k];
    d.setAttribute("aria-label",SIN_LABELS[k]);
    d.onclick=()=>{ sinReaderIdx=i; renderSinRead(body); };
    dots.appendChild(d);
  });
  const prev=body.querySelector("#sinPrev");
  if(prev) prev.onclick=()=>{ sinReaderIdx--; renderSinRead(body); };
  const nc=body.querySelector("#sinNextCard");
  if(nc) nc.onclick=()=>{ sinReaderIdx++; renderSinRead(body); };
  const sa=body.querySelector("#sinStartAlloc");
  if(sa) sa.onclick=()=>{ sinSub=1; render(); };
}

/* --- 子步骤2：分配点数 --- */
function renderSinAllocate(body){
  const v=state.sins.values;
  const res=validateSinAllocation(v);
  const maxed=getMaxedSins(v);
  body.innerHTML=`
    <p class="lead">你拥有 <b>8</b> 点罪孽点数。用加减按钮分配到七项罪孽。只能有一项达到 3（主要罪孽）。</p>
    <div class="pool">
      <span class="badge">已使用 <b>${res.total}</b> / ${SIN_POINTS}</span>
      <span class="badge ${res.remaining<0?'bad':''}">剩余点数 <b>${res.remaining}</b></span>
      <span class="badge ${res.maxedSinCount>1?'bad':''}">主导(3) <b>${res.maxedSinCount}</b> / 1</span>
    </div>
    <div class="sin-grid" id="sinGrid"></div>
    <div class="warns" id="sinWarns"></div>
  `;
  const grid=body.querySelector("#sinGrid");
  SIN_ORDER.forEach(key=>{
    const val=v[key];
    const lvl=SIN_LEVEL_NAMES[val];
    // 已有一项为 3 时，其他项最高只能到 2
    const otherMaxed=maxed.length>=1 && !maxed.includes(key);
    const incDisabled = val>=SIN_MAX || res.remaining<=0 || (otherMaxed && val>=2);
    const card=document.createElement("div");
    card.className=`sin-card mini sin-${key}`;
    card.innerHTML=`
      <div class="sin-head">
        <span class="sin-sym">${sinIcon(key)}</span>
        <span class="sin-name">${SIN_LABELS[key]}</span>
      </div>
      <div class="sin-level"><b>${val}</b> · ${lvl}</div>
      <div class="sin-level-desc">${SIN_LEVEL_DESC[val]}</div>
      <div class="stepper">
        <button data-k="${key}" data-d="-1" ${val<=0?'disabled':''} aria-label="减少${SIN_LABELS[key]}">−</button>
        <span class="val">${val}</span>
        <button data-k="${key}" data-d="1" ${incDisabled?'disabled':''} aria-label="增加${SIN_LABELS[key]}">+</button>
      </div>
    `;
    grid.appendChild(card);
  });
  grid.querySelectorAll("button").forEach(b=>{
    b.onclick=()=>{ if(b.disabled) return; stepSin(b.dataset.k, parseInt(b.dataset.d,10)); };
  });
  const warns=body.querySelector("#sinWarns");
  if(res.isValid){
    warns.innerHTML=`<div class="warn ok">✔ 罪孽分配合法，可以进入下一步。</div>`;
  }else{
    warns.innerHTML=res.errors.map(e=>`<div class="warn">✕ <span>${e}</span></div>`).join("");
  }
}

function stepSin(key,delta){
  const v=state.sins.values;
  let nv=v[key]+delta;
  nv=Math.max(0,Math.min(SIN_MAX,nv));
  // 只允许一项为 3：已有其他项达到 3 时，禁止本项升到 3
  if(delta>0 && nv===SIN_MAX && getMaxedSins(v).filter(k=>k!==key).length>=1) return;
  // 剩余点数不足
  if(delta>0 && sumSins(v)>=SIN_POINTS) return;
  v[key]=nv;
  reconcileSinProfile();
  render();
}

/* --- 子步骤3：核心与排斥（均由点数自动派生，无需选择） --- */
function renderSinCoreReject(body){
  const p=state.sins;
  const core=p.coreSin;
  const rejected=p.rejectedSins||[];
  body.innerHTML=`
    <p class="lead">核心罪孽与排斥罪孽根据你的点数分配自动确定，无需选择。如需更改请返回上一步调整点数。</p>
    <h4 class="sin-sub-h">核心罪孽</h4>
    <p class="hint" style="margin-bottom:10px">核心罪孽代表角色最本能、最难摆脱的行动方式（唯一为 3 的罪孽）。</p>
    <div class="choice-grid" id="coreGrid"></div>
    <h4 class="sin-sub-h" style="margin-top:22px">排斥罪孽</h4>
    <p class="hint" style="margin-bottom:10px">所有数值为 0 的罪孽均为排斥罪孽——角色最难面对、最难理解或极力否认的欲望。</p>
    <div class="choice-grid" id="rejGrid"></div>
  `;
  const mkCard=(key,tag)=>{
    const c=document.createElement("div");
    c.className=`sin-card choice sin-${key} sel`;
    c.innerHTML=`
      <div class="sin-head"><span class="sin-sym">${sinIcon(key)}</span>
      <span class="sin-name">${SIN_LABELS[key]}</span><span class="sin-count">${tag}</span></div>
      <p class="sin-summary">${SIN_DEFINITIONS[key].summary}</p>`;
    return c;
  };
  const coreGrid=body.querySelector("#coreGrid");
  if(core) coreGrid.appendChild(mkCard(core,"主导 3"));
  else coreGrid.innerHTML=`<p class="warn">✕ <span>尚未确定核心罪孽，请返回上一步让某一项达到 3。</span></p>`;
  const rejGrid=body.querySelector("#rejGrid");
  if(rejected.length) rejected.forEach(k=>rejGrid.appendChild(mkCard(k,"排斥 0")));
  else rejGrid.innerHTML=`<p class="warn">✕ <span>尚未确定排斥罪孽，请返回上一步保留至少一项为 0。</span></p>`;
}

/* --- 子步骤4：罪孽档案预览 --- */
function renderSinProfilePreview(body){
  const p=state.sins;
  const res=validateSinAllocation(p.values);
  const rej=p.rejectedSins||[];
  const valRows=SIN_ORDER.map(k=>{
    const isCore=k===p.coreSin, isRej=rej.includes(k);
    const tag=isCore?'<span class="pill core">核心</span>':isRej?'<span class="pill rej">排斥</span>':'';
    return `<tr><td><span class="sin-icon-inline">${sinIcon(k)}</span>${SIN_LABELS[k]}</td><td><b>${p.values[k]}</b> · ${SIN_LEVEL_NAMES[p.values[k]]} ${tag}</td></tr>`;
  }).join("");
  body.innerHTML=`
    <p class="lead">确认你的罪孽档案。可点击下方按钮返回任意子步骤修改。</p>
    <div class="sheet">
      <h4>罪孽数值（剩余点数 ${res.remaining}）</h4>
      <table class="sh">${valRows}</table>
    </div>
    <div class="sheet">
      <h4>核心结构</h4>
      <table class="sh">
        <tr><td>核心罪孽</td><td>${p.coreSin?SIN_LABELS[p.coreSin]:'<span style="color:var(--danger)">未确定</span>'}</td></tr>
        <tr><td>排斥罪孽</td><td>${rej.length?rej.map(k=>SIN_LABELS[k]).join("、"):'<span style="color:var(--danger)">未确定</span>'}</td></tr>
        <tr><td>初始罪孽压力</td><td>${p.sinPressure} / ${sinPressureCap()}<span style="color:var(--muted)"> · 上限 ＝ 意志(${state.attrs.意志}) ＋ 2</span></td></tr>
      </table>
    </div>
    <div class="export-row">
      <button class="btn" data-jump="1">修改点数</button>
      <button class="btn" data-jump="2">查看核心与排斥</button>
      <button class="btn ghost" id="sinReset">↺ 重置罪孽部分</button>
    </div>
  `;
  body.querySelectorAll("[data-jump]").forEach(b=>{
    b.onclick=()=>{ sinSub=parseInt(b.dataset.jump,10); render(); };
  });
  body.querySelector("#sinReset").onclick=()=>{
    if(confirm("确定要重置罪孽部分吗？这不会影响其他车卡数据。")){
      state.sins=defaultSinProfile();
      sinSub=0; sinReaderIdx=0;
      render();
      toast("已重置罪孽部分");
    }
  };
}

/* -------- 步骤 4：E.G.O -------- */
function renderEgoStep(){
  const sin = egoSin();
  if(!sin){
    stageCard.innerHTML=`
      <h2>E.G.O</h2>
      <div class="attr-help">
        <b>尚未确定核心罪孽。</b> E.G.O 的罪孽属性直接等于核心罪孽，请先回到「罪孽倾向」完成点数分配。
      </div>
      <div class="export-row"><button class="btn primary" id="egoGotoSin">前往罪孽倾向 →</button></div>
    `;
    document.getElementById("egoGotoSin").onclick=()=>{ current=3; render(); };
    return;
  }

  const ego = state.ego;
  const ec = egoEffectCount();
  const dc = egoCorrosionDC();
  const cap = egoShardCap();
  const sinEffect = getEgoSinEffect();
  const qa = getEgoQA();

  const typeCards = Object.keys(EGO_TYPES).map(t=>{
    const md = EGO_TYPES[t];
    const selected = ego.type===t;
    return `<div class="mode-card${selected?" sel":""}" data-type="${t}">
      <div class="mode-name">${md.label}</div>
      <div class="mode-desc">${EGO_TYPE_BASE[t]}</div>
      ${selected?'<span class="pill core">已选</span>':''}
    </div>`;
  }).join("");

  let baseHtml = "";
  if(ego.type){
    const clashInfo = EGO_TYPES[ego.type].clash ? getEgoClashInfo() : null;
    baseHtml = `<div class="sheet"><div class="sin-card preview-card">
      <h4>基础功能（ZAYIN 档）</h4>
      <p class="sin-summary">${EGO_TYPE_BASE[ego.type]}</p>
      ${clashInfo?`<div class="card-clash"><span class="pill core">拼点</span> ${clashInfo.formula}<br><span class="card-dmg">${clashInfo.dmg}</span><br><span class="card-dmg">${clashInfo.noDefDmg}</span></div>`:`<div class="card-clash"><span class="pill rej">不拼点</span> 打出即生效</div>`}
      ${sinEffect?`<p class="sin-summary" style="margin-top:10px"><b>罪孽专属特效 · ${sinEffect.label}</b>——${sinEffect.effect}</p>`:''}
    </div></div>`;
  }

  let qaHtml = "";
  if(ego.type){
    if(egoTruncatedNotice){
      qaHtml += `<div class="warn" style="margin-bottom:14px">✕ <span>共感下降导致特效数量减少，多余的问答已清空，请重新选择。</span></div>`;
    }
    qaHtml += qa.slice(0, ec).map((q,qi)=>{
      const selectedO = ego.answers[qi];
      const optsHtml = q.options.map((o,oi)=>`
        <div class="qa-option${selectedO===oi?" sel":""}" data-q="${qi}" data-o="${oi}">
          <div class="qa-opt-label">${String.fromCharCode(65+oi)}. ${o.label}</div>
          <div class="qa-opt-effect">${o.effect}</div>
        </div>
      `).join("");
      return `<div class="qa-block">
        <div class="qa-question">问题 ${qi+1}：${q.question}</div>
        <div class="qa-options">${optsHtml}</div>
      </div>`;
    }).join("");
  }

  stageCard.innerHTML=`
    <h2>E.G.O</h2>
    <p class="lead">每名角色只能持有一个 E.G.O。罪孽属性、等级、特效数量、碎片消耗、侵蚀阈值、碎片承载上限均由已有数据自动推导。</p>
    <div class="grid2">
      <div class="stat">
        <div class="k">罪孽属性</div>
        <div class="v" style="font-size:18px"><span class="sin-icon-inline">${sinIcon(sin)}</span>${SIN_LABELS[sin]}</div>
        <div class="note">＝ 核心罪孽，自动派生</div>
      </div>
      <div class="stat">
        <div class="k">等级</div>
        <div class="v" style="font-size:18px"><span class="pill core">ZAYIN</span> <span class="pill rej">TETH 成长解锁</span> <span class="pill rej">HE 成长解锁</span></div>
        <div class="note">车卡阶段固定 ZAYIN</div>
      </div>
      <div class="stat">
        <div class="k">特效数量</div>
        <div class="v">${ec}</div>
        <div class="note">＝ 共感(${state.attrs.共感})，每点共感一条特效${state.attrs.共感>EGO_MAX_EFFECTS?`（题库上限 ${EGO_MAX_EFFECTS}）`:""}</div>
      </div>
      <div class="stat">
        <div class="k">碎片消耗 / 侵蚀阈值</div>
        <div class="v">${egoShardCost()} / ${dc}</div>
        <div class="note">侵蚀阈值 ＝ 4 ＋ 特效数量(${ec})</div>
      </div>
      <div class="stat">
        <div class="k">碎片承载上限</div>
        <div class="v">${cap}</div>
        <div class="note">＝ 意志(${state.attrs.意志}) ＋ 2</div>
      </div>
      <div class="stat">
        <div class="k">罪孽压力上限</div>
        <div class="v">${sinPressureCap()}</div>
        <div class="note">＝ 意志(${state.attrs.意志}) ＋ 2；初始压力恒为 0</div>
      </div>
    </div>

    <label class="field" style="margin-top:18px">
      <span class="lab">E.G.O 名称</span>
      <input type="text" id="egoName" placeholder="为你的 E.G.O 取一个名字" value="${escapeHtml(ego.name)}">
    </label>

    <h4 class="sin-sub-h">类型</h4>
    <div class="mode-grid" id="egoTypeGrid">${typeCards}</div>

    ${baseHtml}
    ${ego.type?`<div class="sheet"><h4>问答特效</h4>${qaHtml||'<p class="hint">该类型暂无问答。</p>'}</div>`:''}

    <label class="field" style="margin-top:6px">
      <span class="lab">显现描述（选填，纯文本，无机制意义）</span>
      <input type="text" id="egoDesc" placeholder="描述 E.G.O 显现时的样貌与氛围" value="${escapeHtml(ego.description)}">
    </label>
  `;

  document.getElementById("egoName").oninput=e=>{ state.ego.name=e.target.value; renderNav(); renderSummary(); renderChips(); };
  document.getElementById("egoDesc").oninput=e=>{ state.ego.description=e.target.value; };

  document.getElementById("egoTypeGrid").querySelectorAll(".mode-card").forEach(card=>{
    card.onclick=()=>{
      const t=card.dataset.type;
      if(t===ego.type) return;
      if(ego.answers.length>0 && !confirm("切换类型会清空已选的问答，确定吗？")) return;
      ego.type=t;
      ego.answers=[];
      render();
    };
  });

  stageCard.querySelectorAll(".qa-option").forEach(el=>{
    el.onclick=()=>{
      const qi=parseInt(el.dataset.q,10);
      const oi=parseInt(el.dataset.o,10);
      state.ego.answers[qi]=oi;
      egoTruncatedNotice=false;
      render();
    };
  });
}

/* -------- 步骤 5：攻击模式选择 -------- */
function renderAttackMode(){
  const m=state.attackModes;
  const modeKeys=Object.keys(ATTACK_MODES);
  const modeLabel=(k)=>k?ATTACK_MODES[k].label:"未选择";
  const modeAttr=(k)=>k?ATTACK_MODES[k].attr:"—";
  // 当前 tab：默认 A
  if(!renderAttackMode._tab) renderAttackMode._tab=0;
  const tab=renderAttackMode._tab;
  const curVal=m[tab];

  stageCard.innerHTML=`
    <h2>攻击模式选择</h2>
    <p class="lead">为两组卡片各选择一种攻击模式（可重复选择同一模式）。先切换到对应组，再点击下方卡片选择。</p>
    <div class="attr-help" style="margin-bottom:18px">
      <b>攻击模式同时决定接线方式。</b> 你的速度绑定当前所处的模式，因此切换卡组时接线方式也会跟着换。
      <br>· <b>斩击</b>投骰求速度——期望最高，但有波动，怕减速效果
      <br>· <b>突刺</b>速度恒等于认知——不投骰，快敌必失、慢敌必中
      <br>· <b>打击</b>无视速度无条件接线——代价是防御拼点减值，但免疫一切速度增减
    </div>
    <div class="mode-tabs" id="modeTabs">
      <div class="mode-tab${tab===0?" active":""}" data-tab="0">
        <span class="mt-label">A 组</span>
        <span class="mt-val">${modeLabel(m[0])}</span>
        ${m[0]?`<span class="mt-attr">拼点：${modeAttr(m[0])} · 速度 ${modeSpeedInfo(m[0]).speedText}</span>`:''}
      </div>
      <div class="mode-tab${tab===1?" active":""}" data-tab="1">
        <span class="mt-label">B 组</span>
        <span class="mt-val">${modeLabel(m[1])}</span>
        ${m[1]?`<span class="mt-attr">拼点：${modeAttr(m[1])} · 速度 ${modeSpeedInfo(m[1]).speedText}</span>`:''}
      </div>
    </div>
    <div class="mode-grid" id="modeGrid"></div>
  `;
  // tab 切换
  document.getElementById("modeTabs").querySelectorAll(".mode-tab").forEach(el=>{
    el.onclick=()=>{ renderAttackMode._tab=parseInt(el.dataset.tab,10); render(); };
  });
  // 模式卡片
  const grid=document.getElementById("modeGrid");
  modeKeys.forEach(k=>{
    const md=ATTACK_MODES[k];
    const selected=curVal===k;
    const card=document.createElement("div");
    card.className=`mode-card${selected?" sel":""}`;
    const si=modeSpeedInfo(k);
    card.innerHTML=`
      <div class="mode-name">${md.label}</div>
      <div class="mode-attr">拼点属性：${md.attr}(${state.attrs[md.attr]})</div>
      <div class="mode-desc">${md.desc}</div>
      <div class="mode-desc" style="margin-top:8px;color:var(--accent-2)">速度 ${si.speedText}</div>
      <div class="mode-desc" style="font-size:12px;color:var(--muted)">${si.rule}</div>
      ${selected?'<span class="pill core">已选</span>':''}
    `;
    card.onclick=()=>{
      m[tab]=selected?"":k; // 再次点击取消
      render();
    };
    grid.appendChild(card);
  });
}

/* -------- 步骤 6：罪孽卡片 -------- */
function renderCardStep(){
  const sub=cardSub;
  const subChips=CARD_SUBSTEPS.map((s,i)=>{
    const cls=i===sub?"active":(i<sub?"done":"");
    return `<span class="subchip ${cls}" data-sub="${i}">${i+1}. ${s}</span>`;
  }).join("");
  stageCard.innerHTML=`
    <h2>罪孽卡片构筑</h2>
    <div class="subchips">${subChips}</div>
    <div id="cardBody"></div>
  `;
  stageCard.querySelectorAll(".subchip").forEach(el=>{
    el.onclick=()=>{
      const t=parseInt(el.dataset.sub,10);
      if(t<=cardSub || (t===cardSub+1 && canLeaveCardSub(cardSub))){ cardSub=t; render(); }
      else toast("请先完成当前步骤");
    };
  });
  const body=document.getElementById("cardBody");
  if(sub===0) renderCardOverview(body);
  else if(sub===1) renderCardTraitSelect(body,"a");
  else if(sub===2) renderCardQA(body,"a");
  else if(sub===3) renderCardTraitSelect(body,"b");
  else if(sub===4) renderCardQA(body,"b");
  else renderCardPreview(body);
}

/* --- 子步骤0：卡片总览 --- */
function renderCardOverview(body){
  const activeSins=SIN_ORDER.filter(k=>state.sins.values[k]>0);
  const rows=activeSins.map(k=>{
    const v=state.sins.values[k];
    const lvl=sinCardLevel(k);
    const lvlText=lvl==="basic"?"基础卡片":lvl==="small"?"小技能（2条特效）":lvl==="large"?"大技能（3条特效）":"—";
    const traits=getAvailableTraits(k).map(t=>TRAIT_LABELS[t]).join("、");
    return `<tr><td><span class="sin-icon-inline">${sinIcon(k)}</span>${SIN_LABELS[k]}</td><td>${v} · ${SIN_LEVEL_NAMES[v]}</td><td>${lvlText}</td><td>${traits}</td></tr>`;
  }).join("");
  body.innerHTML=`
    <p class="lead">根据你的罪孽点数，以下罪孽会生成卡片。两组卡片构成相同，但每张卡片的特性可以分别选择。</p>
    <div class="attr-help" style="margin-bottom:18px">
      <b>卡片等级：</b> 排斥(0)＝无卡 · 潜在(1)＝基础卡片 · 显著(2)＝小技能（基本功能＋2条特效） · 主导(3)＝大技能（基本功能＋3条特效）
      <br><b>两组卡片：</b> 你选择的两种攻击模式各对应一组卡片。两组卡片构成相同，但每张卡片的特性可以分别选择。
      <br><b>切换攻击模式：</b> 切换攻击模式时使用对应的卡片组，两组独立计算消耗和刷新。
    </div>
    <div class="sheet">
      <h4>罪孽卡片一览</h4>
      <table class="sh auto">
        <tr><td style="color:var(--muted)">罪孽</td><td style="color:var(--muted)">等级</td><td style="color:var(--muted)">卡片类型</td><td style="color:var(--muted)">可用特性</td></tr>
        ${rows}
      </table>
    </div>
  `;
}

/* --- 子步骤1/3：特性选择 --- */
function renderCardTraitSelect(body,gid){
  const g=state.cardGroups[gid];
  const groupLabel=gid==="a"?"A":"B";
  const modeKey=state.attackModes[gid==="a"?0:1];
  const modeLabel=modeKey?ATTACK_MODES[modeKey].label:"—";
  const activeSins=SIN_ORDER.filter(k=>state.sins.values[k]>0);
  if(cardGroupIdx<0) cardGroupIdx=0;
  if(cardGroupIdx>=activeSins.length) cardGroupIdx=activeSins.length-1;
  const sinKey=activeSins[cardGroupIdx];
  const val=state.sins.values[sinKey];
  const entry=g[sinKey]||{trait:null,answers:[]};
  const traits=getAvailableTraits(sinKey);
  body.innerHTML=`
    <p class="lead">${groupLabel}组（${modeLabel}模式）· ${cardGroupIdx+1} / ${activeSins.length} — 为「${SIN_LABELS[sinKey]}」选择特性</p>
    <div class="sin-card sin-${sinKey}" style="margin-bottom:16px">
      <div class="sin-head">
        <span class="sin-sym">${sinIcon(sinKey)}</span>
        <span class="sin-name">${SIN_LABELS[sinKey]}</span>
        <span class="sin-count">${SIN_LEVEL_NAMES[val]}（${val}）</span>
      </div>
    </div>
    <div class="choice-grid" id="traitGrid"></div>
    <div class="reader-nav" style="margin-top:16px">
      <button class="btn ghost" id="traitPrev" ${cardGroupIdx===0?'disabled':''}>← 上一个罪孽</button>
      <div class="dots-row" id="traitDots"></div>
      ${cardGroupIdx<activeSins.length-1
        ?`<button class="btn" id="traitNext" ${entry.trait?'':'disabled'}>下一个罪孽 →</button>`
        :`<button class="btn primary" id="traitDone" ${entry.trait?'':'disabled'}>完成特性选择 →</button>`}
    </div>
  `;
  const grid=document.getElementById("traitGrid");
  const modeAttrLabel=modeKey?ATTACK_MODES[modeKey].attr:"—";
  // 特性对应的拼点属性标注
  const traitClashAttr=(t)=>{
    if(t==="attack"||t==="multiAttack") return `拼点：${modeAttrLabel}`;
    if(t==="defense"||t==="shield"||t==="counter") return "拼点：体魄";
    if(t==="buff"||t==="debuff"||t==="support"||t==="special") return null;
    return null;
  };
  traits.forEach(t=>{
    const card=document.createElement("div");
    card.className=`sin-card choice sin-${sinKey}${entry.trait===t?" sel":""}`;
    const level=val>=3?"large":val>=2?"small":"basic";
    const baseEffect=level==="basic"?CARD_BASE_EFFECT[t]:CARD_SKILL_BASE[t]?.[level]||"";
    const clashAttr=traitClashAttr(t);
    card.innerHTML=`
      <div class="sin-head"><span class="sin-name">${TRAIT_LABELS[t]}</span>
      ${clashAttr?`<span class="pill core" style="margin-left:auto">${clashAttr}</span>`:''}</div>
      <p class="sin-summary">${baseEffect}</p>
    `;
    card.onclick=()=>{
      g[sinKey]={trait:t,answers:[]};
      render();
    };
    grid.appendChild(card);
  });
  // 进度点
  const dots=document.getElementById("traitDots");
  activeSins.forEach((k,i)=>{
    const d=document.createElement("span");
    d.className=`rdot${i===cardGroupIdx?" on":""}${g[k]?.trait?" done":""}`;
    d.textContent=i+1;
    d.onclick=()=>{cardGroupIdx=i;render();};
    dots.appendChild(d);
  });
  const pv=document.getElementById("traitPrev"); if(pv) pv.onclick=()=>{cardGroupIdx--;render();};
  const nx=document.getElementById("traitNext"); if(nx) nx.onclick=()=>{if(!nx.disabled){cardGroupIdx++;render();}};
  const dn=document.getElementById("traitDone");
  if(dn) dn.onclick=()=>{
    if(dn.disabled) return;
    // 仍有罪孽没选特性时跳到第一个未完成项并说明原因，而不是默默回到第一张
    const miss=activeSins.findIndex(k=>!g[k]||!g[k].trait);
    if(miss>=0){ cardGroupIdx=miss; render(); toast(`「${SIN_LABELS[activeSins[miss]]}」尚未选择特性`); return; }
    cardGroupIdx=0; cardSub++; render();   // 推进到本组问答
  };
}

/* --- 子步骤2/4：技能问答 --- */
function renderCardQA(body,gid){
  const g=state.cardGroups[gid];
  const groupLabel=gid==="a"?"A":"B";
  const modeKey=state.attackModes[gid==="a"?0:1];
  const modeLabel=modeKey?ATTACK_MODES[modeKey].label:"—";
  const activeSins=SIN_ORDER.filter(k=>state.sins.values[k]>0);
  // 只需要对 level≥2 的罪孽回答问答
  const qaSins=activeSins.filter(k=>state.sins.values[k]>=2);
  if(qaSins.length===0){
    body.innerHTML=`<p class="lead">${groupLabel}组（${modeLabel}模式）没有需要回答问答的罪孽（全部为潜在等级）。可直接进入下一步。</p>`;
    return;
  }
  if(cardGroupIdx<0) cardGroupIdx=0;
  if(cardGroupIdx>=qaSins.length) cardGroupIdx=qaSins.length-1;
  const sinKey=qaSins[cardGroupIdx];
  const val=state.sins.values[sinKey];
  const entry=g[sinKey]||{trait:null,answers:[]};
  const level=val>=3?"large":"small";
  const qa=getSinQA(sinKey,entry.trait,level);
  if(!entry.trait||qa.length===0){
    body.innerHTML=`<p class="lead">「${SIN_LABELS[sinKey]}」尚未选择特性，请先返回上一步选择。</p>`;
    return;
  }
  const levelLabel=level==="large"?"大技能":"小技能";
  const baseEffect=CARD_SKILL_BASE[entry.trait]?.[level]||"";
  // 渲染问答
  const qaHtml=qa.map((q,qi)=>{
    const selected=entry.answers[qi];
    const optsHtml=q.options.map((o,oi)=>`
      <div class="qa-option${selected===oi?" sel":""}" data-q="${qi}" data-o="${oi}">
        <div class="qa-opt-label">${String.fromCharCode(65+oi)}. ${o.label}</div>
        <div class="qa-opt-effect">${o.effect}</div>
      </div>
    `).join("");
    return `<div class="qa-block">
      <div class="qa-question">问题 ${qi+1}：${q.question}</div>
      <div class="qa-options">${optsHtml}</div>
    </div>`;
  }).join("");
  body.innerHTML=`
    <p class="lead">${groupLabel}组（${modeLabel}模式）· ${cardGroupIdx+1} / ${qaSins.length} — 「${SIN_LABELS[sinKey]}」·${TRAIT_LABELS[entry.trait]}·${levelLabel}</p>
    <div class="sin-card sin-${sinKey}" style="margin-bottom:12px">
      <div class="sin-head">
        <span class="sin-sym">${sinIcon(sinKey)}</span>
        <span class="sin-name">${SIN_LABELS[sinKey]} · ${TRAIT_LABELS[entry.trait]}</span>
        <span class="sin-count">${levelLabel}</span>
      </div>
      <p class="sin-summary"><b>基础效果：</b>${baseEffect}</p>
    </div>
    ${qaHtml}
    <div class="reader-nav" style="margin-top:16px">
      <button class="btn ghost" id="qaPrev" ${cardGroupIdx===0?'disabled':''}>← 上一个</button>
      <div class="dots-row" id="qaDots"></div>
      ${cardGroupIdx<qaSins.length-1
        ?`<button class="btn" id="qaNext">下一个 →</button>`
        :`<button class="btn primary" id="qaDone">完成问答 →</button>`}
    </div>
  `;
  // 选项点击
  body.querySelectorAll(".qa-option").forEach(el=>{
    el.onclick=()=>{
      const qi=parseInt(el.dataset.q,10);
      const oi=parseInt(el.dataset.o,10);
      if(!g[sinKey]) g[sinKey]={trait:entry.trait,answers:[]};
      g[sinKey].answers[qi]=oi;
      render();
    };
  });
  // 进度点
  const dots=document.getElementById("qaDots");
  qaSins.forEach((k,i)=>{
    const val2=state.sins.values[k];
    const e2=g[k]||{trait:null,answers:[]};
    const lv2=val2>=3?"large":"small";
    const exp2=getSinQA(k,e2.trait,lv2).length;
    const done2=e2.trait && e2.answers.length>=exp2 && !e2.answers.some(a=>a==null);
    const d=document.createElement("span");
    d.className=`rdot${i===cardGroupIdx?" on":""}${done2?" done":""}`;
    d.textContent=i+1;
    d.onclick=()=>{cardGroupIdx=i;render();};
    dots.appendChild(d);
  });
  const pv=document.getElementById("qaPrev"); if(pv) pv.onclick=()=>{cardGroupIdx--;render();};
  const nx=document.getElementById("qaNext"); if(nx) nx.onclick=()=>{cardGroupIdx++;render();};
  const dn=document.getElementById("qaDone");
  if(dn) dn.onclick=()=>{
    // 仍有问答没答完时跳到第一个未完成项并说明原因，而不是默默回到第一张
    const miss=qaSins.findIndex(k=>{
      const e=g[k]||{};
      if(!e.trait) return true;
      const lv=state.sins.values[k]>=3?"large":"small";
      const exp=getSinQA(k,e.trait,lv).length;
      const ans=e.answers||[];
      return ans.length<exp || ans.some(a=>a==null);
    });
    if(miss>=0){ cardGroupIdx=miss; render(); toast(`「${SIN_LABELS[qaSins[miss]]}」的问答尚未完成`); return; }
    cardGroupIdx=0; cardSub++; render();   // 推进到下一子步骤
  };
}

/* --- 子步骤5：卡片预览 --- */
function renderCardPreview(body){
  const mkCardHtml=(k,val,entry,gid)=>{
    const level=val>=3?"large":val>=2?"small":"basic";
    const levelText=level==="basic"?"基础":level==="small"?"小技能":"大技能";
    const traitText=entry.trait?TRAIT_LABELS[entry.trait]:"<span style='color:var(--danger)'>未选</span>";
    // 拼点信息
    const clashInfo=entry.trait? getClashInfo(entry.trait, gid) : null;
    let clashHtml="";
    if(clashInfo){
      if(clashInfo.clash){
        clashHtml=`<div class="card-clash"><span class="pill core">拼点</span> ${clashInfo.formula}`;
        if(clashInfo.dmg) clashHtml+=`<br><span class="card-dmg">${clashInfo.dmg}</span>`;
        if(clashInfo.noDefDmg) clashHtml+=`<br><span class="card-dmg">${clashInfo.noDefDmg}</span>`;
        clashHtml+="</div>";
      }else{
        clashHtml=`<div class="card-clash"><span class="pill rej">不拼点</span> 打出即生效</div>`;
      }
    }
    // 效果
    let effectHtml="";
    if(entry.trait){
      if(level==="basic"){
        effectHtml=`<div class="card-effect">${CARD_BASE_EFFECT[entry.trait]||""}</div>`;
      }else{
        effectHtml=`<div class="card-effect"><b>基础：</b>${CARD_SKILL_BASE[entry.trait]?.[level]||""}</div>`;
        const qa=getSinQA(k,entry.trait,level);
        (entry.answers||[]).forEach((a,i)=>{
          if(a!=null && qa[i]?.options?.[a]) effectHtml+=`<div class="card-effect">▸ <b>${qa[i].options[a].label}</b>——${qa[i].options[a].effect}</div>`;
        });
      }
    }
    return `<div class="sin-card sin-${k} preview-card">
      <div class="sin-head">
        <span class="sin-sym">${sinIcon(k)}</span>
        <span class="sin-name">${SIN_LABELS[k]}</span>
        <span class="sin-count">${levelText} · ${traitText}</span>
      </div>
      ${clashHtml}
      ${effectHtml}
    </div>`;
  };
  const mkGroup=(gid)=>{
    const g=state.cardGroups[gid];
    const cards=SIN_ORDER.filter(k=>state.sins.values[k]>0).map(k=>{
      const val=state.sins.values[k];
      const entry=g[k]||{};
      return mkCardHtml(k,val,entry,gid);
    }).join("");
    return `<div class="sheet">
      <h4>${gid==="a"?"A":"B"}组 · ${groupModeDesc(gid)}</h4>
      <div class="preview-cards">${cards}</div>
    </div>`;
  };
  body.innerHTML=`
    <p class="lead">确认你的两组罪孽卡片配置。可点击下方按钮返回修改。</p>
    ${mkGroup("a")}
    ${mkGroup("b")}
    <div class="export-row">
      <button class="btn" data-jump="1">修改A组特性</button>
      <button class="btn" data-jump="2">修改A组问答</button>
      <button class="btn" data-jump="3">修改B组特性</button>
      <button class="btn" data-jump="4">修改B组问答</button>
      <button class="btn ghost" id="cardReset">↺ 重置卡片配置</button>
    </div>
  `;
  body.querySelectorAll("[data-jump]").forEach(b=>{
    b.onclick=()=>{cardSub=parseInt(b.dataset.jump,10);cardGroupIdx=0;render();};
  });
  body.querySelector("#cardReset").onclick=()=>{
    if(confirm("确定要重置卡片配置吗？这不会影响罪孽点数和其他数据。")){
      state.cardGroups={a:{},b:{}};
      cardSub=0;cardGroupIdx=0;
      reconcileCardGroups();
      render();
      toast("已重置卡片配置");
    }
  };
}

/* -------- 步骤 7：总览与导出 -------- */
function renderStep3(){
  const attrRows=ATTR_DEFS.map(d=>`<td>${d.key}</td><td>${state.attrs[d.key]} <span style="color:var(--muted)">· ${LEVEL_MEANING[state.attrs[d.key]]}</span></td>`).map(r=>`<tr>${r}</tr>`).join("");
  const modeALabel=state.attackModes[0]?ATTACK_MODES[state.attackModes[0]].label:"—";
  const modeBLabel=state.attackModes[1]?ATTACK_MODES[state.attackModes[1]].label:"—";
  const mkGroupSummary=(gid)=>{
    const g=state.cardGroups[gid];
    const rows=SIN_ORDER.filter(k=>state.sins.values[k]>0).map(k=>{
      const val=state.sins.values[k];
      const entry=g[k]||{};
      const level=val>=3?"large":val>=2?"small":"basic";
      const levelText=level==="basic"?"基础":level==="small"?"小技能":"大技能";
      const traitText=entry.trait?TRAIT_LABELS[entry.trait]:"—";
      const clashInfo=entry.trait? getClashInfo(entry.trait, gid) : null;
      let clashTag=clashInfo?(clashInfo.clash?`<span class="pill core">拼点</span>`:`<span class="pill rej">不拼点</span>`):"";
      let effectLines="";
      if(entry.trait){
        if(level==="basic") effectLines=CARD_BASE_EFFECT[entry.trait]||"";
        else{
          effectLines=`<b>基础：</b>${CARD_SKILL_BASE[entry.trait]?.[level]||""}`;
          const qa=getSinQA(k,entry.trait,level);
          (entry.answers||[]).forEach((a,i)=>{
            if(a!=null && qa[i]?.options?.[a]) effectLines+=`<br>▸ <b>${qa[i].options[a].label}</b>——${qa[i].options[a].effect}`;
          });
        }
      }
      let clashDetail="";
      if(clashInfo&&clashInfo.clash){
        clashDetail=`<br><span style="color:var(--accent-2);font-size:12px">${clashInfo.formula}</span>`;
        if(clashInfo.dmg) clashDetail+=`<br><span style="color:var(--accent-2);font-size:12px">${clashInfo.dmg}</span>`;
        if(clashInfo.noDefDmg) clashDetail+=`<br><span style="color:var(--accent-2);font-size:12px">${clashInfo.noDefDmg}</span>`;
      }
      return `<tr><td class="c-sin"><span class="sin-icon-inline">${sinIcon(k)}</span>${SIN_LABELS[k]}</td><td class="c-lv">${levelText}</td><td class="c-tr">${traitText}${clashTag?`<br>${clashTag}`:''}</td><td>${effectLines||'—'}${clashDetail}</td></tr>`;
    }).join("");
    return `<h4>${gid==="a"?"A":"B"}组 · ${groupModeDesc(gid)}</h4><table class="cards"><tr class="thead"><td class="c-sin">罪孽</td><td class="c-lv">等级</td><td class="c-tr">特性</td><td>效果</td></tr>${rows}</table>`;
  };
  stageCard.innerHTML=`
    <h2>总览与导出</h2>
    <p class="lead">确认你的角色卡内容，可返回任意步骤修改，或导出为 JSON / 图片。</p>
    <div class="sheet">
      <h4>基本信息</h4>
      <table class="sh">
        <tr><td>角色名字</td><td>${escapeHtml(state.name)||'<span style="color:var(--danger)">未填写</span>'}</td></tr>
        <tr><td>性别</td><td>${escapeHtml(state.gender)||'<span style="color:var(--danger)">未选择</span>'}</td></tr>
      </table>
    </div>
    <div class="sheet">
      <h4>基础属性</h4>
      <table class="sh">${attrRows}</table>
    </div>
    <div class="sheet">
      <h4>衍生数值</h4>
      <table class="sh">
        <tr><td>最大生命值</td><td>${maxHP()}</td></tr>
        <tr><td>混乱线</td><td>${panic1()} / ${panic2()}</td></tr>
        <tr><td>防御拼点</td><td>1D6 ＋ 体魄(${state.attrs.体魄})</td></tr>
        <tr><td>速度 / 接线</td><td>${["a","b"].map(g=>{
          const mk=state.attackModes[g==="a"?0:1];
          return mk?`${g.toUpperCase()}组 ${ATTACK_MODES[mk].label}：${modeSpeedInfo(mk).speedText}`:`${g.toUpperCase()}组 未选择模式`;
        }).join("<br>")}</td></tr>
        <tr><td>行动槽</td><td>${ACTION_SLOTS}</td></tr>
      </table>
    </div>
    <div class="sheet">
      <h4>罪孽倾向</h4>
      <table class="sh">
        <tr><td>罪孽数值</td><td>${SIN_ORDER.map(k=>`${SIN_LABELS[k]}${state.sins.values[k]}`).join(" · ")}</td></tr>
        <tr><td>核心罪孽</td><td>${sinName(state.sins.coreSin)}</td></tr>
        <tr><td>排斥罪孽</td><td>${(state.sins.rejectedSins&&state.sins.rejectedSins.length)?state.sins.rejectedSins.map(k=>SIN_LABELS[k]).join("、"):'—'}</td></tr>
        <tr><td>初始罪孽压力</td><td>${state.sins.sinPressure} / ${sinPressureCap()}（上限 ＝ 意志 ＋ 2）</td></tr>
      </table>
    </div>
    <div class="sheet">
      ${(()=>{
        const eg=buildEgoExport();
        if(!eg.sin) return `<h4>E.G.O</h4><p class="hint">尚未确定核心罪孽，无法创建 E.G.O。</p>`;
        if(!eg.type) return `<h4>E.G.O</h4><p class="hint">尚未创建 E.G.O，请前往「E.G.O」步骤完成类型与问答选择。</p>`;
        const qaRows=eg.qa.map((q,i)=>`<tr><td>问${i+1}</td><td>${q.question}</td><td>${q.label}——${q.effect}</td></tr>`).join("");
        return `<h4>E.G.O</h4>
        <table class="sh">
          <tr><td>名称</td><td>${escapeHtml(eg.name)||'<span style="color:var(--danger)">未填写</span>'}</td></tr>
          <tr><td>罪孽属性</td><td><span class="sin-icon-inline">${sinIcon(eg.sin)}</span>${eg.sinLabel}</td></tr>
          <tr><td>等级</td><td>${eg.grade}</td></tr>
          <tr><td>类型</td><td>${eg.typeLabel}</td></tr>
          <tr><td>特效数量</td><td>共感(${state.attrs.共感}) ＝ ${eg.effectCount} 条</td></tr>
          <tr><td>碎片消耗 / 侵蚀阈值</td><td>${eg.shardCost} / ${eg.corrosionDC}</td></tr>
          <tr><td>碎片承载上限</td><td>${eg.shardCap}</td></tr>
          <tr><td>当前碎片</td><td>＿＿＿（战斗中手动填写）</td></tr>
          <tr><td>基础功能</td><td>${eg.baseEffect}</td></tr>
          <tr><td>罪孽专属特效</td><td>${eg.sinEffect?`${eg.sinEffect.label}——${eg.sinEffect.effect}`:'—'}</td></tr>
        </table>
        <table class="sh" style="margin-top:8px">${qaRows}</table>
        <table class="sh" style="margin-top:8px"><tr><td>显现描述</td><td>${escapeHtml(eg.description)||'—'}</td></tr></table>`;
      })()}
    </div>
    <div class="sheet">
      <h4>攻击模式</h4>
      <table class="sh">
        <tr><td>A 组</td><td>${modeALabel}</td></tr>
        <tr><td>B 组</td><td>${modeBLabel}</td></tr>
      </table>
    </div>
    <div class="sheet">
      ${mkGroupSummary("a")}
    </div>
    <div class="sheet">
      ${mkGroupSummary("b")}
    </div>
    <div class="export-row">
      <button class="btn primary" id="btnJson">⬇ 导出 JSON</button>
      <button class="btn" id="btnImg">🖼 导出图片</button>
      <button class="btn ghost" id="btnRestart">↺ 重新开始</button>
    </div>
  `;
  document.getElementById("btnJson").onclick=exportJSON;
  document.getElementById("btnImg").onclick=exportImage;
  document.getElementById("btnRestart").onclick=confirmResetAll;
}

/* -------- 侧边实时摘要 -------- */
function renderSummary(){
  const attrMini=ATTR_DEFS.map(d=>`<span>${d.key}<b>${state.attrs[d.key]}</b></span>`).join("");
  const modeA=state.attackModes[0]?ATTACK_MODES[state.attackModes[0]].label:"—";
  const modeB=state.attackModes[1]?ATTACK_MODES[state.attackModes[1]].label:"—";
  sideSummary.innerHTML=`
    <div class="srow editable" data-goto="0"><span class="sk">名字</span><span class="sv">${escapeHtml(state.name)||'—'}</span></div>
    <div class="srow editable" data-goto="0"><span class="sk">性别</span><span class="sv">${escapeHtml(state.gender)||'—'}</span></div>
    <div class="srow editable" data-goto="1" style="border-bottom:none"><span class="sk">属性（总和 ${sumAttrs()}）</span><span class="sv"></span></div>
    <div class="attr-mini">${attrMini}</div>
    <div style="height:10px"></div>
    <div class="srow editable" data-goto="2"><span class="sk">生命值</span><span class="sv">${maxHP()}</span></div>
    <div class="srow editable" data-goto="2"><span class="sk">混乱线</span><span class="sv">${panic1()} / ${panic2()}</span></div>
    <div class="srow editable" data-goto="2"><span class="sk">防御拼点</span><span class="sv">1D6＋${state.attrs.体魄}</span></div>
    <div class="srow editable" data-goto="5"><span class="sk">速度 A / B</span><span class="sv">${["a","b"].map(g=>{
      const mk=state.attackModes[g==="a"?0:1];
      return mk?modeSpeedInfo(mk).speedText:"—";
    }).join(" / ")}</span></div>
    <div style="height:10px"></div>
    <div class="srow editable" data-goto="3"><span class="sk">核心罪孽</span><span class="sv">${sinName(state.sins.coreSin)}</span></div>
    <div class="srow editable" data-goto="3"><span class="sk">排斥罪孽</span><span class="sv">${(state.sins.rejectedSins&&state.sins.rejectedSins.length)?state.sins.rejectedSins.map(k=>SIN_LABELS[k]).join("、"):'—'}</span></div>
    <div style="height:10px"></div>
    <div class="srow editable" data-goto="4"><span class="sk">E.G.O</span><span class="sv">${state.ego.type?(escapeHtml(state.ego.name)||'（未命名）')+" · "+EGO_TYPES[state.ego.type].label:'未创建'}</span></div>
    <div style="height:10px"></div>
    <div class="srow editable" data-goto="5"><span class="sk">攻击模式</span><span class="sv">${modeA} / ${modeB}</span></div>
  `;
  sideSummary.querySelectorAll(".editable").forEach(el=>{
    el.onclick=()=>{
      const target=parseInt(el.dataset.goto,10);
      if(target<=current || (target===current+1 && canLeave(current))){ current=target; render(); }
      else { toast("请先完成当前步骤"); }
    };
  });
}

/* ============ 导出 ============ */
function buildData(){
  // 速度绑定攻击模式，按组导出
  const speedByGroup={};
  ["a","b"].forEach(g=>{
    const mk=state.attackModes[g==="a"?0:1];
    const si=mk?modeSpeedInfo(mk):null;
    speedByGroup[g.toUpperCase()+"组"]= si
      ? {模式:ATTACK_MODES[mk].label, 速度:si.speedText, 接线方式:si.rule}
      : null;
  });
  return {
    元数据:{系统:"Limbus Company TRPG",类型:"角色卡",生成时间:new Date().toISOString()},
    基本信息:{名字:state.name,性别:state.gender},
    基础属性:{...state.attrs},
    衍生数值:{
      最大生命值:maxHP(),
      第一混乱线:panic1(),
      第二混乱线:panic2(),
      防御拼点:`1D6 + 体魄(${state.attrs.体魄})`,
      速度与接线:speedByGroup,
      行动槽:ACTION_SLOTS
    },
    // 罪孽数据
    sins:{
      values:{...state.sins.values},
      coreSin:state.sins.coreSin,
      rejectedSins:[...(state.sins.rejectedSins||[])],
      sinPressure:state.sins.sinPressure,
      sinPressureCap:sinPressureCap()
    },
    // E.G.O 数据
    ego: buildEgoExport(),
    攻击模式:{a:state.attackModes[0],b:state.attackModes[1]},
    罪孽卡片:{a:buildCardGroupExport("a"),b:buildCardGroupExport("b")}
  };
}

function exportJSON(){
  const data=buildData();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`${state.name||"角色卡"}_LimbusTRPG.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("已导出 JSON");
}

/* ============ 图片导出 ============ */
/* 字号只有三级：标题 / 子标题 / 正文，行高统一为 IMG_LH */
const IMG_W        = 760;   // 画布宽度
const IMG_M        = 48;    // 左右边距
const IMG_LH       = 24;    // 统一行高
const IMG_VAL_X    = 300;   // 键值行中「值」的起始 x
const IMG_F_TITLE  = "bold 26px 'Microsoft YaHei',sans-serif";
const IMG_F_LABEL  = "bold 19px 'Microsoft YaHei',sans-serif";
const IMG_F_BODY   = "15px 'Microsoft YaHei',sans-serif";
const IMG_F_BODY_B = "bold 15px 'Microsoft YaHei',sans-serif";
const IMG_F_FOOT   = "13px 'Microsoft YaHei',sans-serif";

/* 绘制角色卡。measure=true 时只推进 y、不落笔，用于先算出内容总高度。
   两遍共用同一套折行逻辑，所以测得的高度与实际绘制高度严格一致。 */
function paintSheet(ctx, H, measure){
  const W=IMG_W, M=IMG_M, LH=IMG_LH;
  let y=0;
  const on=(fn)=>{ if(!measure) fn(); };

  if(!measure){
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,"#1a1c26"); bg.addColorStop(1,"#0a0b0f");
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="#c8a24b"; ctx.lineWidth=3; ctx.strokeRect(16,16,W-32,H-32);
  }
  ctx.textBaseline="alphabetic";

  /* 按可用宽度折行 */
  const split=(text,font,maxW)=>{
    ctx.font=font;
    const s=String(text==null||text===""?"—":text);
    const lines=[]; let cur="";
    for(const ch of s){
      if(cur!=="" && ctx.measureText(cur+ch).width>maxW){ lines.push(cur); cur=ch; }
      else cur+=ch;
    }
    lines.push(cur);
    return lines;
  };
  const put=(lines,x,font,color)=>{
    on(()=>{
      ctx.font=font; ctx.fillStyle=color;
      lines.forEach((t,i)=>ctx.fillText(t,x,y+i*LH));
    });
    y+=lines.length*LH;
  };
  /* 子标题 */
  const label=(t)=>{
    y+=10;
    on(()=>{ ctx.font=IMG_F_LABEL; ctx.fillStyle="#c8a24b"; ctx.fillText(t,M,y); });
    y+=LH+6;
  };
  /* 键值正文行，值超宽自动换行 */
  const line=(k,v,color,font)=>{
    const f=font||IMG_F_BODY;
    const lines=split(v,f,W-M-IMG_VAL_X);
    on(()=>{ ctx.font=IMG_F_BODY; ctx.fillStyle="#9096a6"; ctx.fillText(k,M+16,y); });
    put(lines,IMG_VAL_X,f,color||"#e8e9ee");
  };
  /* 缩进正文行 */
  const indent=(text,color)=>{
    const x=M+36;
    put(split(text,IMG_F_BODY,W-M-x),x,IMG_F_BODY,color||"#e8e9ee");
  };

  /* —— 标题 —— */
  y=66;
  on(()=>{
    ctx.font=IMG_F_TITLE; ctx.fillStyle="#e6c76a";
    ctx.fillText("Limbus Company TRPG · 角色卡",M,y);
    ctx.strokeStyle="#2a2e3a"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(M,y+18); ctx.lineTo(W-M,y+18); ctx.stroke();
  });
  y+=48;

  label("基本信息");
  line("角色名字", state.name||"—");
  line("性别", state.gender||"—");

  label("基础属性");
  ATTR_DEFS.forEach(d=>{
    const val=state.attrs[d.key];
    on(()=>{
      ctx.font=IMG_F_BODY; ctx.fillStyle="#9096a6"; ctx.fillText(d.key,M+16,y);
      for(let i=1;i<=5;i++){
        ctx.beginPath(); ctx.arc(150+i*24, y-5, 8, 0, Math.PI*2);
        if(i<=val){ ctx.fillStyle="#c8a24b"; ctx.fill(); }
        else { ctx.strokeStyle="#3a3e4a"; ctx.lineWidth=1.5; ctx.stroke(); }
      }
      ctx.font=IMG_F_BODY; ctx.fillStyle="#e6c76a";
      ctx.fillText(val+" · "+LEVEL_MEANING[val], IMG_VAL_X, y);
    });
    y+=LH+4;
  });

  label("衍生数值");
  line("最大生命值", String(maxHP()));
  line("混乱线", panic1()+" / "+panic2());
  line("防御拼点", "1D6 + 体魄("+state.attrs.体魄+")");
  line("行动槽", String(ACTION_SLOTS));
  ["a","b"].forEach(g=>{
    const mk=state.attackModes[g==="a"?0:1];
    const si=mk?modeSpeedInfo(mk):null;
    line(g.toUpperCase()+"组速度 / 接线",
      si ? ATTACK_MODES[mk].label+" · "+si.speedText+" · "+si.rule : "未选择模式");
  });

  const p=state.sins;
  label("罪孽倾向");
  line("罪孽数值", SIN_ORDER.map(k=>SIN_LABELS[k]+p.values[k]).join("  "));
  line("核心罪孽", sinName(p.coreSin));
  line("排斥罪孽", (p.rejectedSins&&p.rejectedSins.length)?p.rejectedSins.map(k=>SIN_LABELS[k]).join("、"):"—");
  line("初始罪孽压力", p.sinPressure+" / "+sinPressureCap()+"（上限 = 意志 + 2）");

  const eg=buildEgoExport();
  label("E.G.O");
  if(!eg.sin){
    indent("尚未确定核心罪孽，无法创建 E.G.O","#9096a6");
  }else if(!eg.type){
    indent("尚未创建 E.G.O","#9096a6");
  }else{
    line("名称", eg.name||"—");
    line("罪孽属性 / 等级", eg.sinLabel+" / "+eg.grade);
    line("类型", eg.typeLabel);
    line("特效数量", "共感("+state.attrs.共感+") = "+eg.effectCount+" 条");
    line("碎片消耗 / 侵蚀阈值", eg.shardCost+" / "+eg.corrosionDC);
    line("碎片承载上限", String(eg.shardCap));
    line("基础功能", eg.baseEffect);
    if(eg.sinEffect) line("罪孽专属特效", eg.sinEffect.label+"——"+eg.sinEffect.effect);
    eg.qa.forEach((q,i)=>{ line("问"+(i+1), q.label+"——"+q.effect); });
    line("显现描述", eg.description||"—");
  }

  label("攻击模式");
  line("A 组", state.attackModes[0]?ATTACK_MODES[state.attackModes[0]].label:"—");
  line("B 组", state.attackModes[1]?ATTACK_MODES[state.attackModes[1]].label:"—");

  const groupBlock=(gid)=>{
    const g=state.cardGroups[gid];
    label((gid==="a"?"A":"B")+"组 · "+groupModeDesc(gid));
    SIN_ORDER.forEach(k=>{
      const val=state.sins.values[k];
      if(val===0) return;
      const entry=g[k]||{};
      const level=val>=3?"large":val>=2?"small":"basic";
      const levelText=level==="basic"?"基础":level==="small"?"小技能":"大技能";
      const traitText=entry.trait?TRAIT_LABELS[entry.trait]:"—";
      const clashInfo=entry.trait?getClashInfo(entry.trait,gid):null;
      const clashTag=clashInfo?(clashInfo.clash?"[拼点]":"[不拼点]"):"";
      line(SIN_LABELS[k], levelText+" · "+traitText+" "+clashTag, "#e6c76a", IMG_F_BODY_B);
      if(clashInfo&&clashInfo.clash){
        indent("拼点："+clashInfo.formula,"#c8a24b");
        if(clashInfo.dmg) indent("伤害："+clashInfo.dmg,"#c8a24b");
      }
      if(entry.trait){
        if(level==="basic"){
          indent("▸ "+(CARD_BASE_EFFECT[entry.trait]||""));
        }else{
          indent("▸ 基础："+(CARD_SKILL_BASE[entry.trait]?.[level]||""));
          const qa=getSinQA(k,entry.trait,level);
          (entry.answers||[]).forEach((a,i)=>{
            if(a!=null && qa[i]?.options?.[a]) indent("▸ "+qa[i].options[a].label+"——"+qa[i].options[a].effect);
          });
        }
      }
      y+=8;
    });
  };
  groupBlock("a");
  groupBlock("b");

  /* —— 页脚 —— */
  y+=18;
  on(()=>{
    ctx.font=IMG_F_FOOT; ctx.fillStyle="#5a5f6e";
    ctx.fillText("Generated by Limbus TRPG 建卡器 · "+new Date().toLocaleString("zh-CN"), M, y);
  });
  y+=34;

  return y; // 内容底部 = 所需的画布高度
}

function exportImage(){
  const cv=document.getElementById("exportCanvas");
  const ctx=cv.getContext("2d");
  cv.width=IMG_W;
  // 第一遍只测量内容高度，据此设定画布高度后再真正绘制，避免底部大片留白
  const h=Math.ceil(paintSheet(ctx,0,true));
  cv.height=Math.max(400,Math.min(h,20000));
  // 修改 canvas.height 会重置绘图上下文，第二遍会重新设置全部样式
  paintSheet(ctx,cv.height,false);

  const a=document.createElement("a");
  a.href=cv.toDataURL("image/png");
  a.download=`${state.name||"角色卡"}_LimbusTRPG.png`;
  a.click();
  toast("已导出图片");
}

/* ============ 工具 ============ */
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
const sinName = (k) => k?SIN_LABELS[k]:"—";

/* ============ 存档迁移：已废弃的技能选项 ============ */
/* 规则更新后文案/数值被替换的选项（sin, trait, level, 问题序号q, 选项序号o）。
   选项字母(A/B/C)的位置未变，仅内容被替换，因此用 q/o 索引定位。
   旧存档若命中以下组合，视为引用了已废弃的选项，读档时清空该问答并提示用户重选。 */
const DEPRECATED_OPTIONS = [
  {sin:"wrath", trait:"attack", level:"large", q:0, o:2},
  {sin:"gloom", trait:"attack", level:"small", q:0, o:2},
  {sin:"gloom", trait:"attack", level:"large", q:0, o:2},
  {sin:"gloom", trait:"attack", level:"large", q:2, o:1},
  {sin:"gloom", trait:"debuff", level:"small", q:0, o:0},
  {sin:"gloom", trait:"debuff", level:"small", q:0, o:1},
  {sin:"gloom", trait:"debuff", level:"small", q:1, o:0},
  {sin:"gloom", trait:"debuff", level:"small", q:1, o:1},
  {sin:"gloom", trait:"debuff", level:"small", q:1, o:2},
  {sin:"gloom", trait:"debuff", level:"large", q:0, o:0},
  {sin:"gloom", trait:"debuff", level:"large", q:0, o:1},
  {sin:"gloom", trait:"debuff", level:"large", q:1, o:0},
  {sin:"gloom", trait:"debuff", level:"large", q:1, o:1},
  {sin:"gloom", trait:"debuff", level:"large", q:1, o:2},
  {sin:"gloom", trait:"debuff", level:"large", q:2, o:0},
  {sin:"gloom", trait:"debuff", level:"large", q:2, o:1},
  {sin:"pride", trait:"attack", level:"small", q:0, o:1},
  {sin:"pride", trait:"attack", level:"large", q:0, o:1},
  // 「变招」原为「两次攻击可以使用不同的拼点属性」，拼点属性绑定攻击模式后改写
  {sin:"pride", trait:"multiAttack", level:"small", q:0, o:2},
  {sin:"pride", trait:"multiAttack", level:"large", q:0, o:2},
  // 怠惰·反击大技能改为爆发输出，第二问的「厚积薄发」与第三问整题被替换
  {sin:"sloth", trait:"counter", level:"large", q:1, o:0},
  {sin:"sloth", trait:"counter", level:"large", q:2, o:0},
  {sin:"sloth", trait:"counter", level:"large", q:2, o:1},
  {sin:"sloth", trait:"counter", level:"large", q:2, o:2},
  {sin:"envy", trait:"attack", level:"small", q:0, o:0},
  {sin:"envy", trait:"attack", level:"small", q:1, o:1},
  {sin:"envy", trait:"attack", level:"large", q:0, o:0},
  {sin:"envy", trait:"attack", level:"large", q:1, o:1},
  {sin:"envy", trait:"defense", level:"large", q:2, o:0},
  {sin:"envy", trait:"support", level:"small", q:1, o:1},
  {sin:"envy", trait:"support", level:"large", q:1, o:1},
];

/* 扫描两组卡片，清空命中已废弃选项的问答（不静默丢弃——记录下来供加载后提示） */
let deprecatedCardNotices = [];
function migrateDeprecatedCardAnswers(){
  deprecatedCardNotices = [];
  for(const gid of ["a","b"]){
    const g = state.cardGroups[gid];
    for(const sinKey of SIN_ORDER){
      const entry = g[sinKey];
      if(!entry || !entry.trait || !Array.isArray(entry.answers)) continue;
      const val = state.sins.values[sinKey];
      const level = val>=3?"large":val>=2?"small":"basic";
      DEPRECATED_OPTIONS
        .filter(d=>d.sin===sinKey && d.trait===entry.trait && d.level===level)
        .forEach(d=>{
          if(entry.answers[d.q]===d.o){
            entry.answers[d.q]=null;
            deprecatedCardNotices.push(`${gid==="a"?"A组":"B组"} · ${SIN_LABELS[sinKey]}·${TRAIT_LABELS[entry.trait]}·问题${d.q+1}`);
          }
        });
    }
  }
}

/* ============ 本地存储 ============ */
const STORAGE_KEY = "limbus-trpg-character";
function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      name:state.name, gender:state.gender, attrs:state.attrs, sins:state.sins,
      ego:state.ego,
      attackModes:state.attackModes, cardGroups:state.cardGroups,
      _ui:{current, sinSub, sinReaderIdx, cardSub, cardGroupIdx}
    }));
  }catch(e){/* localStorage 不可用（如 file:// 隐私模式）时静默忽略 */}
}
function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const d=JSON.parse(raw);
    if(d.name!=null) state.name=d.name;
    if(d.gender!=null) state.gender=d.gender;
    if(d.attrs) Object.assign(state.attrs,d.attrs);
    if(d.sins){
      state.sins=Object.assign(defaultSinProfile(),d.sins,{values:Object.assign(defaultSinProfile().values,d.sins.values||{})});
      delete state.sins.secondarySin;
      delete state.sins.rejectedSin;
      delete state.sins.manifestImpulse;
      delete state.sins.hiddenDesire;
      delete state.sins.coreConflict;
      const maxed=getMaxedSins(state.sins.values);
      if(maxed.length>1) state.sins.values[maxed[1]]=SIN_MAX-1;
      reconcileSinProfile();
    }
    // E.G.O：旧存档没有该字段时得到全新的默认档案（type:null），
    // 视为"尚未创建"，由 validateEgoProfile() 引导用户在 E.G.O 步骤补建，不报错、不静默丢弃。
    state.ego = Object.assign(defaultEgoProfile(), d.ego||{});
    if(state.ego.type && !EGO_TYPES[state.ego.type]){ state.ego.type=null; state.ego.answers=[]; }
    if(!Array.isArray(state.ego.answers)) state.ego.answers=[];
    reconcileEgoProfile();
    if(d.attackModes) state.attackModes=d.attackModes;
    if(d.cardGroups) state.cardGroups=d.cardGroups;
    reconcileCardGroups();
    migrateDeprecatedCardAnswers();
    if(d._ui){
      current=d._ui.current||0;
      sinSub=d._ui.sinSub||0;
      sinReaderIdx=d._ui.sinReaderIdx||0;
      cardSub=d._ui.cardSub||0;
      cardGroupIdx=d._ui.cardGroupIdx||0;
    }
  }catch(e){/* 解析失败则用默认状态 */}
}
/* 清空全部车卡数据，回到第一步。先删存档再 render()，render() 末尾的 saveState() 会写回默认值 */
function resetAll(){
  state.name=""; state.gender="";
  ATTR_DEFS.forEach(d=>state.attrs[d.key]=1);
  state.sins=defaultSinProfile();
  state.ego=defaultEgoProfile();
  state.attackModes=["",""];
  state.cardGroups={a:{},b:{}};
  sinSub=0; sinReaderIdx=0; cardSub=0; cardGroupIdx=0;
  egoTruncatedNotice=false;
  deprecatedCardNotices=[];
  removedTraitNotices=[];
  renderAttackMode._tab=0;
  current=0;
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){/* localStorage 不可用时忽略 */}
  render();
}
function confirmResetAll(){
  if(!confirm("确定要清空当前角色卡的全部内容、从头重新开始吗？\n此操作不可撤销，如需保留请先在「总览与导出」里导出 JSON。")) return;
  resetAll();
  toast("已清空，可以重新建卡");
}

let toastTimer=null;
function toast(msg){
  const t=document.getElementById("toast");
  t.textContent=msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"),1800);
}

/* ============ 导航按钮 ============ */
document.getElementById("btnReset").onclick=confirmResetAll;
btnBack.onclick=()=>{
  if(current===3 && sinSub>0){ sinSub--; render(); return; }
  if(current===6 && cardSub>0){ cardSub--; render(); return; }
  if(current>0){ current--; if(current===3) sinSub=SIN_SUBSTEPS.length-1; if(current===6) cardSub=CARD_SUBSTEPS.length-1; render(); }
};
btnNext.onclick=()=>{
  if(current===3){
    if(!canLeaveSinSub(sinSub)){ toast("请先完成当前步骤"); return; }
    if(sinSub<SIN_SUBSTEPS.length-1){ sinSub++; render(); return; }
    if(!canLeave(3)){ toast("罪孽档案尚未完成"); return; }
    current++; render(); return;
  }
  if(current===6){
    if(!canLeaveCardSub(cardSub)){ toast("请先完成当前步骤"); return; }
    if(cardSub<CARD_SUBSTEPS.length-1){ cardSub++; render(); return; }
    if(!canLeave(6)){ toast("卡片配置尚未完成"); return; }
    current++; render(); return;
  }
  if(!canLeave(current)){ toast("请先完成当前步骤"); return; }
  if(current<STEPS.length-1){
    current++;
    if(current===3) sinSub=0;
    if(current===6) cardSub=0;
    render();
  }
};

/* 启动 */
loadState();
const startupNotices = [];
if(removedTraitNotices.length){
  startupNotices.push(
    "以下特性已随规则更新被移除（怠惰的「防御」已改为「反击」），对应卡片需重新选择特性：\n"
    + removedTraitNotices.join("\n")
  );
}
if(deprecatedCardNotices.length){
  startupNotices.push(
    "以下技能问答引用了已随规则更新废弃的选项，已重置为待选：\n"
    + deprecatedCardNotices.join("\n")
  );
}
render();   // 迁移提示依赖 loadState 的结果，但要在渲染后才弹，避免挡住首屏
if(startupNotices.length){
  alert("检测到旧存档需要迁移，请前往「罪孽卡片」步骤重新选择：\n\n"+startupNotices.join("\n\n"));
}
