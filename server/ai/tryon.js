/* ============================================================
   AI 能力 ②：虚拟试穿（tryon）
   ------------------------------------------------------------
   输入 req：{ modelImage: "data:image/...;base64," | null,   模特照片（null = 用默认模特）
               items: [ { id, category, image } ] }           要穿上身的衣服列表
   输出    ：{ image: "data:image/...;base64," | null }       AI 生成的上身效果照
             image 为 null 时，前端会用「衣服叠放在模特图上」的本地合成兜底展示。

   ★★ 模型替换位置 ★★
   把下面的占位实现换成真实试穿生成模型的调用即可，例如：
     const resp = await fetch("https://模型服务商/v1/tryon", {
       method: "POST",
       headers: { Authorization: `Bearer ${process.env.TRYON_API_KEY}` },
       body: JSON.stringify({ person: req.modelImage, garments: req.items.map(i => i.image) }),
     });
     const data = await resp.json();
     return { image: data.resultImage };
   密钥放环境变量（TRYON_API_KEY），不要写死在代码里。
   ============================================================ */

module.exports = async function tryon(req) {
  if (!req || !Array.isArray(req.items)) throw new Error("缺少 items 参数");

  /* —— 占位实现：不生成图片，返回 null，前端自动用本地叠图合成兜底 ——
     真实模型接入后：返回 { image: 生成的上身效果图 } */
  return { image: null, mock: true };
};
