/* ============ Limbus Company TRPG 2.0 · 规则书与全词条速查 ============
   直接读取 建卡器.js 中的权威常量渲染，零重复规则文案。 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let curTab = "rules";
  let filterSin = "all";
  let filterCat = "all";
  let keyword = "";

  function renderRules() {
    $("viewRules").innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <h2>一、 全游戏唯一判定公式与日常检定</h2>
        <p class="lead">告别繁琐算术与小数乘除——无论日常调查还是战斗拼点，永远只投一颗 <b>1D6</b>。</p>
        <div class="attr-help">
          <b>核心公式：</b> <code>判定值 = 1D6 + 对应属性 + 修正值</code>，大等于目标难度（DC）或敌方意图威力即成功。
          <br>· <b>日常难度基准：</b> 简单 <b>DC 5</b> ｜ 标准 <b>DC 7</b> ｜ 困难 <b>DC 9</b> ｜ 极难 <b>DC 11</b>
          <br>· <b>主导罪孽优势：</b> 行动契合你的【主导罪孽】时，投 <code>2D6 取高 + 属性</code>（骰娘：<code>.r 2d6k1+属性</code>）
          <br>· <b>排斥罪孽劣势：</b> 触碰你的【排斥罪孽】盲区时，投 <code>2D6 取低 + 属性</code>（骰娘：<code>.r 2d6kl1+属性</code>），失败则罪孽压力 +1
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h2>二、 群聊四步战斗循环（同步排线，告别干等）</h2>
        <div class="grid2" style="margin-top:12px">
          <div class="sheet" style="margin:0">
            <h4>1. 亮牌与排线阶段</h4>
            <p style="font-size:13px;color:var(--muted);margin:0">
              · GM 公布敌方各部位状态与意图 <b>【威力 X / 伤害 Y】</b>。<br>
              · 全队商量并自由排定出手顺序（1号位→2号位→…）。<br>
              · <b>拉线拼点（一对一）：</b> 每条攻击意图最多由 1 人拉线接下（天然可替队友挡刀）。<br>
              · <b>单方面偷袭：</b> 攻击无空闲意图的敌人/部位，免拼点直接命中（造成基础伤+修正，无差值加伤）。<br>
              · 每个带罪孽技能立即往【公共罪孽池】<b>+1 对应碎片</b>；同回合全队打出 ≥2 同色触发<b>罪孽共鸣</b>！
            </p>
          </div>
          <div class="sheet" style="margin:0">
            <h4>2. 交锋与收尾阶段</h4>
            <p style="font-size:13px;color:var(--muted);margin:0">
              · <b>拼赢（我 &gt; 敌）：</b> 敌方意图击碎作废！造成 <code>基础伤 + min(差值, 3) + 词条/共鸣 + 弱耐</code>。<br>
              · <b>拼平（我 = 敌）：</b> 兵刃弹开，双方无伤，敌方意图同样作废。<br>
              · <b>拼输（我 &lt; 敌）：</b> 我方招式被破！承受 <code>敌方基础伤 + min(差值, 3)</code>，且<b>罪孽压力 +1</b>。<br>
              · <b>收尾：</b> 没人接线的敌方意图直接命中造成固定<code>敌方基础伤</code>；清空本轮护盾；二/三技能冷却推进。
            </p>
          </div>
        </div>

        <div class="sheet" style="margin-top:14px;margin-bottom:0">
          <h4>守备三姿态（无冷却，面对高威力杀招的救命解）</h4>
          <table class="sh">
            <tr><th>姿态</th><th>判定公式</th><th>战术效果</th></tr>
            ${Object.values(DEFENSE_TYPES).map(d => `<tr>
              <td style="white-space:nowrap"><b>【${d.label}】</b></td>
              <td style="white-space:nowrap;color:var(--accent-2)">${d.formula}</td>
              <td>${d.effect}</td>
            </tr>`).join("")}
          </table>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h2>三、 七大罪孽当回合共鸣表</h2>
        <p class="lead">同一回合内全队打出 <b>≥2 个同色技能</b>触发共鸣，<b>≥3 个</b>触发完全共鸣（回合末自动清零，零跨回合记账）。</p>
        <table class="sh">
          <tr><th>罪孽</th><th>2 同色【共鸣】</th><th>≥3 同色【完全共鸣】</th></tr>
          ${SIN_ORDER.map(s => `<tr>
            <td style="white-space:nowrap"><span class="sin-icon-inline">${sinIcon(s)}</span><b>${SIN_LABELS[s]}</b></td>
            <td>${SIN_RESONANCE[s].base}</td>
            <td style="color:var(--accent-2)"><b>${SIN_RESONANCE[s].full}</b></td>
          </tr>`).join("")}
        </table>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h2>四、 弱耐加减、混乱破防与满压侵蚀</h2>
        <div class="attr-help" style="margin:0">
          · <b>弱点与耐性（纯加减）：</b> 命中弱点伤害 <b>+2</b>（物理+罪孽双弱点即 +4）；命中耐性伤害 <b>-2</b>；非免疫攻击保底 <b>1</b> 点伤害。所有伤害先扣本回合护盾再扣 HP。<br>
          · <b>【混乱 (Stagger)】：</b> 任何单位本场战斗 HP <b>首次 ≤ 混乱线</b>（或异想体关键部位被破坏）时立即陷入【混乱】——当场取消其本回合剩余意图，且直到<b>下回合结束</b>无法行动、耐性失效、<b>受到的一切伤害 +3</b>！<br>
          · <b>罪孽压力与【E.G.O 侵蚀】：</b> 压力达到上限（<code>3+意志</code>）时标记【失控】。下回合若未装备 TETH+ 异想体 E.G.O 则陷入【恐慌】（停动一轮后清零）；若已装备异想体 E.G.O 则触发<b>【E.G.O 侵蚀】</b>——免费强制施放最高阶 E.G.O（伤害+3，投 1D6：<b>奇数轰敌人，偶数轰随机队友</b>），放完后压力归 0！
        </div>
      </div>

      <div class="card">
        <h2>五、 战役五阶成长与 GM 30秒配怪标尺</h2>
        <div class="sheet">
          <h4>罪人阶位晋升里程碑</h4>
          <table class="sh">
            <tr><th>危险等级</th><th>都市定位</th><th>属性上限</th><th>行动槽</th><th>晋升解锁内容</th></tr>
            ${RISK_ORDER.map(rk => `<tr>
              <td><span class="risk risk-${rk}">${rk}</span></td>
              <td style="white-space:nowrap">${RISK_TIERS[rk].rankText}</td>
              <td><b>${RISK_TIERS[rk].attrCap}</b></td>
              <td><b>${RISK_TIERS[rk].slots} 槽</b></td>
              <td>${RISK_TIERS[rk].unlockNote}</td>
            </tr>`).join("")}
          </table>
        </div>

        <div class="sheet" style="margin-bottom:0">
          <h4>GM 30秒配怪速查尺（设参战罪人总行动槽数为 S）</h4>
          <table class="sh">
            <tr><th>等级</th><th>杂兵 HP</th><th>精英 HP</th><th>异想体双部位 HP</th><th>平砍(威力/伤)</th><th>重击(威力/伤)</th><th>红光大招(威力/伤)</th></tr>
            ${RISK_ORDER.map(rk => {
              const g = GM_SCALE_TABLE[rk];
              return `<tr>
                <td><span class="risk risk-${rk}">${rk}</span></td>
                <td>${g.mobHp}</td>
                <td>${g.eliteHpPerS} × S</td>
                <td>躯干 ${g.bossBodyPerS}×S + 部位 ${g.bossPartPerS}×S</td>
                <td>${g.light[0]} / ${g.light[1]}</td>
                <td>${g.heavy[0]} / ${g.heavy[1]}</td>
                <td style="color:var(--danger)"><b>${g.ult[0]} / ${g.ult[1]}</b></td>
              </tr>`;
            }).join("")}
          </table>
        </div>
      </div>
    `;
  }

  function collectAllItems() {
    const out = [];
    for (const sin of SIN_ORDER) {
      const tb = SIN_TRAITS[sin];
      tb.light.forEach(x => out.push({ sin, sinLabel: SIN_LABELS[sin], cat: "light", catLabel: "一技能·轻词条", name: x.label, desc: x.effect }));
      tb.core.forEach(x => out.push({ sin, sinLabel: SIN_LABELS[sin], cat: "core", catLabel: "二/三技能·核心词条", name: x.label, desc: x.effect }));
      tb.ace.forEach(x => out.push({ sin, sinLabel: SIN_LABELS[sin], cat: "ace", catLabel: "三技能·王牌词条", name: x.label, desc: x.effect }));
      tb.passive.forEach(x => out.push({ sin, sinLabel: SIN_LABELS[sin], cat: "passive", catLabel: "Ⅱ阶同期·人格被动", name: x.label, desc: x.effect }));
      tb.egoZayin.forEach(x => out.push({ sin, sinLabel: SIN_LABELS[sin], cat: "ego", catLabel: "ZAYIN 本命 E.G.O 特效", name: x.name, desc: x.effect }));
    }
    for (const rk of ["TETH", "HE", "WAW"]) {
      (PRESET_EGOS[rk] || []).forEach(e => out.push({
        sin: e.sin, sinLabel: SIN_LABELS[e.sin], cat: "ego", catLabel: `${rk} 提取 E.G.O`,
        name: `${e.name}（${PHYS_MODES[e.mode].label} · 拼点+${e.clashBonus}/伤${e.baseDmg}）`,
        desc: `消耗 ${Object.entries(e.cost).map(([k, v]) => SIN_LABELS[k] + "×" + v).join("+")} · 压力+${e.pressureCost} ｜ ${e.effect}`
      }));
    }
    WORKSHOP_WEAPONS.filter(w => w.id !== "wp_none").forEach(w => out.push({
      sin: null, sinLabel: "通用改造", cat: "gear", catLabel: "通用武器改造", name: `${w.name} (${w.cost}安眼)`, desc: w.effect
    }));
    EGO_GIFTS.filter(g => g.id !== "gf_none").forEach(g => out.push({
      sin: null, sinLabel: "通用饰品", cat: "gear", catLabel: "战术饰品/消耗品", name: g.name, desc: g.effect
    }));
    return out;
  }

  function renderTraits() {
    const all = collectAllItems();
    const kw = keyword.trim().toLowerCase();
    const filtered = all.filter(it => {
      if (filterSin !== "all" && it.sin !== filterSin) return false;
      if (filterCat !== "all" && it.cat !== filterCat) return false;
      if (kw && !(it.name.toLowerCase().includes(kw) || it.desc.toLowerCase().includes(kw) || it.catLabel.toLowerCase().includes(kw))) return false;
      return true;
    });

    const cats = [
      { k: "all", lb: "全部类别" },
      { k: "light", lb: "轻词条" },
      { k: "core", lb: "核心词条" },
      { k: "ace", lb: "王牌词条" },
      { k: "passive", lb: "Ⅱ阶人格被动" },
      { k: "ego", lb: "全阶 E.G.O" },
      { k: "gear", lb: "武器与饰品" }
    ];

    $("viewTraits").innerHTML = `
      <div class="card">
        <div class="qa-filter-bar">
          <button class="qa-chip${filterSin === "all" ? " on" : ""}" data-fsin="all">全部罪孽</button>
          ${SIN_ORDER.map(s => `<button class="qa-chip${filterSin === s ? " on" : ""}" data-fsin="${s}">${SIN_LABELS[s]}</button>`).join("")}
        </div>
        <div class="qa-filter-bar">
          ${cats.map(c => `<button class="qa-chip${filterCat === c.k ? " on" : ""}" data-fcat="${c.k}">${c.lb}</button>`).join("")}
          <input type="text" id="inKw" placeholder="输入关键词搜索（如：护盾、混乱、无视耐性、恢复…）" value="${esc(keyword)}" style="flex:1;min-width:200px;padding:6px 10px">
        </div>
        <p class="hint" style="margin-bottom:12px">共匹配 <b>${filtered.length}</b> 条（全部词条在战斗器中均为 100% 自动结算）</p>
        <table class="sh">
          <tr><th>归属</th><th>类别</th><th>名称</th><th>效果说明</th></tr>
          ${filtered.map(it => `<tr>
            <td style="white-space:nowrap">${it.sin ? `<span class="sin-icon-inline">${sinIcon(it.sin)}</span>` : ""}<b>${esc(it.sinLabel)}</b></td>
            <td style="white-space:nowrap"><span class="ptag mute">${esc(it.catLabel)}</span></td>
            <td style="white-space:nowrap;color:var(--accent-2)"><b>${esc(it.name)}</b></td>
            <td>${esc(it.desc)}</td>
          </tr>`).join("")}
        </table>
      </div>
    `;

    $("viewTraits").querySelectorAll("[data-fsin]").forEach(b => b.onclick = () => { filterSin = b.dataset.fsin; renderTraits(); });
    $("viewTraits").querySelectorAll("[data-fcat]").forEach(b => b.onclick = () => { filterCat = b.dataset.fcat; renderTraits(); });
    const inKw = $("inKw");
    inKw.oninput = () => {
      keyword = inKw.value;
      const pos = inKw.selectionStart;
      renderTraits();
      const nextIn = $("inKw");
      nextIn.focus();
      nextIn.setSelectionRange(pos, pos);
    };
  }

  function syncTabs() {
    $("tabRules").className = curTab === "rules" ? "btn primary" : "btn";
    $("tabTraits").className = curTab === "traits" ? "btn primary" : "btn";
    $("viewRules").hidden = curTab !== "rules";
    $("viewTraits").hidden = curTab !== "traits";
    if (curTab === "rules") renderRules(); else renderTraits();
  }

  $("tabRules").onclick = () => { curTab = "rules"; syncTabs(); };
  $("tabTraits").onclick = () => { curTab = "traits"; syncTabs(); };

  syncTabs();
})();
