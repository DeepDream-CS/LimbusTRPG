/* ============ 鉴定器 ============
   规则与建卡器一致：
     普通鉴定 —— 反复投 1D2，出 1 记一次成功，出 2 消耗一次试错机会。
                 难度 = 需要凑够的成功数；试错次数 = 所用属性的等级。
     优势（核心罪孽）—— 每次投掷有两次机会，任一为 1 即算成功。
     劣势（排斥罪孽）—— 每次成功需要投出两个 1，等效于难度翻倍。
   checkOdds() 与 建卡器.js 中的同名函数保持一致，改动时两边要一起改。 */

const ATTRS = ["力量","灵巧","体魄","认知","意志","共感"];
const SIN_ORDER = ["wrath","lust","sloth","gluttony","gloom","pride","envy"];
const SIN_LABELS = {wrath:"暴怒",lust:"色欲",sloth:"怠惰",gluttony:"暴食",gloom:"忧郁",pride:"傲慢",envy:"嫉妒"};
const SIN_CLASS  = {wrath:"sin-wrath",lust:"sin-lust",sloth:"sin-sloth",gluttony:"sin-gluttony",
                    gloom:"sin-gloom",pride:"sin-pride",envy:"sin-envy"};
const CHECK_MODES = {
  normal:{label:"普通", p:0.5,  mul:1},
  adv:   {label:"优势", p:0.75, mul:1},
  dis:   {label:"劣势", p:0.5,  mul:2}
};
const STORAGE_KEY = "limbus-trpg-character";   // 与建卡器共用，便于直接读档
const MAX_REJECTED = 4;                        // 劣势罪孽上限

const state = {
  attrs:{力量:1,灵巧:1,体魄:1,认知:1,意志:1,共感:1},
  core:null,            // 核心罪孽 → 优势
  rejected:[],          // 排斥罪孽 → 劣势
  kind:"normal",        // normal = 普通鉴定 / sin = 罪孽鉴定
  attr:"意志",
  sin:null,
  dc:1,
  history:[]
};

/* ---------- 概率 ---------- */
/* 等价于「在 需成功数 + 试错次数 - 1 次投掷中至少成功 需成功数 次」 */
function checkOdds(attr, dc, mode="normal"){
  const m = CHECK_MODES[mode] || CHECK_MODES.normal;
  const need = dc * m.mul, n = need + attr - 1;
  if(attr < 1 || need < 1) return 0;
  const comb=(a,k)=>{let r=1;for(let i=0;i<k;i++) r=r*(a-i)/(i+1);return r;};
  let s=0;
  for(let k=need;k<=n;k++) s += comb(n,k)*Math.pow(m.p,k)*Math.pow(1-m.p,n-k);
  return s;
}
const pct = (x)=>Math.round(x*100)+"%";

/* 当前这次鉴定用哪种模式：只有罪孽鉴定才吃优势/劣势 */
function currentMode(){
  if(state.kind!=="sin" || !state.sin) return "normal";
  if(state.sin===state.core) return "adv";
  if(state.rejected.includes(state.sin)) return "dis";
  return "normal";
}

/* ---------- 投掷 ---------- */
const coin = ()=> (Math.random()<0.5 ? 1 : 2);

function rollCheck(attr, dc, mode){
  const m = CHECK_MODES[mode];
  const need = dc * m.mul;
  let ones = 0, fails = 0;
  const log = [];
  while(ones < need && fails < attr){
    let coins = [coin()];
    // 优势：第一次没出 1 时再给一次机会
    if(mode==="adv" && coins[0]!==1) coins.push(coin());
    const hit = coins.includes(1);
    if(hit) ones++; else fails++;
    log.push({coins, hit, ones, fails});
  }
  return {pass: ones>=need, ones, fails, need, log};
}

/* ---------- 渲染 ---------- */
const $ = (id)=>document.getElementById(id);

