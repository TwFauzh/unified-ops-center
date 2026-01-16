const { encryptText, decryptText } = require("./cryptoUtil");

const COLLECTION = "opscenter_user_ptero"; // Firestore collection
const cache = new Map(); // uid -> { token, panelUrl, serverId, expMs, meta }

function maskLast4(token) {
  if (!token) return null;
  return token.slice(-4);
}

function isLikelyPteroClientKey(token) {
  return typeof token === "string" && token.startsWith("ptlc_") && token.length >= 20;
}

function normalizePanelUrl(panelUrl) {
  return String(panelUrl || "").trim().replace(/\/+$/, "");
}

function getDocRef(admin, uid) {
  return admin.firestore().collection(COLLECTION).doc(uid);
}

async function upsertUserPteroConfig(admin, uid, { apiKey, panelUrl, serverId }) {
  const updates = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const normalizedPanelUrl = normalizePanelUrl(panelUrl);
  if (normalizedPanelUrl) updates.panelUrl = normalizedPanelUrl;
  if (serverId) updates.serverId = String(serverId).trim();

  if (apiKey) {
    if (!isLikelyPteroClientKey(apiKey)) {
      throw new Error("Pterodactyl API 金鑰格式不正確");
    }
    const encrypted = encryptText(apiKey);
    updates.enc_b64 = encrypted.enc_b64;
    updates.iv_b64 = encrypted.iv_b64;
    updates.tag_b64 = encrypted.tag_b64;
    updates.last4 = maskLast4(apiKey);
  }

  const docRef = getDocRef(admin, uid);
  await docRef.set(updates, { merge: true });

  const cached = cache.get(uid);
  cache.set(uid, {
    token: apiKey || cached?.token || null,
    panelUrl: normalizedPanelUrl || cached?.panelUrl || null,
    serverId: updates.serverId || cached?.serverId || null,
    expMs: Date.now() + 5 * 60 * 1000,
    meta: { last4: updates.last4 || cached?.meta?.last4 || null },
  });

  return getUserPteroMeta(admin, uid);
}

async function getUserPteroAuth(admin, uid) {
  const c = cache.get(uid);
  if (c && c.expMs > Date.now()) {
    return {
      token: c.token || null,
      panelUrl: c.panelUrl || null,
      serverId: c.serverId || null,
    };
  }

  const snap = await getDocRef(admin, uid).get();
  if (!snap.exists) return null;

  const data = snap.data() || {};
  const token =
    data.enc_b64 && data.iv_b64 && data.tag_b64
      ? decryptText({
          enc_b64: data.enc_b64,
          iv_b64: data.iv_b64,
          tag_b64: data.tag_b64,
        })
      : null;

  const panelUrl = data.panelUrl || null;
  const serverId = data.serverId || null;

  cache.set(uid, {
    token,
    panelUrl,
    serverId,
    expMs: Date.now() + 5 * 60 * 1000,
    meta: { last4: data.last4 || maskLast4(token) },
  });

  return { token, panelUrl, serverId };
}

async function getUserPteroConfig(admin, uid) {
  const snap = await getDocRef(admin, uid).get();
  if (!snap.exists) {
    return { configured: false, panelUrl: null, serverId: null, last4: null };
  }

  const d = snap.data() || {};
  return {
    configured: Boolean(d.enc_b64 && d.iv_b64 && d.tag_b64 && d.panelUrl && d.serverId),
    panelUrl: d.panelUrl || null,
    serverId: d.serverId || null,
    last4: d.last4 || null,
    updatedAt: d.updatedAt ? d.updatedAt.toDate?.() || null : null,
  };
}

async function getUserPteroMeta(admin, uid) {
  return getUserPteroConfig(admin, uid);
}

module.exports = {
  upsertUserPteroConfig,
  getUserPteroAuth,
  getUserPteroConfig,
  getUserPteroMeta,
};
