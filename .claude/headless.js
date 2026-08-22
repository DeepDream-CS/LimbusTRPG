/* 无头加载 建卡器.js，然后执行指定脚本。
   用途：校验 stats schema、生成导出 JSON、批量检查题库——不用开浏览器。

   用法：node .claude/headless.js 你的脚本.js
   脚本里可以直接用 state / buildData() / getSinQA() / SIN_TRAIT_QA / cardBaseStats() 等，
   因为它被拼接到 建卡器.js 之后同作用域执行。

   原理：建卡器.js 顶层就要访问 document，所以用一个「对任何属性都返回自身」的 Proxy 做桩，
   让所有 DOM 调用静默通过。它不渲染任何东西，只是让模块能加载完。 */
const fs = require("fs"), path = require("path"), os = require("os");

const stub = () => new Proxy(function () {}, {
  get(_, k) {
    if (k === "querySelectorAll") return () => [];
    if (k === "querySelector" || k === "getElementById" || k === "createElement") return () => stub();
    if (k === "classList") return { add() {}, remove() {}, contains() { return false; } };
    if (k === "dataset" || k === "style") return {};
    if (k === "length") return 0;
    if (k === Symbol.toPrimitive) return () => "";
    return stub();
  },
  set() { return true; },
  apply() { return stub(); }
});

global.document = stub();
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.alert = () => {};
global.confirm = () => false;
global.Blob = class {};
global.URL = { createObjectURL: () => "", revokeObjectURL() {} };

const script = process.argv[2];
if (!script) {
  console.error("用法: node .claude/headless.js <脚本.js>");
  process.exit(1);
}
const root = path.join(__dirname, "..");
const combined = path.join(os.tmpdir(), "limbus-headless.js");
fs.writeFileSync(combined,
  fs.readFileSync(path.join(root, "建卡器.js"), "utf8") + "\n" +
  fs.readFileSync(path.resolve(script), "utf8"));
require(combined);
