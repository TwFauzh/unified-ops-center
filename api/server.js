const { getServerResources, sendCommand, getAccount, setPower } = require("./ptero");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const {
  upsertUserPteroConfig,
  getUserPteroAuth,
  getUserPteroConfig,
  getUserPteroMeta,
} = require("./userPteroStore");
const { getState, trySetMaintenance, setWhitelistState, getWhitelistState } = require("./maintenanceState");
const dgram = require("dgram");
const axios = require("axios");

const app = express();

function isValidPanelUrl(panelUrl) {
  try {
    const parsed = new URL(panelUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function maskEmail(email) {
  const value = String(email || "");
  if (!value.includes("@")) return "Email 格式錯誤";
  const [user, domain] = value.split("@");
  if (!user || !domain) return "Email 格式錯誤";

  const prefix = user.slice(0, 2);
  const suffix = user.slice(-1);
  const middleCount = Math.max(user.length - 3, 0);
  const maskedUser = `${prefix}${"*".repeat(middleCount)}${suffix}`;
  return `${maskedUser}@${"*".repeat(domain.length)}`;
}

async function sendDiscordEmbed({ title, descriptionLines, operator, isMaintenance, color }) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const defaultChannelId = process.env.DISCORD_CHANNEL_ID;
  const announceChannelId = process.env.DISCORD_CHANNEL_ID_ANNOUNCE || defaultChannelId;
  const maintenanceChannelId = process.env.DISCORD_CHANNEL_ID_MAINT || defaultChannelId;

  if (!token) throw new Error("缺少 DISCORD_BOT_TOKEN");
  if (!announceChannelId && !maintenanceChannelId) {
    throw new Error("缺少 Discord 頻道 ID");
  }

  const channelId = isMaintenance ? maintenanceChannelId : announceChannelId;
  if (!channelId) throw new Error("未設定符合此公告類型的 Discord 頻道");

  const embed = {
    author: { name: "LLS 伺服器維護系統" },
    title,
    description: descriptionLines.join("\n") || " ",
    color,
    footer: { text: `發布者：${maskEmail(operator)}` },
    timestamp: new Date().toISOString(),
  };

  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
  const resp = await axios.post(
    url,
    { embeds: [embed] },
    {
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );

  return resp.data;
}

app.use((req, res, next) => {
  console.log("[REQ]", req.method, req.url);
  next();
});
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

// --- Firebase Admin init ---
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountPath) {
  throw new Error("缺少 FIREBASE_SERVICE_ACCOUNT（請在 api/.env 設定）");
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

// --- Auth middleware ---
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);

    if (!match) {
      return res.status(401).json({ ok: false, error: "缺少登入憑證" });
    }

    const idToken = match[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
    };

    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "登入憑證無效或已過期" });
  }
}

async function requirePteroConfig(req, res, next) {
  try {
    const auth = await getUserPteroAuth(admin, req.user.uid);
    if (!auth?.token || !auth?.panelUrl || !auth?.serverId) {
      return res.status(412).json({
        ok: false,
        error: "尚未設定 Pterodactyl 連線資訊",
        code: "PTERO_CONFIG_NOT_SET",
      });
    }
    req.ptero = auth;
    next();
  } catch (e) {
    console.error("[PTERO CONFIG LOAD ERROR]", e);
    return res.status(500).json({ ok: false, error: "讀取 Pterodactyl 設定失敗" });
  }
}

// ===== Minecraft Query (UDP) - no extra libs =====
function mcQuery(host, port, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket("udp4");
    const sessionId = Buffer.from([0x01, 0x02, 0x03, 0x04]);

    const cleanup = (err, data) => {
      try {
        client.close();
      } catch {}
      if (err) reject(err);
      else resolve(data);
    };

    const timer = setTimeout(() => cleanup(new Error("MC_QUERY_TIMEOUT")), timeoutMs);

    const handshake = Buffer.concat([Buffer.from([0xfe, 0xfd, 0x09]), sessionId]);

    client.once("error", (e) => {
      clearTimeout(timer);
      cleanup(e);
    });

    client.once("message", (msg) => {
      const tokenStr = msg.toString("utf8", 5).trim().replace(/\0/g, "");
      const token = parseInt(tokenStr, 10);
      if (!Number.isFinite(token)) {
        clearTimeout(timer);
        return cleanup(new Error("MC_QUERY_BAD_TOKEN"));
      }

      const tokenBuf = Buffer.alloc(4);
      tokenBuf.writeInt32BE(token, 0);

      const statReq = Buffer.concat([Buffer.from([0xfe, 0xfd, 0x00]), sessionId, tokenBuf]);

      client.once("message", (msg2) => {
        clearTimeout(timer);

        const payload = msg2.slice(5).toString("utf8");
        const parts = payload.split("\0").filter(Boolean);

        const kv = {};
        for (let i = 0; i + 1 < parts.length; i += 2) {
          kv[parts[i]] = parts[i + 1];
        }

        const numplayers = Number(kv.numplayers ?? kv.numPlayers ?? 0);
        const maxplayers = Number(kv.maxplayers ?? kv.maxPlayers ?? 0);

        cleanup(null, {
          online: Number.isFinite(numplayers) ? numplayers : 0,
          max: Number.isFinite(maxplayers) ? maxplayers : 0,
          raw: kv,
        });
      });

      client.send(statReq, port, host, (err) => {
        if (err) {
          clearTimeout(timer);
          cleanup(err);
        }
      });
    });

    client.send(handshake, port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        cleanup(err);
      }
    });
  });
}

