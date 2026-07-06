/* 一次性工具：给 assets/real 里的所有单品图批量打标签 → server/tools/labels.json
   运行：node server/tools/tag-items.js   （需要 server/.env 里有 OPENROUTER_API_KEY）
   已打过的会跳过（增量），中断可重跑。 */

const fs = require("fs");
const path = require("path");
const { MODELS } = require("../ai/config");
const { chat, imageMessage, parseJson } = require("../ai/openrouter");
const { TAG_PROMPT, mapScene } = require("../ai/prompts");

const REAL = path.join(__dirname, "../../assets/real");
const OUT = path.join(__dirname, "labels.json");
const CONCURRENCY = 6;

const files = fs.readdirSync(REAL)
  .filter(f => /^(f|m)-(daily|work|date|travel)-\d{2}-(top|bottom|shoes|dress)\.(png|jpg)$/.test(f));

const labels = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

async function tagFile(f) {
  const id = f.replace(/\.(png|jpg)$/, "");
  if (labels[id]) return;
  const mime = f.endsWith(".png") ? "png" : "jpeg";
  const img = `data:image/${mime};base64,${fs.readFileSync(path.join(REAL, f)).toString("base64")}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await chat(MODELS.vision, imageMessage(TAG_PROMPT, img), { timeoutMs: 60000 });
      const r = parseJson(text);
      labels[id] = {
        "类别": r["类别"] || "不确定",
        "颜色": r["颜色"] || "不确定",
        "适用场景": mapScene(r["适用场景"]),
        "风格": r["风格"] || "不确定",
        "置信度": r["置信度"] || "低",
      };
      return;
    } catch (e) {
      if (attempt === 1) console.log("失败:", id, e.message.slice(0, 80));
    }
  }
}

(async () => {
  const queue = [...files];
  let done = 0;
  async function worker() {
    while (queue.length) {
      await tagFile(queue.shift());
      done++;
      if (done % 20 === 0) {
        fs.writeFileSync(OUT, JSON.stringify(labels, null, 1));
        console.log(`进度 ${done}/${files.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  fs.writeFileSync(OUT, JSON.stringify(labels, null, 1));
  console.log(`完成：${Object.keys(labels).length}/${files.length} 件已打标签`);
})();
