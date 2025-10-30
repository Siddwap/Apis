import {
  createDecipheriv,
  createHash
} from "crypto";

function padHex(hex, length) {
  return hex.length >= length ? hex.slice(0, length) : hex + "x".repeat(length - hex.length);
}

function deriveKeyAndIv(url) {
  const keyHash = createHash("sha256").update(url).digest("hex");
  const keyHex = padHex(keyHash, 64);
  const key = Buffer.from(keyHex, "hex");
  const ivHash = createHash("sha256").update(url + "IV_SALT_XAI_2025").digest("hex");
  const ivHex = padHex(ivHash, 32);
  const iv = Buffer.from(ivHex, "hex");
  return {
    key: key,
    iv: iv
  };
}
export default function RedirectHandler({
  encryptedKey
}) {}
export async function getServerSideProps(context) {
  const {
    key
  } = context.params;
  const {
    res
  } = context;
  if (!key || typeof key !== "string" || !key.includes("-")) {
    return {
      notFound: true
    };
  }
  const decryptedPath = decryptUrl(key, key);
  if (!decryptedPath) {
    return {
      notFound: true
    };
  }
  const cdnUrl = decryptedPath;
  res.writeHead(302, {
    Location: cdnUrl
  });
  res.end();
  return {
    props: {}
  };
}

function decryptUrl(encryptedKey, originalSeed) {
  try {
    const parts = encryptedKey.split("-");
    if (parts.length < 2) return null;
    const ivHex = parts[0];
    const encryptedHex = parts.slice(1).join("-");
    const {
      key
    } = deriveKeyAndIv(originalSeed);
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted, null, "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decrypt failed:", err);
    return null;
  }
}