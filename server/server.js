/* ============================================================
   美搭 · 轻量后端
   职责：1) 托管前端页面  2) 提供三个 AI 能力接口
   三个 AI 能力都在 server/ai/ 目录里，每个能力一个文件，
   现在是占位实现，后续把选定的模型 API 填进对应文件即可，
   前端一行代码都不用改。
   启动：cd server && npm install && npm start
   访问：http://localhost:8394/login.html
   ============================================================ */

const express = require("express");
const path = require("path");

const segment = require("./ai/segment");
const tryon = require("./ai/tryon");
const recommend = require("./ai/recommend");
const validate = require("./ai/validate");
const store = require("./store");
const supa = require("./supabase");
const { verifyToken } = require("./auth");

const app = express();
const PORT = process.env.PORT || 8394;

/* 图片以 base64 传输，放宽请求体上限（Vercel 平台另有 4.5MB 硬上限） */
app.use(express.json({ limit: "30mb" }));

/* ---------- 公开部署防护：登录门槛 + 每日配额 ----------
   只挡「花钱的」生成类接口；浏览/收藏/搭配推荐等便宜能力游客可用。 */

/* 登录门槛：要求 Authorization: Bearer <登录发的 HMAC token> */
function requireLogin(req, res, next) {
  const email = verifyToken((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  if (!email) return res.status(401).json({ error: "请先登录后使用 AI 功能" });
  req.userEmail = email;
  next();
}

/* Serverless 保活：Vercel 上响应发出后函数会被冻结，未 await 的后台 promise
   （埋点写库、拆分任务）可能来不及跑完就被杀。用 @vercel/functions 的 waitUntil
   把它们登记为"响应后仍要完成"。本地无此依赖时是普通后台 promise，行为不变。 */
let vercelWaitUntil = null;
try { ({ waitUntil: vercelWaitUntil } = require("@vercel/functions")); } catch { /* 本地无此依赖，正常 */ }
function keepAlive(promise) {
  const p = Promise.resolve(promise).catch(() => {});
  if (vercelWaitUntil) { try { vercelWaitUntil(p); } catch { /* 非函数环境 */ } }
  return p;
}

/* ---------- 埋点：后端权威事件（即发即走，绝不阻塞主流程）----------
   关键结果类事件（登录/生成成功失败/配额拦截）在后端记，比前端可靠：
   用户中途关页面也不漏，还能和计费口径对齐。写入 Supabase events 表，
   未配库时 supa.insertEvent 抛错被吞、静默跳过。session_id 由前端经 X-Sid 头带上。
   用 keepAlive 包住：Vercel 上响应发出后写库仍能跑完，不丢事件。 */
function logEvent(event, ctx, props = {}) {
  try {
    if (!supa.enabled) return;
    keepAlive(supa.insertEvent({ event, ...ctx, props }));
  } catch { /* 埋点永不影响业务 */ }
}
/* 从请求里取上下文（登录接口用） */
function track(event, req, props = {}) {
  logEvent(event, {
    email: req.userEmail || null,
    session_id: (req.headers["x-sid"] || "").slice(0, 64) || null,
    page: (req.headers["x-page"] || "").slice(0, 64) || null,
    ua: req.headers["user-agent"],
  }, props);
}

/* 每日配额：按 账号+日期 计数，环境变量 QUOTA_SPLIT_PER_DAY / QUOTA_TRYON_PER_DAY 可调，0=不限 */
function quota(kind, defPerDay) {
  const label = { SPLIT: "拆图", TRYON: "试穿" }[kind] || kind;
  return async (req, res, next) => {
    const limit = process.env[`QUOTA_${kind}_PER_DAY`] !== undefined
      ? +process.env[`QUOTA_${kind}_PER_DAY`] : defPerDay;
    if (!limit) return next();
    const day = new Date().toISOString().slice(0, 10);
    try {
      const n = await store.incr(`quota:${kind}:${req.userEmail}:${day}`, 26 * 3600);
      if (n > limit) {
        track("quota_block", req, { kind, limit });   /* 撞每日额度上限：付费意愿信号 */
        return res.status(429).json({ error: `今日${label}额度已用完（每天 ${limit} 次），明天再来吧` });
      }
    } catch (e) {
      console.warn("配额计数失败（本次放行）:", e.message);
    }
    next();
  };
}

/* ---------- AI 能力接口 ---------- */

/* 健康检查：前端用它判断后端是否在线 */
app.get("/api/health", (req, res) => res.json({ ok: true }));

/* 邮箱验证码登录（发码/登录，详见 server/auth.js） */
app.use(require("./auth").router);

/* ---------- 轻量用户资料云端同步（Supabase，仅登录用户）----------
   pull：登录后拉回该账号云端资料（换设备/清缓存后找回）
   push：本地轻量数据变化后存回云端
   未配 Supabase 时返回 disabled，前端静默跳过（纯 localStorage 行为不变） */
app.post("/api/state/pull", requireLogin, async (req, res) => {
  if (!supa.enabled) return res.json({ state: null, disabled: true });
  try {
    const row = await supa.getState(req.userEmail);
    res.json({ state: row ? row.state : null, updatedAt: row ? row.updated_at : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/state/push", requireLogin, async (req, res) => {
  if (!supa.enabled) return res.json({ ok: false, disabled: true });
  try {
    await supa.saveState(req.userEmail, req.body.state || {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* 照片质检：创建模特前判断照片是否合格 */
app.post("/api/validate-photo", async (req, res) => {
  try {
    res.json(await validate(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* 抠图：上传衣服照片 → 返回抠好图的衣服（同步版，离线回退/兼容用） */
app.post("/api/segment", requireLogin, quota("SPLIT", 5), async (req, res) => {
  try {
    res.json(await segment(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* 拆图分步版（单件重试/离线兜底用）：先识别出清单，再逐件生成 */
app.post("/api/detect", requireLogin, quota("SPLIT", 5), async (req, res) => {
  try {
    res.json(await segment.detect(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/segment-one", requireLogin, async (req, res) => {
  try {
    res.json(await segment.segmentOne(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- 拆分任务队列（上传拆分后台化 · 逐件粒度）----------
   提交即返回任务号，识别与逐件生成在服务端继续跑，用户可离开页面；
   result 返回逐件状态（pending/running/done/fail）供前端进度卡渲染，单件失败可 retry。

   任务状态存 store（server/store.js）：本地/自购服务器=进程内存，Vercel=Upstash。
   键设计（Upstash 单请求 1MB 上限，图片必须拆开存）：
     segjob:{id}          元信息（状态+逐件清单，不含任何图）
     segjob:{id}:img      原照片
     segjob:{id}:item:{i} 第 i 件的生成结果（含平铺图）
   30 分钟 TTL 自动清理（原内存版的定时清扫由 TTL 取代）。
   Serverless 下响应返回后靠 waitUntil 保活把任务跑完（@vercel/functions）；
   本地没装该依赖时回退普通后台 promise，行为与旧版一致。
   并发：每任务内限 2（原全局限 2；serverless 实例间本就无法全局限流，
   多任务同时撞 DashScope 限流由 segment.js 的退避重试兜底）。 */

function bgRun(promise) {
  keepAlive(promise.catch(e => console.warn("拆分任务后台异常:", e.message)));
}

const SEG_TTL = 1800;   // 秒：任务全家桶键的保留时长
let segJobSeq = 0;
const jobKey = id => `segjob:${id}`;
const imgKey = id => `segjob:${id}:img`;
const itemKey = (id, i) => `segjob:${id}:item:${i}`;

/* 元信息读改写按任务串行（同一任务的两个 worker 都在本实例内），防互相覆盖 */
const metaLocks = new Map();
function updateMeta(jobId, mutate) {
  const prev = metaLocks.get(jobId) || Promise.resolve();
  const next = prev.then(async () => {
    const meta = await store.get(jobKey(jobId));
    if (!meta) return null;                  // 已过期/被清
    mutate(meta);
    meta.ts = Date.now();
    await store.set(jobKey(jobId), meta, SEG_TTL);
    return meta;
  });
  metaLocks.set(jobId, next.then(() => {}, () => {}));
  return next;
}

/* 生成一件：状态推进 running → done/fail，成品图单独落 key */
async function processOne(jobId, image, target, i) {
  await updateMeta(jobId, m => { if (m.targets[i]) m.targets[i].state = "running"; });
  try {
    const r = await segment.segmentOne({
      image,
      target: { category: target.category, description: target.description },
      strict: true,   // 有密钥但生成失败→标 fail 给前端重试，不塞原图
    });
    await store.set(itemKey(jobId, i), r.item, SEG_TTL);
    await updateMeta(jobId, m => { if (m.targets[i]) m.targets[i].state = "done"; });
  } catch (e) {
    await updateMeta(jobId, m => {
      if (m.targets[i]) { m.targets[i].state = "fail"; m.targets[i].error = e.message; }
    });
  }
}

/* 整任务：识别 → 逐件生成（任务内并发 2）。ctx=提交者上下文，供埋点用 */
async function processJob(jobId, image, ctx = {}) {
  let targets;
  try {
    ({ items: targets } = await segment.detect({ image }));
  } catch (e) {
    logEvent("split_fail", ctx, { stage: "detect", error: (e.message || "").slice(0, 200) });
    await updateMeta(jobId, m => { m.status = "error"; m.error = e.message; });
    metaLocks.delete(jobId);
    return;
  }
  const meta = await updateMeta(jobId, m => {
    m.targets = targets.map(t => ({ category: t.category, description: t.description, state: "pending" }));
    m.status = "running";
  });
  if (!meta) { metaLocks.delete(jobId); return; }
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const i = next++;
      await processOne(jobId, image, targets[i], i);
    }
  };
  await Promise.all([worker(), worker()]);
  /* 整单尘埃落定：识别出几件、其中几件生成失败，一条事件涵盖（不逐件刷屏） */
  const done = await store.get(jobKey(jobId));
  const failed = (done && done.targets || []).filter(t => t.state === "fail").length;
  logEvent("split_done", ctx, { items: targets.length, failed });
  metaLocks.delete(jobId);
}

/* 提交拆分任务：立即返回 jobId；后台先识别，再逐件生成 */
app.post("/api/segment/start", requireLogin, quota("SPLIT", 5), async (req, res) => {
  if (!req.body || !req.body.image) return res.status(400).json({ error: "缺少 image 参数" });
  const jobId = `seg_${Date.now()}_${++segJobSeq}`;
  try {
    await store.set(jobKey(jobId), { status: "detecting", ts: Date.now(), targets: [] }, SEG_TTL);
    await store.set(imgKey(jobId), req.body.image, SEG_TTL);
  } catch (e) {
    return res.status(500).json({ error: "任务创建失败：" + e.message });
  }
  const ctx = {
    email: req.userEmail || null,
    session_id: (req.headers["x-sid"] || "").slice(0, 64) || null,
    ua: req.headers["user-agent"],
  };
  bgRun(processJob(jobId, req.body.image, ctx));
  res.json({ jobId });
});

/* 查询任务进度/结果：
   入参 got=[已取走的件下标]，对应件不再重复回传 base64（轮询省流量）。
   status: detecting / running / done(全部尘埃落定) / error(识别失败) / missing(过期或部署重启丢失) */
app.post("/api/segment/result", async (req, res) => {
  try {
    const meta = await store.get(jobKey(req.body.jobId));
    if (!meta) return res.json({ status: "missing" });
    if (meta.status === "error") return res.json({ status: "error", error: meta.error });
    const got = new Set(req.body.got || []);
    const targets = await Promise.all((meta.targets || []).map(async (t, i) => ({
      category: t.category,
      description: t.description,
      state: t.state,
      item: t.state === "done" && !got.has(i)
        ? (await store.get(itemKey(req.body.jobId, i)) || undefined) : undefined,
      error: t.state === "fail" ? t.error : undefined,
    })));
    const settled = meta.status === "running" && targets.length
      && targets.every(t => t.state === "done" || t.state === "fail");
    res.json({ status: settled ? "done" : meta.status, targets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* 单件重试：把 fail 的一件重新跑 */
app.post("/api/segment/retry", requireLogin, async (req, res) => {
  try {
    const { jobId, index } = req.body || {};
    const meta = await store.get(jobKey(jobId));
    const entry = meta && (meta.targets || [])[index];
    if (!entry) return res.json({ ok: false, status: "missing" });
    if (entry.state !== "fail") return res.json({ ok: false, status: entry.state });
    const image = await store.get(imgKey(jobId));
    if (!image) return res.json({ ok: false, status: "missing" });   // 原图已过期
    await updateMeta(jobId, m => {
      m.targets[index].state = "pending";
      delete m.targets[index].error;
    });
    bgRun(processOne(jobId, image, entry, index));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* 试穿：模特照片 + 衣服列表 → 返回上身效果 */
app.post("/api/tryon", requireLogin, quota("TRYON", 20), async (req, res) => {
  const itemCount = Array.isArray(req.body && req.body.items) ? req.body.items.length : 0;
  try {
    const out = await tryon(req.body);
    /* image 为空＝模型软失败（前端本地叠图兜底），也算一次失败计入漏斗 */
    track(out && out.image ? "tryon_done" : "tryon_fail", req, { itemCount });
    res.json(out);
  } catch (e) {
    track("tryon_fail", req, { itemCount, error: (e.message || "").slice(0, 200) });
    res.status(500).json({ error: e.message });
  }
});

/* 搭配推荐：衣橱清单（可指定围绕某件单品）→ 返回一套搭配 */
app.post("/api/recommend", async (req, res) => {
  try {
    res.json(await recommend(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- 埋点上报（前端 sendBeacon/keepalive 打点）----------
   公开接口（匿名 page_view 也要收）。立即回 200 不拖慢用户，异步落库。
   sendBeacon 发不了自定义头，email 从 body 带（best-effort，测试期够用）；
   带了 Authorization 则以校验出的 email 为准。未配 Supabase 时静默丢弃。 */
app.post("/api/track", (req, res) => {
  res.json({ ok: true });
  try {
    if (!supa.enabled) return;
    const b = req.body || {};
    if (!b.event || typeof b.event !== "string") return;
    const verified = verifyToken((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
    let props = b.props && typeof b.props === "object" ? b.props : {};
    if (JSON.stringify(props).length > 4000) props = {};   /* 防超大 props */
    logEvent(b.event.slice(0, 64), {
      email: verified || (typeof b.email === "string" ? b.email.slice(0, 120) : null),
      session_id: typeof b.session_id === "string" ? b.session_id.slice(0, 64) : null,
      page: typeof b.page === "string" ? b.page.slice(0, 64) : null,
      ua: req.headers["user-agent"],
    }, props);
  } catch { /* 埋点永不影响业务 */ }
});

/* ---------- 简易数据看板（内部用）----------
   GET /api/admin/stats?token=xxx&days=7 → 漏斗/DAU/事件汇总（Node 侧聚合）。
   用环境变量 ADMIN_TOKEN 做口令（未配=禁用，别裸奔行为数据）。 */
function computeStats(rows, days) {
  const today = new Date().toISOString().slice(0, 10);
  /* 匿名↔登录归因：登录后的事件天然同时带 email+session_id（前端从 Store 取邮箱），
     先扫一遍建 会话→邮箱 映射，再把登录前的匿名事件归到同一个人头上。
     查询时计算，天然追溯窗口内历史数据。同浏览器登多账号时取窗口内最近一次（rows 按 ts 降序）。 */
  const sidToEmail = {};
  for (const e of rows) {
    if (e.email && e.session_id && sidToEmail[e.session_id] === undefined) {
      sidToEmail[e.session_id] = e.email;
    }
  }
  const id = e => e.email || sidToEmail[e.session_id] || e.session_id || "?";
  const evtOf = {};                    // event → 次数
  const pageOf = {};                   // page → page_view 次数
  const dauSet = new Set(), wauSet = new Set();
  const quotaByKind = { SPLIT: 0, TRYON: 0 };
  let quotaTotal = 0;
  const c = { loginView: 0, login: 0, onboard: 0, tryonView: 0, tryonSubmit: 0, tryonDone: 0, splitSubmit: 0, splitDone: 0 };
  for (const e of rows) {
    evtOf[e.event] = (evtOf[e.event] || 0) + 1;
    const isToday = (e.ts || "").slice(0, 10) === today;
    wauSet.add(id(e));
    if (isToday) dauSet.add(id(e));
    if (e.event === "page_view") {
      const p = e.page || "?";
      pageOf[p] = (pageOf[p] || 0) + 1;
      if (p === "login.html") c.loginView++;
      if (p === "tryon.html") c.tryonView++;
    }
    if (e.event === "login_success") c.login++;
    if (e.event === "onboarding_done") c.onboard++;
    if (e.event === "tryon_submit") c.tryonSubmit++;
    if (e.event === "tryon_done") c.tryonDone++;
    if (e.event === "split_submit") c.splitSubmit++;
    if (e.event === "split_done") c.splitDone++;
    if (e.event === "quota_block") {
      quotaTotal++;
      const k = e.props && e.props.kind;
      if (k && quotaByKind[k] !== undefined) quotaByKind[k]++;
    }
  }
  const topPages = Object.entries(pageOf).sort((a, b) => b[1] - a[1]).map(([page, n]) => ({ page, n }));
  const events = Object.entries(evtOf).sort((a, b) => b[1] - a[1]).map(([event, n]) => ({ event, n }));
  const recent = rows.slice(0, 25).map(e => ({
    ts: e.ts, event: e.event, page: e.page,
    who: id(e) === e.session_id ? "游客·" + e.session_id.slice(0, 6) : id(e),   /* 归因后身份 */
  }));
  return {
    days, today, total: rows.length, dau: dauSet.size, wau: wauSet.size,
    funnels: {
      signup: [{ label: "登录页浏览", n: c.loginView }, { label: "登录成功", n: c.login }, { label: "完成引导", n: c.onboard }],
      tryon: [{ label: "进试穿页", n: c.tryonView }, { label: "发起试穿", n: c.tryonSubmit }, { label: "生成成功", n: c.tryonDone }],
      split: [{ label: "提交拆图", n: c.splitSubmit }, { label: "拆图完成", n: c.splitDone }],
    },
    quotaBlock: { total: quotaTotal, byKind: quotaByKind },
    topPages, events, recent,
  };
}
app.get("/api/admin/stats", async (req, res) => {
  const need = process.env.ADMIN_TOKEN;
  if (!need) return res.status(503).json({ error: "未配置 ADMIN_TOKEN，看板已禁用" });
  if (req.query.token !== need) return res.status(401).json({ error: "无权访问" });
  if (!supa.enabled) return res.json({ disabled: true });
  try {
    const days = Math.min(30, Math.max(1, +req.query.days || 7));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const rows = await supa.listEvents(since);
    res.json(computeStats(rows, days));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- 托管前端静态页面（项目根目录） ----------
   开发期禁用浏览器缓存：每次刷新都拿最新文件，避免手机看到旧版 */
app.use(express.static(path.join(__dirname, ".."), {
  setHeaders: (res) => res.setHeader("Cache-Control", "no-cache, must-revalidate"),
}));

/* 直接运行（本地/自购服务器）才监听端口；Vercel 上由 api/index.js 引入 app 走函数模式 */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`美搭已启动 → http://localhost:${PORT}/login.html（存储后端：${store.backend}）`);
    console.log(`手机访问：同一 Wi-Fi 下用「电脑IP:${PORT}/login.html」`);
  });
}
module.exports = app;
