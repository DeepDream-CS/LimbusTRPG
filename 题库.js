/* ============ 题库速查 ============
   只读页面：把七罪的卡片基础效果与全部技能问答平铺出来，带筛选与搜索。

   数据全部来自同页先加载的 建卡器.js（SIN_TRAIT_QA / CARD_BASE_STATS / …）——
   本文件一个字的规则文案都不复制，复制出来必然会和主库不同步。

   整个文件包在 IIFE 里：建卡器.js 有 150+ 个顶层声明（state / render / toast …），
   经典脚本共享全局词法环境，不隔离就会撞名。 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const LEVELS = ["basic", "small", "large"];
  const LEVEL_LABEL = { basic: "基础卡片", small: "小技能", large: "大技能" };
  /* 罪孽值 1/2/3 分别产出基础 / 小技能 / 大技能，与 sinCardLevel() 一致 */
  const LEVEL_VALUE = { basic: 1, small: 2, large: 3 };

  /* 自动化四档。判定顺序必须和战斗器的 qaStats() / qaPreview() 一致：
     onSwitchIn 的条目 stats 是 null，要先判它，否则会被误标成「需自行结算」。
     【切换】类现在也自动结算，只是触发点不同——战斗器在 setStance() 切进这一组时算，
     不是打出这张卡时（所以 qaStats() 必须排除它们）。单列一档是为了标明这个时机差异。 */
  const AUTO = {
    auto:   { label: "自动结算",   cls: "ok" },
    part:   { label: "部分自动",   cls: "warn" },
    manual: { label: "需自行结算", cls: "manual" },
    swi:    { label: "【切换】切进时自动", cls: "swi" }
  };
  const AUTO_ORDER = ["auto", "part", "manual", "swi"];
  function autoKindOf(opt) {
    if (opt.onSwitchIn) return "swi";      // 切进这一组时触发，不是打出时
    if (!opt.stats) return "manual";
    return opt.stats.partial ? "part" : "auto";
  }

  /* 某个罪孽能选的全部特性。不能用 getAvailableTraits()——那个读的是
     state.sins.values，是「当前这张角色卡」的，题库要的是全集。 */
  const traitsOf = (sin) => [...(SIN_TRAIT_OPTIONS[sin] || []),
                             ...Object.keys(SIN_CONDITIONAL_TRAITS[sin] || {})];
  /* 条件特性有点数门槛（暴食·特殊≥2、傲慢·多重攻击=3），够不着的等级不存在 */
  const hasLevel = (sin, trait, lv) =>
    (SIN_TRAIT_OPTIONS[sin] || []).includes(trait) ||
    (SIN_CONDITIONAL_TRAITS[sin]?.[trait] ?? 99) <= LEVEL_VALUE[lv];
  const gateOf = (sin, trait) => SIN_CONDITIONAL_TRAITS[sin]?.[trait] ?? 0;

  /* 同卡互斥（傲慢「连击」↔「灵活」）。数据里只在一边写 excludes，两边都要标出来，
     所以在这里对称展开。建卡器有一份答案驱动的同类展开（excludedOptions），那边要的是
     「当前已选把谁挡住了」，这边只需要静态的成对关系——声明仍然只有数据里那一处。 */
  function exclusionMap(qa) {
    const m = new Map();
    const add = (qi, oi, label) => {
      const k = `${qi}:${oi}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(label);
    };
    qa.forEach((q, qi) => q.options.forEach((o, oi) => (o.excludes || []).forEach(x => {
      const other = qa[x.q]?.options?.[x.o];
      if (!other) return;
      add(qi, oi, other.label);
      add(x.q, x.o, o.label);
    })));
    return m;
  }

  /* ---------- 摊平成一维卡片列表 ---------- */
  const cards = [];
  for (const sin of SIN_ORDER) {
    for (const trait of traitsOf(sin)) {
      for (const lv of LEVELS) {
        if (!hasLevel(sin, trait, lv)) continue;
        const baseText = lv === "basic" ? cardBaseEffect(trait, sin) : cardSkillBase(trait, sin, lv);
        const qa = getSinQA(sin, trait, lv);
        // 基础卡没有问答；若基础效果也是空的（数据里没这一档）就整块跳过
        if (!baseText && !qa.length) continue;
        cards.push({ sin, trait, lv, baseText, baseStats: cardBaseStats(trait, lv), qa,
                     ex: exclusionMap(qa) });
      }
    }
  }

  /* ---------- 统计 ---------- */
  const tally = { q: 0, opt: 0, auto: 0, part: 0, manual: 0, swi: 0 };
  for (const c of cards) {
    tally.q += c.qa.length;
    for (const q of c.qa) for (const o of q.options) { tally.opt++; tally[autoKindOf(o)]++; }
  }

  /* ---------- 渲染 ---------- */
  const pct = (n) => tally.opt ? Math.round(n / tally.opt * 100) + "%" : "0%";

  $("qaSummary").innerHTML = `
    <div class="qa-sum">
      <span class="qa-sum-main"><b>${cards.length}</b> 张卡 · <b>${tally.q}</b> 问 · <b>${tally.opt}</b> 个选项</span>
      ${AUTO_ORDER.map(k => `<span class="qa-tag ${AUTO[k].cls}">${AUTO[k].label} ${tally[k]}（${pct(tally[k])}）</span>`).join("")}
      <span class="qa-hit" id="qaHit"></span>
    </div>`;

  const chip = (group, val, label) =>
    `<button class="qa-chip on" data-group="${group}" data-val="${esc(val)}">${esc(label)}</button>`;

  const ALL_TRAITS = [...new Set(SIN_ORDER.flatMap(traitsOf))];
  $("qaFilters").innerHTML = `
    <div class="qa-filters">
      <div class="qa-frow"><span class="qa-flab">罪孽</span>
        ${SIN_ORDER.map(s => chip("sin", s, SIN_LABELS[s])).join("")}</div>
      <div class="qa-frow"><span class="qa-flab">特性</span>
        ${ALL_TRAITS.map(t => chip("trait", t, TRAIT_LABELS[t])).join("")}</div>
      <div class="qa-frow"><span class="qa-flab">等级</span>
        ${LEVELS.map(l => chip("lv", l, LEVEL_LABEL[l])).join("")}</div>
      <div class="qa-frow"><span class="qa-flab">自动化</span>
        ${AUTO_ORDER.map(k => chip("auto", k, AUTO[k].label)).join("")}
        <span class="qa-fnote">按自动化筛选时，只留下含该类选项的卡片</span></div>
      <div class="qa-frow"><span class="qa-flab">搜索</span>
        <input type="search" id="qaSearch" class="qa-search" placeholder="问题、选项名或效果文本…">
        <button class="btn ghost mini" id="qaReset">重置筛选</button></div>
    </div>`;

  /* 攻击类的基础效果导出的是 baseDamage / hits，不进 CARD_BASE_STATS，
     所以三个等级都得先认出来——否则小技能与大技能的攻击卡会被误标成「需自行结算」。 */
  const ATTACK_TRAITS = new Set(["attack", "multiAttack"]);
  const baseTag = (c) => {
    if (ATTACK_TRAITS.has(c.trait)) return `<span class="qa-tag ok">自动结算</span>`;
    if (!c.baseText) return "";
    return c.baseStats ? `<span class="qa-tag ok">自动结算</span>`
                       : `<span class="qa-tag manual">需自行结算</span>`;
  };

  $("qaList").innerHTML = cards.map((c, ci) => `
    <div class="card qa-card" data-ci="${ci}">
      <div class="qa-head">
        <span class="sin-icon-inline">${sinIcon(c.sin)}</span>
        <b>${SIN_LABELS[c.sin]} · ${TRAIT_LABELS[c.trait]}</b>
        <span class="qa-lv">${LEVEL_LABEL[c.lv]}</span>
        ${gateOf(c.sin, c.trait) ? `<span class="qa-tag gate">需${SIN_LABELS[c.sin]} ≥ ${gateOf(c.sin, c.trait)}</span>` : ""}
      </div>
      <div class="qa-base"><span class="qa-base-lab">基础效果</span>
        <span class="qa-base-txt">${esc(c.baseText) || "—"}</span>${baseTag(c)}</div>
      ${c.qa.map((q, qi) => `
        <div class="qa-q">
          <div class="qa-qt">${qi + 1}. ${esc(q.question)}</div>
          ${q.options.map((o, oi) => {
            const k = autoKindOf(o);
            const ex = c.ex.get(`${qi}:${oi}`) || [];
            return `<div class="qa-opt" data-auto="${k}">
              <b>${esc(o.label)}</b>
              <span class="qa-eff">${esc(o.effect)}</span>
              ${ex.length ? `<span class="qa-tag gate">与「${ex.map(esc).join("」「")}」互斥</span>` : ""}
              <span class="qa-tag ${AUTO[k].cls}">${AUTO[k].label}</span>
            </div>`;
          }).join("")}
        </div>`).join("")}
    </div>`).join("");

  /* ---------- 筛选 ---------- */
  // 每张卡的可搜索文本预先拼好，免得每次输入都重新遍历数据
  const haystack = cards.map(c => [
    SIN_LABELS[c.sin], TRAIT_LABELS[c.trait], LEVEL_LABEL[c.lv], c.baseText,
    ...c.qa.flatMap(q => [q.question, ...q.options.flatMap(o => [o.label, o.effect])])
  ].join(" ").toLowerCase());
  const autoKinds = cards.map(c =>
    new Set(c.qa.flatMap(q => q.options.map(autoKindOf))));

  const active = { sin: new Set(SIN_ORDER), trait: new Set(ALL_TRAITS),
                   lv: new Set(LEVELS), auto: new Set(AUTO_ORDER) };
  let keyword = "";

  function apply() {
    const nodes = $("qaList").children;
    let shown = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      // 自动化筛选看的是「这张卡有没有该类选项」；没有问答的基础卡不参与这一项
      const autoOk = !c.qa.length || [...autoKinds[i]].some(k => active.auto.has(k));
      const ok = active.sin.has(c.sin) && active.trait.has(c.trait) && active.lv.has(c.lv)
        && autoOk && (!keyword || haystack[i].includes(keyword));
      nodes[i].hidden = !ok;
      if (ok) shown++;
    }
    $("qaHit").textContent = shown === cards.length ? "" : `· 当前显示 ${shown} 张`;
  }

  $("qaFilters").querySelectorAll("[data-group]").forEach(el => el.onclick = () => {
    const set = active[el.dataset.group], v = el.dataset.val;
    if (set.has(v)) { set.delete(v); el.classList.remove("on"); }
    else { set.add(v); el.classList.add("on"); }
    apply();
  });
  $("qaSearch").oninput = () => { keyword = $("qaSearch").value.trim().toLowerCase(); apply(); };
  $("qaReset").onclick = () => {
    Object.entries({ sin: SIN_ORDER, trait: ALL_TRAITS, lv: LEVELS, auto: AUTO_ORDER })
      .forEach(([g, all]) => { active[g] = new Set(all); });
    keyword = ""; $("qaSearch").value = "";
    $("qaFilters").querySelectorAll("[data-group]").forEach(el => el.classList.add("on"));
    apply();
  };
})();
