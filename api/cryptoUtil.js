const crypto = require("crypto");

// 用 32 bytes key（建議用 base64 存在 env）
function getMasterKey() {
  const b64 = process.env.OPSCENTER_MASTER_KEY_B64;
  if (!b64) throw new Error("缺少 OPSCENTER_MASTER_KEY_B64（base64, 32 bytes）");

  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("OPSCENTER_MASTER_KEY_B64 解出來必須是 32 bytes");
  return key;
}

function encryptText(plainText) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12); // GCM 建議 12 bytes
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const enc = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    enc_b64: enc.toString("base64"),
    iv_b64: iv.toString("base64"),
    tag_b64: tag.toString("base64"),
  };
}

function decryptText({ enc_b64, iv_b64, tag_b64 }) {
  const key = getMasterKey();
  const iv = Buffer.from(iv_b64, "base64");
  const enc = Buffer.from(enc_b64, "base64");
  const tag = Buffer.from(tag_b64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return plain.toString("utf8");
}

module.exports = { encryptText, decryptText };
