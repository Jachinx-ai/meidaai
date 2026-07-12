/* ============================================================
   邮箱验证码登录（无密码，登录即注册）
   POST /api/auth/send-code { email }        → { ok, devCode? }
   POST /api/auth/login     { email, code }  → { token, email }

   邮件服务：接入阿里云邮件推送/腾讯云 SES 时，实现下方 sendMail()
   并在 .env 设 MAIL_CONFIGURED=1；未配置时验证码随响应直发（devCode），
   前端会明示"演示直发"，方便没有邮件服务密钥时全流程可用。

   存储：用户表存 server/data/users.json，验证码存进程内存。
   上 Vercel（serverless，无持久文件系统/内存不跨请求）时，
   把 loadUsers/saveUsers 和 codes 换成 Upstash 等 KV 的 REST 调用即可，
   token 本身是无状态 HMAC 签名，不需要会话表。
   ============================================================ */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");

const router = express.Router();

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
/* 上线前在 .env 里设置 AUTH_SECRET=一串随机字符，别用默认值 */
const SECRET = process.env.AUTH_SECRET || "meida-dev-secret";

const CODE_TTL = 5 * 60_000;      // 验证码 5 分钟有效
const SEND_GAP = 60_000;          // 同邮箱 60 秒内只发一次（服务端防连点）
const TOKEN_TTL = 30 * 24 * 3600_000; // 登录态 30 天

/* ---------- 用户表（文件版） ---------- */
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); }
  catch { return {}; }
}
function saveUsers(users) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/* ---------- 验证码（内存） ---------- */
const codes = new Map(); // email → { code, exp, lastSent }

const isEmail = s => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/* 邮件发送占位：接真实服务时替换实现（阿里云邮件推送约 ¥2/千封，有免费额度） */
async function sendMail(email, code) {
  throw new Error("邮件服务未接入");
}

router.post("/api/auth/send-code", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: "邮箱格式不正确" });

  const rec = codes.get(email);
  if (rec && Date.now() - rec.lastSent < SEND_GAP) {
    return res.status(429).json({ error: "发送太频繁，请一分钟后再试" });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  codes.set(email, { code, exp: Date.now() + CODE_TTL, lastSent: Date.now() });

  if (process.env.MAIL_CONFIGURED) {
    try {
      await sendMail(email, code);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: "验证码发送失败，请稍后再试" });
    }
  }
  /* 未配置邮件服务：验证码直发给前端，仅供开发/演示 */
  console.log(`[auth] 演示直发验证码 ${email} → ${code}`);
  res.json({ ok: true, devCode: code });
});

router.post("/api/auth/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const code = String(req.body.code || "").trim();
  if (!isEmail(email)) return res.status(400).json({ error: "邮箱格式不正确" });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "请输入 6 位数字验证码" });

  const rec = codes.get(email);
  if (!rec || rec.exp < Date.now()) return res.status(400).json({ error: "验证码已过期，请重新获取" });
  if (rec.code !== code) return res.status(400).json({ error: "验证码不正确" });
  codes.delete(email);

  const users = loadUsers();
  if (!users[email]) users[email] = { email, createdAt: new Date().toISOString() };
  users[email].lastLoginAt = new Date().toISOString();
  saveUsers(users);

  res.json({ token: signToken(email), email });
});

/* ---------- 无状态 token：base64(email).过期时间.HMAC ---------- */
function signToken(email) {
  const payload = `${Buffer.from(email).toString("base64url")}.${Date.now() + TOKEN_TTL}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}
/* 校验 token → 返回 email 或 null（给后续需要登录态的接口用） */
function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [b64, exp, sig] = parts;
  const expect = crypto.createHmac("sha256", SECRET).update(`${b64}.${exp}`).digest("hex");
  if (sig.length !== expect.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  if (+exp < Date.now()) return null;
  return Buffer.from(b64, "base64url").toString();
}

module.exports = { router, verifyToken };