function renderSetup(){
  // 六项属性
  $("attrEdit").innerHTML = ATTRS.map(k=>`
    <div class="srow">
      <span class="sk">${k}</span>
      <span class="stepper" style="gap:6px">
        <button data-attr="${k}" data-d="-1" ${state.attrs[k]<=1?"disabled":""}>−</button>
        <span class="val" style="font-size:16px">${state.attrs[k]}</span>
        <button data-attr="${k}" data-d="1" ${state.attrs[k]>=5?"disabled":""}>+</button>
      </span>
    </div>`).join("");
  $("attrEdit").querySelectorAll("button").forEach(b=>b.onclick=()=>{
    const k=b.dataset.attr;
    state.attrs[k]=Math.max(1,Math.min(5,state.attrs[k]+ +b.dataset.d));
    renderAll();
  });

  // 核心罪孽：单选，再点一次取消
  $("coreCount").textContent = state.core ? "已选 1 / 1" : "未选";
  $("coreEdit").innerHTML = SIN_ORDER.map(k=>
    `<span class="sinchip ${SIN_CLASS[k]}${state.core===k?" on":""}" data-core="${k}">${SIN_LABELS[k]}</span>`).join("");
  $("coreEdit").querySelectorAll("[data-core]").forEach(el=>el.onclick=()=>{
    const k=el.dataset.core;
    state.core = state.core===k ? null : k;           // 单选：选中别的会自动顶掉原来的
    state.rejected = state.rejected.filter(x=>x!==k); // 不能同时是优势和劣势
    renderAll();
  });

  // 排斥罪孽：多选，上限 MAX_REJECTED，再点一次取消
  const rejFull = state.rejected.length >= MAX_REJECTED;
  $("rejCount").textContent = `已选 ${state.rejected.length} / ${MAX_REJECTED}`;
  $("rejEdit").innerHTML = SIN_ORDER.map(k=>{
    const on = state.rejected.includes(k);
    // 已满时把未选中的置灰，让上限一眼可见
    return `<span class="sinchip ${SIN_CLASS[k]}${on?" on":(rejFull?" full":"")}" data-rej="${k}">${SIN_LABELS[k]}</span>`;
  }).join("");
  $("rejEdit").querySelectorAll("[data-rej]").forEach(el=>el.onclick=()=>{
    const k=el.dataset.rej;
    if(state.rejected.includes(k)){ state.rejected=state.rejected.filter(x=>x!==k); }
    else if(state.rejected.length>=MAX_REJECTED){ toast(`劣势罪孽最多 ${MAX_REJECTED} 个`); return; }
    else { state.rejected.push(k); if(state.core===k) state.core=null; }
    renderAll();
  });
}

function renderPicker(){
  $("kindRow").innerHTML =
    `<div class="opt ${state.kind==="normal"?"sel":""}" data-kind="normal">普通鉴定</div>
     <div class="opt ${state.kind==="sin"?"sel":""}" data-kind="sin">罪孽鉴定</div>`;
  $("kindRow").querySelectorAll(".opt").forEach(el=>el.onclick=()=>{
    state.kind=el.dataset.kind; renderAll();
  });

  $("attrRow").innerHTML = ATTRS.map(k=>
    `<div class="opt ${state.attr===k?"sel":""}" data-attr="${k}">${k}<br><small style="color:var(--muted)">${state.attrs[k]}</small></div>`).join("");
  $("attrRow").querySelectorAll(".opt").forEach(el=>el.onclick=()=>{
    state.attr=el.dataset.attr; renderAll();
  });

  $("sinField").style.display = state.kind==="sin" ? "" : "none";
  $("sinRow").innerHTML = SIN_ORDER.map(k=>{
    const tag = k===state.core ? "优势" : state.rejected.includes(k) ? "劣势" : "普通";
    return `<span class="sinchip ${SIN_CLASS[k]}${state.sin===k?" on":""}" data-sin="${k}">${SIN_LABELS[k]}<small>${tag}</small></span>`;
  }).join("");
  $("sinRow").querySelectorAll("[data-sin]").forEach(el=>el.onclick=()=>{
    state.sin = state.sin===el.dataset.sin ? null : el.dataset.sin;
    renderAll();
  });

  $("dcRow").innerHTML = [1,2,3,4,5].map(d=>
    `<div class="opt ${state.dc===d?"sel":""}" data-dc="${d}">${d}</div>`).join("");
  $("dcRow").querySelectorAll(".opt").forEach(el=>el.onclick=()=>{
    state.dc=+el.dataset.dc; renderAll();
  });
}

