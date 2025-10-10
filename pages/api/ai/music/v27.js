import axios from "axios";
import https from "https";
import * as cheerio from "cheerio";
import apiConfig from "@/configs/apiConfig";
import SpoofHead from "@/lib/spoof-head";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class WudysoftAPI {
  constructor() {
    this.client = axios.create({
      baseURL: `https://${apiConfig.DOMAIN_URL}/api`
    });
  }
  async createPaste(title, content) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "create",
          title: title,
          content: content
        }
      });
      return response.data?.key || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.createPaste': ${error.message}`);
      throw error;
    }
  }
  async getPaste(key) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "get",
          key: key
        }
      });
      return response.data?.content || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.getPaste' untuk kunci ${key}: ${error.message}`);
      return null;
    }
  }
  async listPastes() {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "list"
        }
      });
      return response.data || [];
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.listPastes': ${error.message}`);
      return [];
    }
  }
  async delPaste(key) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "delete",
          key: key
        }
      });
      return response.data || null;
    } catch (error) {
      console.error(`[ERROR] Gagal dalam 'WudysoftAPI.delPaste' untuk kunci ${key}: ${error.message}`);
      return false;
    }
  }
}
class MusicMakerAIAPI {
  constructor() {
    this.baseURL = "https://www.musicmakerai.net";
    this.cookieString = "";
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
    const commonHeaders = {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "id-ID",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "upgrade-insecure-requests": "1",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      ...SpoofHead()
    };
    this.client = axios.create({
      baseURL: this.baseURL,
      httpsAgent: httpsAgent,
      headers: commonHeaders,
      maxRedirects: 5,
      validateStatus: status => status < 500
    });
    this.client.interceptors.request.use(config => {
      if (this.cookieString) {
        config.headers["cookie"] = this.cookieString;
        console.log("\n[REQUEST] Mengirim request ke:", config.url);
        console.log("[REQUEST] Method:", config.method.toUpperCase());
        console.log("[REQUEST] Cookie yang dikirim:");
        console.log(this.cookieString);
      }
      return config;
    });
    this.client.interceptors.response.use(response => {
      console.log("\n[RESPONSE] Menerima response dari:", response.config.url);
      console.log("[RESPONSE] Status:", response.status, response.statusText);
      const setCookieHeader = response.headers["set-cookie"];
      if (setCookieHeader) {
        this._updateCookieString(setCookieHeader);
      } else {
        console.log("[RESPONSE] Tidak ada Set-Cookie header");
      }
      const dataStr = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      console.log("[RESPONSE] Data length:", dataStr.length, "characters");
      if (dataStr.length < 1e3) {
        console.log("[RESPONSE] Data:", dataStr);
      } else {
        console.log("[RESPONSE] Data (preview 500 chars):", dataStr.substring(0, 500) + "...");
      }
      console.log();
      return response;
    });
    this.wudysoft = new WudysoftAPI();
  }
  _updateCookieString(setCookieArray) {
    if (!Array.isArray(setCookieArray)) return;
    console.log("\n[COOKIE UPDATE] Menerima Set-Cookie dari server:");
    console.log(JSON.stringify(setCookieArray, null, 2));
    const cookies = {};
    if (this.cookieString) {
      this.cookieString.split(";").forEach(cookie => {
        const [key, value] = cookie.trim().split("=");
        if (key) cookies[key] = value;
      });
    }
    setCookieArray.forEach(cookieStr => {
      const [mainPart] = cookieStr.split(";");
      const [key, value] = mainPart.split("=");
      if (key) cookies[key.trim()] = value;
    });
    this.cookieString = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    console.log("[COOKIE UPDATE] Cookie string setelah update:");
    console.log(this.cookieString);
    console.log();
  }
  _random() {
    return Math.random().toString(36).substring(2, 12);
  }
  _generateRandomCredentials() {
    const username = `user_${this._random()}`;
    const email = `${this._random()}@temp-mail.io`;
    const password = `${this._random().substring(0, 6)}A1!`;
    return {
      username: username,
      email: email,
      password: password
    };
  }
  async _performRegistration() {
    console.log("\n====== MEMULAI PROSES REGISTRASI MUSICMAKERAI ======");
    const {
      username,
      email,
      password
    } = this._generateRandomCredentials();
    console.log(`Proses: Username: ${username}`);
    console.log(`Proses: Email: ${email}`);
    console.log(`Proses: Password: ${password}`);
    try {
      await this.client.get("/register", {
        headers: {
          referer: `${this.baseURL}/login`,
          "sec-fetch-user": "?1",
          priority: "u=0, i"
        }
      });
      console.log("Proses: Halaman register berhasil diakses.");
    } catch (error) {
      console.error("Proses: Error saat mengakses halaman register:", error.message);
    }
    const formData = new URLSearchParams();
    formData.append("name", username);
    formData.append("country", "Indonesia");
    formData.append("email", email);
    formData.append("password", password);
    formData.append("password2", password);
    formData.append("acao", "cad");
    try {
      const response = await this.client.post("/functionx.php", formData, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: `${this.baseURL}/register`,
          origin: this.baseURL,
          "cache-control": "max-age=0",
          "sec-fetch-user": "?1",
          priority: "u=0, i"
        }
      });
      console.log("Proses: Registrasi berhasil dikirim.");
      await this.client.get("/create", {
        headers: {
          referer: `${this.baseURL}/register`,
          "cache-control": "max-age=0",
          "sec-fetch-user": "?1",
          priority: "u=0, i"
        }
      });
      console.log("Proses: Halaman create berhasil diakses.");
      const sessionData = {
        username: username,
        email: email,
        password: password,
        cookieString: this.cookieString
      };
      console.log("\n====== REGISTRASI SELESAI ======");
      console.log("[SESSION DATA] Username:", sessionData.username);
      console.log("[SESSION DATA] Email:", sessionData.email);
      console.log("[SESSION DATA] Password:", sessionData.password);
      console.log("[SESSION DATA] Cookie String:", sessionData.cookieString);
      console.log("=================================\n");
      return sessionData;
    } catch (error) {
      console.error(`Proses registrasi gagal: ${error.message}`);
      throw error;
    }
  }
  async _getSessionFromKey(key) {
    console.log(`\n[SESSION] Memuat sesi dari kunci: ${key}`);
    const savedSession = await this.wudysoft.getPaste(key);
    if (!savedSession) throw new Error(`Sesi dengan kunci "${key}" tidak ditemukan.`);
    try {
      const sessionData = JSON.parse(savedSession);
      console.log("[SESSION] Sesi berhasil dimuat:");
      console.log("[SESSION] Username:", sessionData.username);
      console.log("[SESSION] Email:", sessionData.email);
      console.log("[SESSION] Cookie String:", sessionData.cookieString);
      console.log();
      return sessionData;
    } catch (e) {
      throw new Error(`Gagal memuat sesi: ${e.message}`);
    }
  }
  async _ensureValidSession({
    key
  }) {
    let sessionData;
    let currentKey = key;
    if (key) {
      try {
        sessionData = await this._getSessionFromKey(key);
        this.cookieString = sessionData.cookieString || "";
      } catch (error) {
        console.warn(`[PERINGATAN] ${error.message}. Mendaftarkan sesi baru...`);
      }
    }
    if (!sessionData) {
      console.log("Proses: Kunci tidak valid atau tidak disediakan, mendaftarkan sesi baru...");
      const newSession = await this.register();
      if (!newSession?.key) throw new Error("Gagal mendaftarkan sesi baru.");
      console.log(`-> PENTING: Simpan kunci baru ini: ${newSession.key}`);
      currentKey = newSession.key;
      sessionData = await this._getSessionFromKey(currentKey);
      this.cookieString = sessionData.cookieString || "";
    }
    return {
      sessionData: sessionData,
      key: currentKey
    };
  }
  async register() {
    try {
      console.log("Proses: Mendaftarkan sesi baru...");
      const sessionData = await this._performRegistration();
      const sessionToSave = JSON.stringify(sessionData);
      const sessionTitle = `musicmakerai-session-${this._random()}`;
      const newKey = await this.wudysoft.createPaste(sessionTitle, sessionToSave);
      if (!newKey) throw new Error("Gagal menyimpan sesi baru.");
      console.log(`-> Sesi baru berhasil didaftarkan. Kunci Anda: ${newKey}`);
      return {
        key: newKey
      };
    } catch (error) {
      console.error(`Proses registrasi gagal: ${error.message}`);
      throw error;
    }
  }
  async list_key() {
    try {
      console.log("Proses: Mengambil daftar semua kunci sesi...");
      const allPastes = await this.wudysoft.listPastes();
      return allPastes.filter(paste => paste.title && paste.title.startsWith("musicmakerai-session-")).map(paste => paste.key);
    } catch (error) {
      console.error("Gagal mengambil daftar kunci:", error.message);
      throw error;
    }
  }
  async del_key({
    key
  }) {
    if (!key) {
      console.error("Kunci tidak disediakan untuk dihapus.");
      return false;
    }
    try {
      console.log(`Proses: Mencoba menghapus kunci: ${key}`);
      const success = await this.wudysoft.delPaste(key);
      console.log(success ? `Kunci ${key} berhasil dihapus.` : `Gagal menghapus kunci ${key}.`);
      return success;
    } catch (error) {
      console.error(`Terjadi error saat menghapus kunci ${key}:`, error.message);
      throw error;
    }
  }
  async generate({
    key,
    name = "My Song",
    voice = "",
    ritmo = "Samba",
    temaIA = "",
    prompt = "Beautiful music with amazing melody"
  }) {
    try {
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: key
      });
      console.log(`Proses: Membuat musik dengan nama "${name}"...`);
      const formData = new URLSearchParams();
      formData.append("ckletra", "1");
      formData.append("name", name);
      formData.append("voice", voice);
      formData.append("ritmo", ritmo);
      formData.append("temaIA", temaIA);
      formData.append("letra2", prompt);
      const response = await this.client.post("/function_ri.php", formData, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: `${this.baseURL}/create`,
          origin: this.baseURL,
          "cache-control": "max-age=0",
          "sec-fetch-user": "?1",
          priority: "u=0, i"
        }
      });
      console.log("Proses: Request pembuatan musik berhasil dikirim.");
      console.log("Proses: Musik sedang diproses, tunggu countdown selesai...");
      return {
        success: true,
        message: "Musik sedang dibuat. Gunakan method status() untuk mengecek hasil.",
        key: currentKey
      };
    } catch (error) {
      const errorMessage = error.response?.data || error.message;
      console.error(`Proses create gagal: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }
  _parseSongsFromHTML(html) {
    const $ = cheerio.load(html);
    const songs = [];
    $("li.single-item").each((i, elem) => {
      const $elem = $(elem);
      const coverImg = $elem.find(".single-item__cover img").attr("src");
      const downloadUrl = $elem.find(".single-item__cover").attr("href");
      const title = $elem.find(".single-item__title h4 a").text().trim();
      const genre = $elem.find(".single-item__title span a").text().trim();
      const shareLink = $elem.find("a.open-modal[data-link]").attr("data-link");
      if (downloadUrl) {
        songs.push({
          title: title,
          genre: genre,
          coverImage: coverImg,
          downloadUrl: downloadUrl,
          shareLink: shareLink
        });
      }
    });
    return songs;
  }
  _checkCountdownStatus(html) {
    const $ = cheerio.load(html);
    const countdownText = $("#countdown").text().trim();
    const countdown = parseInt(countdownText);
    const hasProcessingMessage = html.includes("Please wait") || html.includes("processing") || html.includes("countdown");
    const songs = this._parseSongsFromHTML(html);
    return {
      hasCountdown: !isNaN(countdown) && countdown > 0,
      countdownSeconds: countdown,
      hasProcessingMessage: hasProcessingMessage,
      songs: songs,
      isCompleted: songs.length > 0 && !hasProcessingMessage
    };
  }
  async status({
    key
  }) {
    try {
      const {
        key: currentKey
      } = await this._ensureValidSession({
        key: key
      });
      console.log("Proses: Mengecek status musik...");
      const response = await this.client.get("/gerador.php", {
        headers: {
          referer: `${this.baseURL}/create`,
          "cache-control": "max-age=0",
          priority: "u=0, i"
        }
      });
      console.log("Proses: Response status berhasil didapatkan.");
      const status = this._checkCountdownStatus(response.data);
      if (status.isCompleted) {
        console.log(`Proses: Ditemukan ${status.songs.length} lagu. Proses selesai.`);
        return {
          success: true,
          status: "completed",
          songs: status.songs,
          key: currentKey
        };
      } else if (status.hasCountdown) {
        console.log(`Proses: Masih dalam countdown (${status.countdownSeconds} detik).`);
        return {
          success: true,
          status: "processing",
          countdown: status.countdownSeconds,
          message: `Musik masih diproses. Sisa waktu: ${status.countdownSeconds} detik`,
          key: currentKey
        };
      } else if (status.hasProcessingMessage) {
        console.log("Proses: Musik masih diproses (tanpa countdown spesifik).");
        return {
          success: true,
          status: "processing",
          message: "Musik masih diproses, silakan coba lagi dalam beberapa saat",
          key: currentKey
        };
      } else if (status.songs.length > 0) {
        console.log(`Proses: Ditemukan ${status.songs.length} lagu.`);
        return {
          success: true,
          status: "completed",
          songs: status.songs,
          key: currentKey
        };
      } else {
        console.log("Proses: Tidak ada musik yang ditemukan.");
        return {
          success: true,
          status: "no_songs",
          message: "Tidak ada musik yang ditemukan. Silakan buat musik baru.",
          songs: [],
          key: currentKey
        };
      }
    } catch (error) {
      const errorMessage = error.response?.data || error.message;
      console.error(`Proses status gagal: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }
}
export default async function handler(req, res) {
  const {
    action,
    ...params
  } = req.method === "GET" ? req.query : req.body;
  if (!action) {
    return res.status(400).json({
      error: "Parameter 'action' wajib diisi."
    });
  }
  const api = new MusicMakerAIAPI();
  try {
    let response;
    switch (action) {
      case "register":
        response = await api.register();
        break;
      case "generate":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Parameter 'prompt' wajib diisi untuk action 'generate'."
          });
        }
        response = await api.generate(params);
        break;
      case "list_key":
        response = await api.list_key();
        break;
      case "del_key":
        if (!params.key) {
          return res.status(400).json({
            error: "Parameter 'key' wajib diisi untuk action 'del_key'."
          });
        }
        response = await api.del_key(params);
        break;
      case "status":
        if (!params.key) {
          return res.status(400).json({
            error: "Parameter 'key' wajib diisi untuk action 'status'."
          });
        }
        response = await api.status(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Action yang didukung: 'register', 'generate', 'list_key', 'del_key' dan 'status'.`
        });
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL ERROR] Kegagalan pada action '${action}':`, error);
    return res.status(500).json({
      error: error.message || "Terjadi kesalahan internal pada server."
    });
  }
}