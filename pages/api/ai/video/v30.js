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
      const response = await this.client.get("/mails/v9", {
        params: {
          action: "create"
        }
      });
      const email = response.data?.email;
      if (!email) throw new Error("Email tidak ditemukan di response");
      LOG.success(`Email dibuat: ${email}`);
      return email;
    } catch (error) {
      LOG.error("[WUDYSOFT] Gagal buat email", error);
      throw error;
    }
  }
  async checkMessages(email) {
    try {
      LOG.info(`Mengecek pesan untuk: ${email}`);
      const response = await this.client.get("/mails/v9", {
        params: {
          action: "message",
          email: email
        }
      });
      const content = response.data?.data?.[0]?.text_content;
      if (!content) {
        LOG.debug("Belum ada pesan");
        return null;
      }
      const match = content.match(/https:\/\/www\.imideo\.net\/api\/auth\/verify-email\?token=([a-z0-9\-]+)/);
      if (!match) {
        LOG.debug("Link verifikasi belum ada");
        return null;
      }
      const link = `https://www.imideo.net/api/auth/verify-email?token=${match[1]}`;
      LOG.success(`Link verifikasi ditemukan: ${link.substring(0, 60)}...`);
      return link;
    } catch (error) {
      LOG.error(`Gagal cek pesan untuk ${email}`, error);
      return null;
    }
  }
  async createPaste(title, content) {
    try {
      LOG.info(`Membuat paste: ${title}`);
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "create",
          title: title,
          content: content
        }
      });
      const key = response.data?.key;
      if (!key) throw new Error("Key paste tidak ditemukan");
      LOG.success(`Paste dibuat. Key: ${key}`);
      return key;
    } catch (error) {
      LOG.error("Gagal create paste", error);
      throw error;
    }
  }
  async getPaste(key) {
    try {
      LOG.info(`Mengambil paste: ${key}`);
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "get",
          key: key
        }
      });
      const content = response.data?.content;
      if (!content) throw new Error("Paste kosong atau tidak ditemukan");
      LOG.success("Paste berhasil diambil");
      return content;
    } catch (error) {
      LOG.warn(`Paste ${key} tidak ditemukan atau error`, error);
      return null;
    }
  }
}
class IMideoAPI {
  constructor() {
    this.cookieJar = new CookieJar();
    this.baseURL = "https://www.imideo.net/api";
    this.csrfToken = null;
    this.csrfExpiry = 0;
    const commonHeaders = {
      "accept-language": "id-ID",
      origin: "https://www.imideo.net",
      referer: "https://www.imideo.net/sora-2",
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
          config.data = {
            ...config.data,
            csrfToken: token
          };
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
        LOG.warn(`Rate limit / error ${status} → retry #${retryCount + 1} setelah ${delay}ms`);
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
      LOG.info("Mengambil CSRF token...");
      await this.api.get("/auth/csrf");
      const cookies = await this.cookieJar.getCookies("https://www.imideo.net");
      const csrfCookie = cookies.find(c => c.key === "__Host-authjs.csrf-token");
      if (!csrfCookie?.value) throw new Error("CSRF cookie tidak ada");
      const parts = csrfCookie.value.split("|");
      if (parts.length < 2) throw new Error("Format CSRF invalid");
      this.csrfToken = parts[1];
      this.csrfExpiry = now + 5 * 60 * 1e3;
      LOG.success(`CSRF token valid hingga ${new Date(this.csrfExpiry).toLocaleTimeString()}`);
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
        LOG.debug("Input adalah Buffer");
        buffer = imageInput;
      } else if (typeof imageInput === "string") {
        if (imageInput.startsWith("http")) {
          LOG.info(`Download gambar dari URL (${imageInput.substring(0, 50)}...)`);
          const res = await axios.get(imageInput, {
            responseType: "arraybuffer",
            timeout: 15e3
          });
          buffer = Buffer.from(res.data);
        } else if (imageInput.startsWith("data:image/")) {
          LOG.debug("Parse base64 image");
          buffer = Buffer.from(imageInput.replace(/^data:image\/\w+;base64,/, ""), "base64");
        } else {
          throw new Error("Format gambar tidak didukung");
        }
      } else {
        throw new Error("imageUrl harus string atau Buffer");
      }
      if (!buffer || buffer.length === 0) throw new Error("Gambar kosong");
      LOG.success(`Gambar diproses: ${(buffer.length / 1024).toFixed(2)} KB`);
      return buffer;
    } catch (error) {
      LOG.error("Gagal proses gambar", error);
      throw error;
    }
  }
  async _uploadImage(buffer, fileName) {
    try {
      LOG.info(`Upload gambar: ${fileName}`);
      const base64Data = `data:image/jpeg;base64,${buffer.toString("base64")}`;
      const payload = {
        base64Data: base64Data,
        fileName: fileName
      };
      const res = await this.api.post("/upload-image", payload);
      if (!res.data.success) throw new Error(res.data.message || "Upload gagal");
      LOG.success(`Upload sukses: ${res.data.data.downloadUrl.substring(0, 60)}...`);
      return res.data.data.downloadUrl;
    } catch (error) {
      LOG.error("Upload gambar gagal", error);
      throw error;
    }
  }
  async _getSessionToken() {
    try {
      const cookies = await this.cookieJar.getCookies("https://www.imideo.net");
      const token = cookies.find(c => c.key === "__Secure-authjs.session-token")?.value;
      if (!token) LOG.warn("Session token tidak ditemukan");
      else LOG.debug(`Session token: ${token.substring(0, 20)}...`);
      return token || null;
    } catch (error) {
      LOG.error("Gagal baca session token", error);
      return null;
    }
  }
  async _performRegistration() {
    try {
      LOG.info("====== MEMULAI REGISTRASI BARU ======");
      const email = await this.wudysoft.createEmail();
      const nickname = `User${Date.now()}${this._random()}`;
      const password = `Pass${Date.now()}${this._random()}`;
      LOG.info(`Signup → ${email} | ${nickname}`);
      await this.api.post("/auth/signup", {
        email: email,
        password: password,
        nickname: nickname
      });
      LOG.info("Menunggu email verifikasi...");
      let verifyLink = null;
      for (let i = 0; i < 60; i++) {
        verifyLink = await this.wudysoft.checkMessages(email);
        if (verifyLink) break;
        LOG.debug(`Tunggu... (${i + 1}/60)`);
        await sleep(3e3);
      }
      if (!verifyLink) throw new Error("Timeout: Link verifikasi tidak ditemukan");
      LOG.info(`Verifikasi email...`);
      const verifyClient = wrapper(axios.create({
        jar: this.cookieJar
      }));
      await verifyClient.get(verifyLink, {
        maxRedirects: 10
      });
      LOG.info("Validasi kredensial...");
      await this.api.post("/auth/validate-credentials", {
        email: email,
        password: password
      });
      await this.api.get("/auth/session");
      const sessionToken = await this._getSessionToken();
      if (!sessionToken) throw new Error("Session token hilang setelah login");
      LOG.success("Registrasi & login berhasil!");
      return {
        email: email,
        password: password,
        nickname: nickname,
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
    try {
      if (key) {
        LOG.info(`Memuat sesi dari key: ${key}`);
        const saved = await this.wudysoft.getPaste(key);
        if (saved) {
          sessionData = JSON.parse(saved);
          await this.cookieJar.setCookie(`__Secure-authjs.session-token=${sessionData.sessionToken}; Domain=.imideo.net; Path=/; Secure; HttpOnly; SameSite=Lax`, "https://www.imideo.net");
          LOG.success(`Sesi dimuat dari key: ${key}`);
        } else {
          LOG.warn(`Key ${key} tidak ditemukan`);
        }
      }
    } catch (error) {
      LOG.warn("Gagal parse sesi dari key", error);
    }
    if (!sessionData || !await this._getSessionToken()) {
      LOG.info("Key tidak valid → buat sesi baru");
      const newSession = await this._performRegistration();
      const toSave = JSON.stringify({
        email: newSession.email,
        password: newSession.password,
        sessionToken: newSession.sessionToken
      });
      currentKey = await this.wudysoft.createPaste(`imideo-session-${this._random()}`, toSave);
      sessionData = newSession;
      LOG.success(`Sesi baru disimpan. Key: ${currentKey}`);
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
      LOG.success(`Registrasi selesai. Email: ${sessionData.email} | Key: ${key}`);
      return {
        key: key,
        email: sessionData.email
      };
    } catch (error) {
      LOG.error("register gagal", error);
      throw error;
    }
  }
  async txt2vid(params) {
    try {
      LOG.info(`ACTION: txt2vid → "${params.prompt.substring(0, 50)}..."`);
      const {
        key
      } = await this._ensureValidSession({
        key: params.key
      });
      const payload = {
        prompt: params.prompt,
        videoMode: "text-to-video",
        aspectRatio: params.aspectRatio || "9:16",
        resolution: params.resolution || "480p",
        duration: params.duration || "5",
        model: params.model || "wan-video",
        modelType: params.model || "wan-video",
        requiredCredits: 4
      };
      const res = await this.api.post("/video-generation/queue-v2", payload);
      if (!res.data.taskId) throw new Error("taskId tidak ada");
      LOG.success(`Task dibuat: ${res.data.taskId}`);
      return {
        ...res.data,
        key: key
      };
    } catch (error) {
      LOG.error("txt2vid gagal", error);
      throw error;
    }
  }
  async img2vid(params) {
    try {
      LOG.info(`ACTION: img2vid → "${params.prompt.substring(0, 40)}..."`);
      const {
        key
      } = await this._ensureValidSession({
        key: params.key
      });
      const buffer = await this._downloadOrParseImage(params.imageUrl);
      const fileName = `img-${Date.now()}-${this._random()}.jpg`;
      const uploadedUrl = await this._uploadImage(buffer, fileName);
      const payload = {
        prompt: params.prompt,
        image: uploadedUrl,
        imageUploadMode: params.imageUploadMode || "start",
        videoMode: "image-to-video",
        aspectRatio: params.aspectRatio || "9:16",
        resolution: params.resolution || "480p",
        duration: params.duration || "5",
        model: params.model || "wan-video",
        modelType: params.model || "wan-video",
        requiredCredits: 4
      };
      const res = await this.api.post("/video-generation/queue-v2", payload);
      if (!res.data.taskId) throw new Error("taskId tidak ada");
      LOG.success(`img2vid task: ${res.data.taskId}`);
      return {
        ...res.data,
        key: key
      };
    } catch (error) {
      LOG.error("img2vid gagal", error);
      throw error;
    }
  }
  async status(params) {
    try {
      LOG.info(`ACTION: status → task_id: ${params.task_id}`);
      const {
        key
      } = await this._ensureValidSession({
        key: params.key
      });
      const res = await this.api.get(`/video-generation/progress/${params.task_id}`);
      LOG.success(`Status: ${res.data.status || "unknown"}`);
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
      LOG.info("ACTION: credits → cek kredit");
      const {
        key
      } = await this._ensureValidSession({
        key: params.key
      });
      const res = await this.api.get("/user/credits");
      LOG.success(`Kredit tersisa: ${res.data.data.credits}`);
      return {
        ...res.data.data,
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
    LOG.warn("Request tanpa action");
    return res.status(400).json({
      error: "Parameter 'action' wajib diisi."
    });
  }
  const api = new IMideoAPI();
  try {
    let result;
    switch (action) {
      case "register":
        result = await api.register();
        break;
      case "txt2vid":
        if (!params.prompt) return res.status(400).json({
          error: "prompt wajib"
        });
        result = await api.txt2vid(params);
        break;
      case "img2vid":
        if (!params.imageUrl || !params.prompt) return res.status(400).json({
          error: "imageUrl & prompt wajib"
        });
        result = await api.img2vid(params);
        break;
      case "status":
        if (!params.task_id) return res.status(400).json({
          error: "task_id wajib"
        });
        result = await api.status(params);
        break;
      case "credits":
        result = await api.credits(params);
        break;
      default:
        LOG.warn(`Action tidak dikenali: ${action}`);
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Gunakan: register, txt2vid, img2vid, status, credits`
        });
    }
    LOG.success(`Action ${action} selesai`);
    return res.status(200).json(result);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message || "Internal server error";
    LOG.error(`FATAL: ${action} → ${message}`, error);
    return res.status(status).json({
      error: message
    });
  }
}