// --- Routes ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "lls-ops-center-api" });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get("/api/pterodactyl/config", requireAuth, async (req, res) => {
  const meta = await getUserPteroConfig(admin, req.user.uid);
  res.json({ ok: true, ...meta });
});

app.put("/api/pterodactyl/config", requireAuth, async (req, res) => {
  try {
    const panelUrl = String(req.body?.panelUrl || "").trim();
    const serverId = String(req.body?.serverId || "").trim();
    const apiKey = String(req.body?.apiKey || "").trim();

    if (!panelUrl) return res.status(400).json({ ok: false, error: "請填寫 Pterodactyl 面板網址" });
    if (!serverId) return res.status(400).json({ ok: false, error: "請填寫伺服器 ID" });
    if (!isValidPanelUrl(panelUrl)) {
      return res.status(400).json({ ok: false, error: "Pterodactyl 面板網址格式不正確" });
    }

    if (!apiKey) {
      const existing = await getUserPteroAuth(admin, req.user.uid);
      if (!existing?.token) {
        return res.status(400).json({ ok: false, error: "首次設定必須提供 API 金鑰" });
      }
    }

    const meta = await upsertUserPteroConfig(admin, req.user.uid, {
      apiKey: apiKey || undefined,
      panelUrl,
      serverId,
    });
    return res.json({ ok: true, ...meta });
  } catch (e) {
    console.error("[PTERO CONFIG PUT ERROR]", e);
    return res.status(500).json({ ok: false, error: e?.message || "儲存設定失敗" });
  }
});

app.get("/api/ptero-key", requireAuth, async (req, res) => {
  const meta = await getUserPteroMeta(admin, req.user.uid);
  res.json({ ok: true, ...meta });
});

app.put("/api/ptero-key", requireAuth, async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "請填寫 Pterodactyl API 金鑰" });

    const meta = await upsertUserPteroConfig(admin, req.user.uid, { apiKey: token });
    return res.json({ ok: true, ...meta });
  } catch (e) {
    console.error("[PTERO KEY PUT ERROR]", e);
    return res.status(500).json({ ok: false, error: e?.message || "儲存金鑰失敗" });
  }
});

app.post("/api/ptero-key/test", requireAuth, requirePteroConfig, async (req, res) => {
  try {
    const data = await getAccount(req.ptero.token, req.ptero.panelUrl);
    return res.json({ ok: true, account: data?.attributes || null });
  } catch (e) {
    const status = e?.response?.status || null;
    const detail = e?.response?.data || null;

    console.error("[PTERO KEY TEST ERROR]", status, detail || e);
    return res.status(400).json({
      ok: false,
      error: "金鑰測試失敗",
      debug: { httpStatus: status, detail },
    });
  }
});

app.post("/api/discord/announce", requireAuth, async (req, res) => {
  try {
    const { title, reason, message, remindKick } = req.body || {};
    const operator = req.user?.email || req.user?.uid || "未知使用者";

    const titleText = title || "系統公告";
    const descriptionLines = [];
    if (reason) descriptionLines.push(`${reason}`);
    if (message) descriptionLines.push(message);
    if (remindKick) descriptionLines.push("提醒：請玩家盡快下線，避免資料異常。");

    const embedColor = titleText.includes("緊急")
      ? 0xef4444
      : titleText.includes("維護")
      ? 0xf59e0b
      : titleText.includes("狀態")
      ? 0x3b82f6
      : 0x22c55e;
    const isMaintenance = titleText.includes("維護");

    const resp = await sendDiscordEmbed({
      title: titleText,
      descriptionLines,
      operator,
      isMaintenance,
      color: embedColor,
    });

    return res.json({ ok: true, discordMessageId: resp?.id || null });
  } catch (e) {
    const status = e?.response?.status || 500;
    const detail = e?.response?.data || null;
    console.error("[DISCORD ANNOUNCE ERROR]", status, detail || e);

    if (status === 401) return res.status(500).json({ ok: false, error: "Discord Bot Token 無效（401）" });
    if (status === 403) return res.status(500).json({ ok: false, error: "Discord Bot 權限不足（403）" });
    if (status === 404) return res.status(500).json({ ok: false, error: "Discord 頻道不存在（404）" });
    if (status === 429) return res.status(500).json({ ok: false, error: "Discord 發送過於頻繁（429）" });

    return res.status(500).json({ ok: false, error: "Discord 公告發送失敗", debug: { status, detail } });
  }
});