function renderPreview(){
  const mode = currentMode(), m = CHECK_MODES[mode];
  const attr = state.attrs[state.attr];
  const need = state.dc * m.mul;
  const why = mode==="adv" ? `核心罪孽「${SIN_LABELS[state.sin]}」→ 每次投掷两次机会`
            : mode==="dis" ? `排斥罪孽「${SIN_LABELS[state.sin]}」→ 每次成功需要两个 1`
            : state.kind==="sin" && state.sin ? `「${SIN_LABELS[state.sin]}」既非核心也非排斥`
            : state.kind==="sin" ? "尚未选择罪孽" : "不考校罪孽";
  $("preview").innerHTML = `
    <b>${m.label}鉴定</b> · ${state.attr}(${attr}) · 难度 ${state.dc}
    <br>${why}
    <br>需要凑够 <b>${need}</b> 次成功，最多可失败 <b>${attr}</b> 次
    <br>理论通过率 <b style="color:var(--accent-2);font-size:16px">${pct(checkOdds(attr,state.dc,mode))}</b>`;
}

function renderResult(r, mode){
  const m = CHECK_MODES[mode];
  const steps = r.log.map((s,i)=>`
    <div class="roll-step">
      <span class="roll-idx">${i+1}</span>
      ${s.coins.map(c=>`<span class="coin ${c===1?"hit":"miss"}">${c}</span>`).join("")}
      <span class="roll-tally">成功 ${s.ones}/${r.need} · 已失败 ${s.fails}</span>
    </div>`).join("");
  $("result").innerHTML = `
    <div class="sheet" style="margin-top:18px">
      <h4>${m.label}鉴定 · ${state.attr}(${state.attrs[state.attr]}) · 难度 ${state.dc}</h4>
      <div class="roll-log">${steps}</div>
      <div class="roll-verdict ${r.pass?"pass":"fail"}">${r.pass?"✔ 通过":"✕ 失败"}
        <small>共投 ${r.log.length} 次 · 成功 ${r.ones}/${r.need} · 失败 ${r.fails}/${state.attrs[state.attr]}</small>
      </div>
    </div>`;
}

function renderHistory(){
  if(!state.history.length){ $("history").innerHTML=`<p class="empty">还没有投过。</p>`; return; }
  $("history").innerHTML = `<table class="sh auto">
    <tr><td style="color:var(--muted)">鉴定</td><td style="color:var(--muted)">结果</td><td style="color:var(--muted)">明细</td></tr>
    ${state.history.map(h=>`<tr>
      <td>${h.mode} · ${h.attr}(${h.attrVal}) · 难度${h.dc}</td>
      <td style="color:${h.pass?"var(--ok)":"var(--danger)"}">${h.pass?"通过":"失败"}</td>
      <td style="color:var(--muted)">成功 ${h.ones}/${h.need} · 失败 ${h.fails} · 通过率 ${h.odds}</td>
    </tr>`).join("")}</table>`;
}

function renderAll(){ renderSetup(); renderPicker(); renderPreview(); renderHistory(); }

/* ---------- 交互 ---------- */
$("btnRoll").onclick = ()=>{
  if(state.kind==="sin" && !state.sin){ toast("请先选择考校的罪孽"); return; }
  const mode = currentMode();
  const attrVal = state.attrs[state.attr];
  const r = rollCheck(attrVal, state.dc, mode);
  renderResult(r, mode);
  state.history.unshift({
    mode:CHECK_MODES[mode].label, attr:state.attr, attrVal, dc:state.dc,
    pass:r.pass, ones:r.ones, need:r.need, fails:r.fails,
    odds:pct(checkOdds(attrVal,state.dc,mode))
  });
  state.history = state.history.slice(0,20);
  renderHistory();
};
$("btnClearLog").onclick = ()=>{ state.history=[]; $("result").innerHTML=""; renderHistory(); };
$("btnClearSins").onclick = ()=>{ state.core=null; state.rejected=[]; renderAll(); toast("已清空优势 / 劣势"); };

/* 直接读建卡器存在 localStorage 里的角色 */
$("btnLoad").onclick = ()=>{
  let d=null;
  try{ d = JSON.parse(localStorage.getItem(STORAGE_KEY)||"null"); }catch(e){}
  if(!d){ toast("没有找到建卡器的存档"); return; }
  if(d.attrs) ATTRS.forEach(k=>{ if(d.attrs[k]) state.attrs[k]=d.attrs[k]; });
  state.core = d.sins?.coreSin || null;
  state.rejected = [...(d.sins?.rejectedSins||[])].slice(0, MAX_REJECTED);
  renderAll();
  toast(`已读取${d.name?`「${d.name}」`:"存档"}`);
};

let toastTimer=null;
function toast(msg){
  const t=$("toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"),1800);
}

renderAll();
