/* ============================================================
   AI 能力 ③：搭配推荐（recommend）
   ------------------------------------------------------------
   输入 req：{ wardrobe: [ { id, category, custom } ],   衣橱全部衣服（custom=true 是用户上传的）
               around: "id" | null }                     围绕某件单品搭配（衣橱「去搭配」传入）
   输出    ：{ items: [ "id", ... ] }                    一套搭配的衣服 id 列表

   ★★ 模型替换位置 ★★
   把下面的规则占位实现换成真实推荐模型（或大语言模型）的调用即可，例如：
     const resp = await fetch("https://模型服务商/v1/chat", { ... 把衣橱清单发给模型，让它返回搭配 ... });
   密钥放环境变量（RECOMMEND_API_KEY），不要写死在代码里。
   ============================================================ */

const pick = (list) => list[Math.floor(Math.random() * list.length)];

module.exports = async function recommend(req) {
  const wardrobe = (req && req.wardrobe) || [];
  if (!wardrobe.length) return { items: [], mock: true };

  /* 同分类里优先选用户自己上传的衣服 */
  const byCat = (cat, excludeId) => {
    const pool = wardrobe.filter((i) => i.category === cat && i.id !== excludeId);
    const mine = pool.filter((i) => i.custom);
    const list = mine.length ? mine : pool;
    return list.length ? pick(list).id : null;
  };

  /* —— 占位实现：规则搭配（上衣+下装+鞋 或 连体裙+鞋），围绕单品时补齐缺的分类 —— */
  let items;
  const around = req.around ? wardrobe.find((i) => i.id === req.around) : null;

  if (around) {
    const need = {
      上衣: ["下装", "鞋子"],
      下装: ["上衣", "鞋子"],
      连体裙: ["鞋子"],
      鞋子: Math.random() > 0.3 ? ["上衣", "下装"] : ["连体裙"],
    }[around.category] || [];
    items = [around.id, ...need.map((c) => byCat(c, around.id))];
  } else {
    items = Math.random() > 0.3
      ? [byCat("上衣"), byCat("下装"), byCat("鞋子")]
      : [byCat("连体裙"), byCat("鞋子")];
  }

  return { items: items.filter(Boolean), mock: true };
};
