/* 读取 server/.env 里的密钥（.env 不进 git）。
   格式：每行 KEY=VALUE。系统环境变量优先。 */

const fs = require("fs");
const path = require("path");

(function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    txt.split("\n").forEach((line) => {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    });
  } catch { /* 没有 .env 时静默，走占位实现 */ }
})();

const GPT_IMAGE_2 = "openai/gpt-5.4-image-2";

module.exports = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",

  /* 本地 AI 效果流程统一只用 GPT Image 2，避免多模型结果风格漂移 */
  MODELS: {
    qc: GPT_IMAGE_2,            // 模型1 照片质检
    vision: GPT_IMAGE_2,        // 模型2第1步 穿着识别 + 模型3 打标签
    flatImage: GPT_IMAGE_2,     // 模型2第2步 平铺图生成
    tryon: GPT_IMAGE_2,         // 模型4 试穿生成
    recommend: GPT_IMAGE_2,     // 模型5 搭配推荐
  },
};
