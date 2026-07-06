/* 一次性工具：扫描 assets/real 素材 + labels.json → 生成 js/data.js
   运行：node server/tools/build-data.js
   素材有增减或重新打标签后重跑即可；不要手改 js/data.js 的 ITEMS/OUTFITS。 */

const fs = require("fs");
const path = require("path");

const REAL = path.join(__dirname, "../../assets/real");
const LABELS = JSON.parse(fs.readFileSync(path.join(__dirname, "labels.json"), "utf8"));
const OUT = path.join(__dirname, "../../js/data.js");

const SCENE_CN = { daily: "日常", work: "通勤", date: "约会", travel: "旅行" };
const CAT_CN = { top: "上衣", bottom: "下装", shoes: "鞋子", dress: "连体裙" };
const PH = { top: "tee", bottom: "pants", shoes: "sneaker", dress: "dress" };
const ORDER = { dress: 0, top: 1, bottom: 2, shoes: 3 };

const files = fs.readdirSync(REAL)
  .filter(f => /^(f|m)-(daily|work|date|travel)-\d{2}-(top|bottom|shoes|dress)\.(png|jpg)$/.test(f));

const items = [];
const outfitMap = new Map();

for (const f of files.sort()) {
  const m = f.match(/^((f|m)-(daily|work|date|travel)-(\d{2}))-(top|bottom|shoes|dress)\./);
  const [, outfit, gender, scene, , part] = m;
  const id = f.replace(/\.(png|jpg)$/, "");
  const lb = LABELS[id] || null;
  const name = lb && lb["颜色"] !== "不确定" && lb["类别"] !== "不确定"
    ? `${lb["颜色"]}${lb["类别"]}`
    : (lb && lb["类别"] !== "不确定" ? lb["类别"] : `${SCENE_CN[scene]}${CAT_CN[part]}`);
  items.push({ id, name, cat: CAT_CN[part], gender, scene: SCENE_CN[scene], ph: PH[part], labels: lb });

  if (!outfitMap.has(outfit)) outfitMap.set(outfit, { gender, scene, parts: [] });
  outfitMap.get(outfit).parts.push({ part, id });
}

const outfits = [];
for (const [oid, o] of [...outfitMap.entries()].sort()) {
  const cats = new Set(o.parts.map(p => p.part));
  const complete = (cats.has("dress") && cats.has("shoes")) ||
                   (cats.has("top") && cats.has("bottom") && cats.has("shoes"));
  if (!complete) { console.log("跳过缺件的搭配:", oid, [...cats]); continue; }
  const ids = o.parts.sort((a, b) => ORDER[a.part] - ORDER[b.part]).map(p => p.id);
  const num = oid.slice(-2);
  outfits.push({ id: oid, name: `${SCENE_CN[o.scene]}搭配 ${num}`, scene: SCENE_CN[o.scene], gender: o.gender, items: ids });
}

/* 新用户默认衣橱：女生/男生各取日常前两套的单品 */
const starterOutfits = ["f-daily-01", "f-daily-02", "m-daily-01", "m-daily-02"];
const starter = items.filter(i => starterOutfits.some(s => i.id.startsWith(s + "-"))).map(i => i.id);

const gen = `/* ============ 产品数据（由 server/tools/build-data.js 自动生成，勿手改） ============
   素材：assets/real/（命名规范见 素材命名规范.md）
   标签：server/tools/labels.json（node server/tools/tag-items.js 生成）
   重新生成：node server/tools/build-data.js */

const ITEMS = ${JSON.stringify(items, null, 0).replace(/\},\{/g, "},\n{")};

const CATS = ["全部", "上衣", "下装", "鞋子", "连体裙"];

const SCENES = [
  { key: "全部", icon: "✨" },
  { key: "通勤", icon: "💼" },
  { key: "约会", icon: "🌹" },
  { key: "旅行", icon: "🧳" },
  { key: "日常", icon: "☀️" },
  { key: "其他", icon: "🏷️" },
];

const OUTFITS = ${JSON.stringify(outfits, null, 0).replace(/\},\{/g, "},\n{")};

/* 新用户默认衣橱（女生/男生日常各两套的单品） */
const STARTER_WARDROBE = ${JSON.stringify(starter)};

/* 预设虚拟模特：产品定义只有一个默认款，不可切换其他虚拟模特 */
const PRESET_MODELS = [
  { id: "m1", name: "默认模特", shape: "" },
];

const JOBS = {
  "学生": ["高中生", "大学生"],
  "职业": ["教师 / 教授", "软件工程师", "设计师", "产品经理", "创意工作者",
          "市场营销", "咨询", "律师", "投资银行从业者", "人力资源",
          "护士 / 医疗从业者", "自由职业者", "创业者", "公务员",
          "全职父母", "退休人员", "其他"],
};
`;

fs.writeFileSync(OUT, gen);
console.log(`已生成 js/data.js：${items.length} 件单品，${outfits.length} 套搭配，默认衣橱 ${starter.length} 件`);