app.get("/api/discord/messages", requireAuth, async (req, res) => {
  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    const defaultChannelId = process.env.DISCORD_CHANNEL_ID;
    const announceChannelId = process.env.DISCORD_CHANNEL_ID_ANNOUNCE || defaultChannelId;
    const maintenanceChannelId = process.env.DISCORD_CHANNEL_ID_MAINT || defaultChannelId;
    const channelId = announceChannelId || maintenanceChannelId;

    if (!token) return res.status(500).json({ ok: false, error: "缺少 DISCORD_BOT_TOKEN" });
    if (!channelId) return res.status(500).json({ ok: false, error: "缺少 Discord 頻道 ID" });

    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 50);
    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`;

    const resp = await axios.get(url, {
      headers: { Authorization: `Bot ${token}` },
      timeout: 10000,
    });

    const messages = (resp.data || []).map((m) => ({
      id: m.id,
      author: m.author?.username || "未知使用者",
      avatar: m.author?.avatar
        ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
        : "",
      content: m.content || "",
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
    }));

    return res.json({ ok: true, messages });
  } catch (e) {
    const status = e?.response?.status || 500;
    const detail = e?.response?.data || null;
    console.error("[DISCORD MESSAGES ERROR]", status, detail || e);

    if (status === 401) return res.status(500).json({ ok: false, error: "Discord Bot Token 無效（401）" });
    if (status === 403) return res.status(500).json({ ok: false, error: "Discord Bot 權限不足（403）" });
    if (status === 404) return res.status(500).json({ ok: false, error: "Discord 頻道不存在（404）" });

    return res.status(500).json({ ok: false, error: "讀取 Discord 訊息失敗", debug: { status, detail } });
  }
});

app.get("/api/status", requireAuth, requirePteroConfig, async (req, res) => {
  try {
    const data = await getServerResources(req.ptero.serverId, req.ptero.token, req.ptero.panelUrl);

    const attr = data?.attributes;
    const state = attr?.current_state || "unknown";
    const r = attr?.resources || {};

    let playersOnline = null;
    let maxPlayers = null;

    try {
      const queryHost = process.env.MC_QUERY_HOST || "127.0.0.1";
      const queryPort = Number(process.env.MC_QUERY_PORT || 25565);

      const q = await mcQuery(queryHost, queryPort, 1200);
      playersOnline = q.online;
      maxPlayers = q.max;
    } catch (e) {
      console.log("[MC_QUERY] failed:", e.message);
    }

    res.json({
      ok: true,
      server: {
        status: state,
        playersOnline,
        maxPlayers,
      },
      stats: {
        cpu: r.cpu_absolute ?? null,
        memoryBytes: r.memory_bytes ?? null,
        diskBytes: r.disk_bytes ?? null,
        uptime: r.uptime ?? null,
      },
    });
  } catch (e) {
    const status = e?.response?.status;
    const data = e?.response?.data;

    console.error("[PTERO ERROR]", status, data || e);

    return res.status(500).json({
      ok: false,
      error: "Pterodactyl 查詢失敗",
      debug: {
        httpStatus: status || null,
        detail: data || null,
      },
    });
  }
});

app.post("/api/power/start", requireAuth, requirePteroConfig, async (req, res) => {
  try {
    await setPower(req.ptero.serverId, "start", req.ptero.token, req.ptero.panelUrl);
    return res.json({ ok: true });
  } catch (e) {
    const status = e?.response?.status || null;
    const detail = e?.response?.data || null;
    console.error("[PTERO POWER start ERROR]", status, detail || e);
    return res.status(500).json({ ok: false, error: "伺服器啟動失敗", debug: { httpStatus: status, detail } });
  }
});

app.post("/api/power/stop", requireAuth, requirePteroConfig, async (req, res) => {
  try {
    await setPower(req.ptero.serverId, "stop", req.ptero.token, req.ptero.panelUrl);
    return res.json({ ok: true });
  } catch (e) {
    const status = e?.response?.status || null;
    const detail = e?.response?.data || null;
    console.error("[PTERO POWER stop ERROR]", status, detail || e);
    return res.status(500).json({ ok: false, error: "伺服器關閉失敗", debug: { httpStatus: status, detail } });
  }
});

app.post("/api/command", requireAuth, requirePteroConfig, async (req, res) => {
  const { command } = req.body;
  if (!command || !String(command).trim()) {
    return res.status(400).json({ ok: false, error: "請輸入指令內容" });
  }
  await sendCommand(req.ptero.serverId, String(command).trim(), req.ptero.token, req.ptero.panelUrl);
  res.json({ ok: true });
});

app.post("/api/whitelist/on", requireAuth, requirePteroConfig, async (req, res) => {
  try {
    await sendCommand(req.ptero.serverId, "whitelist on", req.ptero.token, req.ptero.panelUrl);
    await sendCommand(req.ptero.serverId, "say [LLS] 白名單已開啟。", req.ptero.token, req.ptero.panelUrl);
    await setWhitelistState(admin, { enabled: true, operator: req.user?.email || req.user?.uid || "未知使用者" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[WHITELIST ON ERROR]", e?.response?.status, e?.response?.data || e);
    res.status(500).json({ ok: false, error: "白名單開啟失敗" });
  }
});

app.post("/api/whitelist/off", requireAuth, requirePteroConfig, async (req, res) => {
  try {
    await sendCommand(req.ptero.serverId, "whitelist off", req.ptero.token, req.ptero.panelUrl);
    await sendCommand(req.ptero.serverId, "say [LLS] 白名單已關閉。", req.ptero.token, req.ptero.panelUrl);
    await setWhitelistState(admin, { enabled: false, operator: req.user?.email || req.user?.uid || "未知使用者" });
    res.json({ ok: true });
  } catch (e) {
    console.error("[WHITELIST OFF ERROR]", e?.response?.status, e?.response?.data || e);
    res.status(500).json({ ok: false, error: "白名單關閉失敗" });
  }
});

app.get("/api/whitelist/status", requireAuth, async (req, res) => {
  try {
    const state = await getWhitelistState(admin);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "讀取白名單狀態失敗" });
  }
});

app.post("/api/maintenance/start", requireAuth, requirePteroConfig, async (req, res) => {
  const operator = req.user?.email || req.user?.uid || "未知使用者";
  const lock = await trySetMaintenance(admin, { toMode: "MAINTENANCE", operator });
  if (!lock.ok) {
    return res.status(409).json({ ok: false, error: "維護模式已啟動", code: lock.reason });
  }

  try {
    await sendCommand(
      req.ptero.serverId,
      "say [LLS] 管理員已啟動維護模式，請玩家盡快下線。",
      req.ptero.token,
      req.ptero.panelUrl
    );
    await sendCommand(req.ptero.serverId, "whitelist on", req.ptero.token, req.ptero.panelUrl);
    await setWhitelistState(admin, { enabled: true, operator });

    return res.json({ ok: true, message: "維護模式已啟動" });
  } catch (e) {
    await trySetMaintenance(admin, { toMode: "NORMAL", operator: "system-rollback" });
    console.error("[MAINT START ERROR]", e?.response?.status, e?.response?.data || e);
    return res.status(500).json({ ok: false, error: "啟動維護失敗（已回滾）" });
  }
});

app.post("/api/maintenance/stop", requireAuth, requirePteroConfig, async (req, res) => {
  const operator = req.user?.email || req.user?.uid || "未知使用者";
  const lock = await trySetMaintenance(admin, { toMode: "NORMAL", operator });
  if (!lock.ok) {
    return res.status(409).json({ ok: false, error: "目前未處於維護模式", code: lock.reason });
  }

  try {
    await sendCommand(req.ptero.serverId, "whitelist off", req.ptero.token, req.ptero.panelUrl);
    await sendCommand(
      req.ptero.serverId,
      "say [LLS] 管理員已結束維護模式，歡迎回來。",
      req.ptero.token,
      req.ptero.panelUrl
    );
    await setWhitelistState(admin, { enabled: false, operator });

    await sendDiscordEmbed({
      title: "維護結束通知",
      descriptionLines: ["維護已結束，伺服器已恢復正常。"],
      operator,
      isMaintenance: true,
      color: 0x22c55e,
    });

    return res.json({ ok: true, message: "維護模式已結束" });
  } catch (e) {
    await trySetMaintenance(admin, { toMode: "MAINTENANCE", operator: "system-rollback" });
    console.error("[MAINT STOP ERROR]", e?.response?.status, e?.response?.data || e);
    return res.status(500).json({ ok: false, error: "結束維護失敗（已回滾）" });
  }
});

app.get("/api/maintenance/status", requireAuth, async (req, res) => {
  try {
    const state = await getState(admin);
    res.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "讀取維護狀態失敗" });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`[API] listening on http://localhost:${port}`);
});
