/* ============================================================
   AI 能力 ①：衣物抠图（segment）
   ------------------------------------------------------------
   输入 req：{ image: "data:image/jpeg;base64,..." }   用户拍的/相册选的衣服照片
   输出    ：{ image: "data:image/png;base64,...",     抠好图的衣服（理想是透明底 PNG）
               items: [ { image, category } ]          若一张图里有多件衣服，模型应拆分成多件
             }

   ★★ 模型替换位置 ★★
   把下面的占位实现换成真实抠图模型的调用即可，例如：
     const resp = await fetch("https://模型服务商/v1/segment", {
       method: "POST",
       headers: { Authorization: `Bearer ${process.env.SEGMENT_API_KEY}` },
       body: JSON.stringify({ image: req.image }),
     });
     const data = await resp.json();
     return { image: data.cutoutImage, items: data.items };
   密钥放环境变量（SEGMENT_API_KEY），不要写死在代码里。
   ============================================================ */

module.exports = async function segment(req) {
  if (!req || !req.image) throw new Error("缺少 image 参数");

  /* —— 占位实现：不做真实抠图，原图直接返回 ——
     真实模型接入后：返回透明底抠图；多件衣服拆分成 items 数组 */
  return {
    image: req.image,
    items: [{ image: req.image, category: "上衣" }],
    mock: true,
  };
};
