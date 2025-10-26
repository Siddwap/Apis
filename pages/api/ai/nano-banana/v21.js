import axios from "axios";
import {
  CookieJar
} from "tough-cookie";
import {
  wrapper
} from "axios-cookiejar-support";
import {
  randomBytes,
  createHash
} from "crypto";
import apiConfig from "@/configs/apiConfig";
import SpoofHead from "@/lib/spoof-head";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const LOG = {
  info: (msg, data = {}) => console.log(`[INFO] ${msg}`, data),
  success: (msg, data = {}) => console.log(`[SUCCESS] ${msg}`, data),
  warn: (msg, data = {}) => console.warn(`[WARN] ${msg}`, data),
  error: (msg, error = null) => {
    console.error(`[ERROR] ${msg}`, error ? {
      message: error.message,
      stack: error.stack
    } : "");
  },
  debug: (msg, data = {}) => {
    if (process.env.DEBUG === "true") console.log(`[DEBUG] ${msg}`, data);
  }
};
class WudysoftAPI {
  constructor() {
    this.client = axios.create({
      baseURL: `https://${apiConfig.DOMAIN_URL}/api`,
      timeout: 15e3
    });
  }
  async createEmail() {
    try {
      LOG.info("[WUDYSOFT] Membuat email sementara...");
      const res = await this.client.get("/mails/v9", {
        params: {
          action: "create"
        }
      });
      const email = res.data?.email;
      if (!email) throw new Error("Email tidak ditemukan");
      LOG.success(`Email: ${email}`);
      return email;
    } catch (error) {
      LOG.error("Gagal buat email", error);
      throw error;
    }
  }
  async checkMessages(email) {
    try {
      LOG.info(`Cek pesan: ${email}`);
      const res = await this.client.get("/mails/v9", {
        params: {
          action: "message",
          email: email
        }
      });
      const content = res.data?.data?.[0]?.text_content;
      if (!content) return null;
      const match = content.match(/Your verification code is:\r\n\r\n(\d+)/);
      if (!match) return null;
      const code = match[1];
      LOG.success(`Kode: ${code}`);
      return code;
    } catch (error) {
      LOG.error(`Gagal cek pesan ${email}`, error);
      return null;
    }
  }
  async createPaste(title, content) {
    try {
      LOG.info(`Paste: ${title}`);
      const res = await this.client.get("/tools/paste/v1", {
        params: {
          action: "create",
          title: title,
          content: content
        }
      });
      const key = res.data?.key;
      if (!key) throw new Error("Key tidak ada");
      LOG.success(`Paste key: ${key}`);
      return key;
    } catch (error) {
      LOG.error("Gagal create paste", error);
      throw error;
    }
  }
  async getPaste(key) {
    try {
      LOG.info(`Ambil paste: ${key}`);
      const res = await this.client.get("/tools/paste/v1", {
        params: {
          action: "get",
          key: key
        }
      });
      const content = res.data?.content;
      if (!content) throw new Error("Paste kosong");
      LOG.success("Paste diambil");
      return content;
    } catch (error) {
      LOG.warn(`Paste ${key} tidak ada`, error);
      return null;
    }
  }
}
class NanoBananaAPI {
  constructor() {
    this.cookieJar = new CookieJar();
    this.baseURL = "https://nanobanana.ai/api";
    this.csrfToken = null;
    this.csrfExpiry = 0;
    const commonHeaders = {
      "accept-language": "id-ID",
      origin: "https://nanobanana.ai",
      referer: "https://nanobanana.ai/generator",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      ...SpoofHead()
    };
    this.api = wrapper(axios.create({
      baseURL: this.baseURL,
      jar: this.cookieJar,
      withCredentials: true,
      timeout: 2e4,
      headers: {
        ...commonHeaders,
        accept: "*/*",
        "content-type": "application/json",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin"
      }
    }));
    this.api.interceptors.request.use(async config => {
      await sleep(800 + Math.random() * 700);
      if (config.method === "post") {
        try {
          const token = await this._getCsrfToken();
          if (config.url.includes("/auth/callback/email-code")) {
            config.headers["Content-Type"] = "application/x-www-form-urlencoded";
            const form = new URLSearchParams(config.data);
            form.set("csrfToken", token);
            config.data = form.toString();
          } else {
            config.data = {
              ...config.data,
              csrfToken: token
            };
          }
        } catch (e) {
          LOG.error("Gagal inject CSRF", e);
        }
      }
      return config;
    });
    this.api.interceptors.response.use(res => res, async error => {
      const status = error.response?.status;
      const retryCount = error.config?.retryCount || 0;
      if ((status === 429 || status >= 500) && retryCount < 3) {
        const delay = 2e3 * (retryCount + 1);
        LOG.warn(`Retry #${retryCount + 1} setelah ${delay}ms (status: ${status})`);
        await sleep(delay);
        error.config.retryCount = retryCount + 1;
        return this.api(error.config);
      }
      return Promise.reject(error);
    });
    this.wudysoft = new WudysoftAPI();
  }
  _random() {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
  async _getCsrfToken(force = false) {
    const now = Date.now();
    if (!force && this.csrfToken && now < this.csrfExpiry) {
      return this.csrfToken;
    }
    try {
      LOG.info("Ambil CSRF...");
      await this.api.get("/auth/csrf");
      const cookies = await this.cookieJar.getCookies("https://nanobanana.ai");
      const csrfCookie = cookies.find(c => c.key === "__Host-authjs.csrf-token");
      if (!csrfCookie?.value) throw new Error("CSRF cookie tidak ada");
      const parts = csrfCookie.value.split("|");
      if (parts.length < 2) throw new Error("CSRF format invalid");
      this.csrfToken = parts[1];
      this.csrfExpiry = now + 5 * 60 * 1e3;
      LOG.success(`CSRF valid hingga ${new Date(this.csrfExpiry).toLocaleTimeString()}`);
      return this.csrfToken;
    } catch (error) {
      LOG.error("Gagal ambil CSRF", error);
      throw error;
    }
  }
  async _downloadOrParseImage(imageInput) {
    try {
      let buffer;
      if (Buffer.isBuffer(imageInput)) {
        buffer = imageInput;
      } else if (typeof imageInput === "string") {
        if (imageInput.startsWith("http")) {
          LOG.info(`Download: ${imageInput.substring(0, 50)}...`);
          const res = await axios.get(imageInput, {
            responseType: "arraybuffer",
            timeout: 15e3
          });
          buffer = Buffer.from(res.data);
        } else if (imageInput.startsWith("data:image/")) {
          buffer = Buffer.from(imageInput.replace(/^data:image\/\w+;base64,/, ""), "base64");
        } else {
          throw new Error("Format gambar tidak didukung");
        }
      } else {
        throw new Error("imageUrl harus string/Buffer");
      }
      if (!buffer || buffer.length === 0) throw new Error("Gambar kosong");
      LOG.success(`Gambar: ${(buffer.length / 1024).toFixed(2)} KB`);
      return buffer;
    } catch (error) {
      LOG.error("Gagal proses gambar", error);
      throw error;
    }
  }
  async _uploadImage(buffer, fileName, contentType = "image/jpeg") {
    try {
      LOG.info(`Upload: ${fileName}`);
      const payload = {
        fileName: fileName,
        contentType: contentType,
        fileSize: buffer.length
      };
      const res = await this.api.post("/get-upload-url", payload);
      const {
        uploadUrl,
        publicUrl
      } = res.data;
      if (!uploadUrl || !publicUrl) throw new Error("Upload URL tidak ada");
      await axios.put(uploadUrl, buffer, {
        headers: {
          "Content-Type": contentType
        }
      });
      LOG.success(`Upload: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      LOG.error("Upload gagal", error);
      throw error;
    }
  }
  async _getSessionToken() {
    try {
      const cookies = await this.cookieJar.getCookies("https://nanobanana.ai");
      const token = cookies.find(c => c.key === "__Secure-next-auth.session-token")?.value;
      if (!token) LOG.warn("Session token tidak ada");
      return token || null;
    } catch (error) {
      LOG.error("Gagal baca session", error);
      return null;
    }
  }
  async _performRegistration() {
    try {
      LOG.info("====== REGISTRASI NANOBANANA ======");
      const email = await this.wudysoft.createEmail();
      await this.api.post("/auth/send-code", {
        email: email,
        locale: "en"
      });
      LOG.info("Menunggu kode...");
      let code = null;
      for (let i = 0; i < 60; i++) {
        code = await this.wudysoft.checkMessages(email);
        if (code) break;
        await sleep(3e3);
      }
      if (!code) throw new Error("Timeout kode verifikasi");
      const form = new URLSearchParams({
        email: email,
        code: code,
        redirect: "false",
        callbackUrl: "/en",
        json: "true"
      });
      const verifyRes = await this.api.post("/auth/callback/email-code", form.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });
      if (!verifyRes.data.url) throw new Error("Verifikasi gagal");
      await this.api.get("/auth/session");
      const sessionToken = await this._getSessionToken();
      if (!sessionToken) throw new Error("Session token hilang");
      LOG.success("Registrasi sukses!");
      return {
        email: email,
        sessionToken: sessionToken
      };
    } catch (error) {
      LOG.error("Registrasi gagal", error);
      throw error;
    }
  }
  async _ensureValidSession({
    key
  } = {}) {
    let sessionData = null;
    let currentKey = key;
    if (key) {
      try {
        LOG.info(`Load sesi: ${key}`);
        const saved = await this.wudysoft.getPaste(key);
        if (saved) {
          sessionData = JSON.parse(saved);
          await this.cookieJar.setCookie(`__Secure-next-auth.session-token=${sessionData.sessionToken}; Domain=.nanobanana.ai; Path=/; Secure; HttpOnly; SameSite=Lax`, "https://nanobanana.ai");
          LOG.success("Sesi dimuat");
        }
      } catch (error) {
        LOG.warn("Gagal load sesi", error);
      }
    }
    if (!sessionData || !await this._getSessionToken()) {
      LOG.info("Buat sesi baru...");
      const newSession = await this._performRegistration();
      const toSave = JSON.stringify({
        email: newSession.email,
        sessionToken: newSession.sessionToken
      });
      currentKey = await this.wudysoft.createPaste(`nanobanana-session-${this._random()}`, toSave);
      sessionData = newSession;
      LOG.success(`Sesi baru: ${currentKey}`);
    }
    await this._getCsrfToken(true);
    return {
      sessionData: sessionData,
      key: currentKey
    };
  }
  async register() {
    try {
      LOG.info("ACTION: register");
      const {
        key,
        sessionData
      } = await this._ensureValidSession({});
      LOG.success(`Register OK. Key: ${key}`);
      return {
        key: key,
        email: sessionData.email
      };
    } catch (error) {
      LOG.error("register gagal", error);
      throw error;
    }
  }
  async txt2img(params) {
    try {
      LOG.info(`ACTION: txt2img → "${params.prompt.substring(0, 50)}..."`);
      const {
        key
      } = await this._ensureValidSession({
        key: params.key
      });
      const payload = {
        prompt: params.prompt,
        styleId: params.styleId || "realistic",
        mode: "text",
        imageSize: params.imageSize || "auto",
        quality: params.quality || "standard",
        numImages: params.numImages || 1,
        outputFormat: params.outputFormat || "png",
        model: params.model || "nano-banana",
        resolution: params.resolution || "1024*1024",
        aspectRatio: params.aspectRatio || "1:1"
      };
      const res = await this.api.post("/generate-image", payload);
      if (!res.data.taskId) throw new Error("taskId tidak ada");
      LOG.success(`Task: ${res.data.taskId}`);
      return {
        ...res.data,
        key: key
      };
    } catch (error) {
      LOG.error("txt2img gagal", error);
      throw error;
    }
  }
  async img2img(params) {
    try {
      LOG.info(`ACTION: img2img → "${params.prompt.substring(0, 40)}..."`);
      const {
        key
      } = await this._ensureValidSession({
        key: params.key
      });
      const imageUrls = Array.isArray(params.imageUrl) ? params.imageUrl : [params.imageUrl];
      const uploaded = [];
      for (const [i, url] of imageUrls.entries()) {
        LOG.info(`Upload gambar ${i + 1}/${imageUrls.length}`);
        const buffer = await this._downloadOrParseImage(url);
        const fileName = `img-${Date.now()}-${this._random()}.jpg`;
        const uploadedUrl = await this._uploadImage(buffer, fileName);
        uploaded.push(uploadedUrl);
      }
      const payload = {
        prompt: params.prompt,
        styleId: params.styleId || "realistic",
        mode: "image",
        imageUrl: uploaded[0],
        imageUrls: uploaded,
        imageSize: params.imageSize || "auto",
        quality: params.quality || "standard",
        numImages: params.numImages || 1,
        outputFormat: params.outputFormat || "png",
        model: params.model || "nano-banana",
        resolution: params.resolution || "1024*1024",
        aspectRatio: params.aspectRatio || "1:1"
      };
      const res = await this.api.post("/generate-image", payload);
      if (!res.data.taskId) throw new Error("taskId tidak ada");
      LOG.success(`img2img task: ${res.data.taskId}`);
      return {
        ...res.data,
        key: key
      };
    } catch (error) {
      LOG.error("img2img gagal", error);
      throw error;
    }
  }
  async status(params) {
    try {
      LOG.info(`ACTION: status → ${params.taskId}`);
      const {
        key
      } = await this._ensureValidSession({
        key: params.key
      });
      const res = await this.api.get("/generate-image/status", {
        params: {
          taskId: params.taskId
        }
      });
      LOG.success(`Status: ${res.data.status}`);
      return {
        ...res.data,
        key: key
      };
    } catch (error) {
      LOG.error("status gagal", error);
      throw error;
    }
  }
  async credits(params) {
    try {
      LOG.info("ACTION: credits");
      const {
        key
      } = await this._ensureValidSession({
        key: params.key
      });
      const res = await this.api.get("/user/credits");
      LOG.success(`Kredit: ${res.data.credits}`);
      return {
        ...res.data,
        key: key
      };
    } catch (error) {
      LOG.error("credits gagal", error);
      throw error;
    }
  }
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    LOG.warn("Tidak ada action");
    return res.status(400).json({
      error: "Parameter 'action' wajib."
    });
  }
  const api = new NanoBananaAPI();
  try {
    let result;
    switch (action) {
      case "register":
        result = await api.register();
        break;
      case "txt2img":
        if (!params.prompt) return res.status(400).json({
          error: "prompt wajib"
        });
        result = await api.txt2img(params);
        break;
      case "img2img":
        if (!params.imageUrl || !params.prompt) return res.status(400).json({
          error: "imageUrl & prompt wajib"
        });
        result = await api.img2img(params);
        break;
      case "status":
        if (!params.taskId) return res.status(400).json({
          error: "taskId wajib"
        });
        result = await api.status(params);
        break;
      case "credits":
        result = await api.credits(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Gunakan: register, txt2img, img2img, status, credits`
        });
    }
    LOG.success(`Action ${action} OK`);
    return res.status(200).json(result);
  } catch (error) {
    const status = error.response?.status || 500;
    const msg = error.response?.data?.message || error.message;
    LOG.error(`FATAL: ${action} → ${msg}`, error);
    return res.status(status).json({
      error: msg
    });
  }
}