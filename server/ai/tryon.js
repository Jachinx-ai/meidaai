/* ============================================================
   AI 能力 ②：虚拟试穿（tryon）
   ------------------------------------------------------------
   输入 req：{ modelImage: "data:...;base64," | null,   模特照片
               items: [ { id, category, image } ] }     要穿上身的衣服
   输出    ：{ image: "data:...;base64," | null }       生成的上身效果照
             image=null 时前端自动用叠图兜底。

   本地 AI 效果流程统一只用 OpenRouter · GPT Image 2。
   ============================================================ */

const { OPENROUTER_API_KEY, MODELS } = require("./config");
const { generateImageFromImages } = require("./openrouter");

const isReal = (img) => typeof img === "string" && img.startsWith("data:");

function pickGarments(items) {
  const top = items.find(i => isReal(i.image) && (i.category === "上衣" || i.category === "连体裙"));
  const bottom = items.find(i => isReal(i.image) && i.category === "下装");
  const shoes = items.find(i => isReal(i.image) && i.category === "鞋子");
  return [top, bottom && !(top && top.category === "连体裙") ? bottom : null, shoes].filter(Boolean);
}

function tryonPrompt(garments) {
  const lines = garments.map((item, idx) => `${idx + 2}. ${item.category}：${item.name || "用户选择的单品"}`).join("\n");
  return `你是虚拟试穿图像生成模型。输入图片中，第 1 张是用户模特照片，后面的图片是要试穿的服装单品。

参考图片顺序：
1. 用户模特照片
${lines}

请生成一张真实自然的虚拟试穿效果图：
- 保留第 1 张照片里人物的身份特征、脸部、发型、体型、姿态、身体比例和背景构图
- 将后续服装单品自然穿到人物身上；上衣穿在上身，下装穿在下身，鞋子穿在脚上
- 服装颜色、材质、版型、显著细节尽量忠实参考单品图
- 不要生成商品平铺图，不要生成拼图，不要出现多个人，不要出现文字、水印、按钮、界面元素
- 不要改变人物性别、年龄、脸、发型或姿态，不要过度美颜
- 输出一张完整的真人试穿照片，画面自然、清晰、可用于产品里的试穿结果`;
}

module.exports = async function tryon(req) {
  if (!req || !Array.isArray(req.items)) throw new Error("缺少 items 参数");

  const garments = pickGarments(req.items);
  if (!OPENROUTER_API_KEY || !isReal(req.modelImage) || !garments.length) {
    return { image: null };
  }

  try {
    const refs = [req.modelImage, ...garments.map(i => i.image)];
    const image = await generateImageFromImages(
      MODELS.tryon,
      tryonPrompt(garments),
      refs,
      { timeoutMs: 240000 }
    );
    return { image };
  } catch (e) {
    console.warn("GPT Image 2 试穿生成失败，回退叠图:", e.message);
    return { image: null };
  }
};
