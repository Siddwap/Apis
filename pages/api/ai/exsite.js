import axios from "axios";
import {
  CookieJar
} from "tough-cookie";
import {
  wrapper
} from "axios-cookiejar-support";
import FormData from "form-data";
import {
  randomBytes
} from "crypto";
import apiConfig from "@/configs/apiConfig";
import SpoofHead from "@/lib/spoof-head";
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
      console.error("[WUDYSOFT] createPaste failed:", error.response?.data || error.message);
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
      console.error("[WUDYSOFT] getPaste failed:", error.response?.data || error.message);
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
      console.error("[WUDYSOFT] listPastes failed:", error.response?.data || error.message);
      return [];
    }
  }
  async deletePaste(key) {
    try {
      const response = await this.client.get("/tools/paste/v1", {
        params: {
          action: "delete",
          key: key
        }
      });
      return true;
    } catch (error) {
      console.error("[WUDYSOFT] deletePaste failed:", error.response?.data || error.message);
      return false;
    }
  }
}
export class ExsiteAI {
  constructor() {
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.jar,
      timeout: 3e4
    }));
    this.csrfToken = null;
    this.socketId = null;
    this.sessionKey = null;
    this.wudysoft = new WudysoftAPI();
  }
  log = console.log;
  error = console.error;
  d = (v, def) => v ?? def;
  o = (obj, key, def) => obj?.[key] ?? def;
  r = () => randomBytes(8).toString("hex");
  models = {
    openai: {
      id: 32,
      field: "description",
      defaults: {
        size: "1024x1024",
        quality: "standard",
        image_style: "",
        image_lighting: "",
        image_mood: "",
        image_number_of_images: "1"
      }
    },
    "gpt-image-1": {
      id: 32,
      field: "stable_description",
      defaults: {
        size: "1024x1024",
        quality: "standard",
        image_style: "",
        image_lighting: "",
        image_mood: "",
        image_number_of_images: "1"
      }
    },
    stable_diffusion: {
      id: 32,
      field: "stable_description",
      defaults: {
        type: "text-to-image",
        negative_prompt: "",
        style_preset: "",
        image_mood: "",
        sampler: "",
        clip_guidance_preset: "",
        image_resolution: "1x1",
        image_number_of_images: "1"
      }
    },
    midjourney: {
      id: 32,
      field: "description_midjourney",
      defaults: {
        model: "midjourney",
        image_generator: "midjourney",
        image_number_of_images: "1",
        image_mood: "null",
        size: "null",
        image_style: "null",
        image_lighting: "null",
        quality: "null",
        type: "null",
        stable_description: "null",
        negative_prompt: "null",
        style_preset: "null",
        sampler: "null",
        clip_guidance_preset: "null",
        image_resolution: "1x1",
        description: ""
      }
    }
  };
  base = "https://ai.exsite.app";
  headers() {
    return {
      accept: "*/*",
      "accept-language": "id-ID",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      "x-requested-with": "XMLHttpRequest",
      origin: this.base,
      referer: `${this.base}/dashboard/user/openai/generator/ai_image_generator`,
      priority: "u=1, i",
      ...SpoofHead()
    };
  }
  async ensureKey(key) {
    if (this.sessionKey) return this.sessionKey;
    if (!key) throw new Error("Key required. Use register() or loadSessionKey()");
    await this.loadSessionKey(key);
    return this.sessionKey;
  }
  async register() {
    try {
      this.log("[REGISTER] Starting...");
      const name = `u_${this.r()}`;
      const email = `${this.r()}@emailhook.site`;
      const pass = `${this.r().toUpperCase()}A1!`;
      const form = new FormData();
      form.append("name", name);
      form.append("surname", name + "x");
      form.append("email", email);
      form.append("password", pass);
      form.append("password_confirmation", pass);
      form.append("plan", "");
      form.append("affiliate_code", "");
      const h = {
        ...this.headers(),
        "content-type": form.getHeaders()["content-type"],
        referer: `${this.base}/register`
      };
      await this.client.post(`${this.base}/register`, form.getBuffer(), {
        headers: h
      });
      this.log("[REGISTER] Success");
      this.sessionKey = await this.wudysoft.createPaste(`exsite_${this.r()}`, JSON.stringify({
        email: email,
        pass: pass,
        name: name
      }));
      this.log("[REGISTER] Session saved → key:", this.sessionKey);
      await this.dash();
      return {
        key: this.sessionKey,
        email: email,
        name: name
      };
    } catch (err) {
      this.error("[REGISTER] Failed →", this.o(err, "response.data.message", err.message));
      throw err;
    }
  }
  async loadSessionKey(key) {
    try {
      this.log("[LOAD] Loading key:", key);
      const raw = await this.wudysoft.getPaste(key);
      if (!raw) throw new Error("Key not found");
      this.sessionKey = key;
      await this.dash();
      this.log("[LOAD] Loaded");
      return {
        key: key
      };
    } catch (err) {
      this.error("[LOAD] Failed →", err.message);
      throw err;
    }
  }
  async generate({
    key,
    model = "midjourney",
    prompt,
    imageUrl,
    ...rest
  }) {
    try {
      await this.ensureKey(key);
      await this.dash();
      if (!this.csrfToken) throw new Error("CSRF token missing");
      if (!this.models[model]) throw new Error(`Model "${model}" not supported`);
      const config = this.models[model];
      const isImg = !!imageUrl;
      const payload = {
        post_type: "ai_image_generator",
        openai_id: String(config.id),
        custom_template: "0",
        ...config.defaults,
        [config.field]: prompt || "",
        description: model === "midjourney" ? prompt || "" : "",
        ...rest
      };
      if (model === "stable_diffusion") {
        payload.type = isImg ? "image-to-image" : "text-to-image";
      }
      if (isImg) {
        payload.image_src = await this.img(imageUrl);
      }
      const form = new FormData();
      for (const [k, v] of Object.entries(payload)) {
        if (v != null) {
          if (v && typeof v === "object" && v.value && v.options) {
            form.append(k, v.value, v.options);
          } else {
            form.append(k, String(v));
          }
        }
      }
      const h = {
        ...this.headers(),
        "content-type": form.getHeaders()["content-type"],
        "x-csrf-token": this.csrfToken,
        "x-socket-id": this.socketId || "x"
      };
      this.log(`[GEN] ${isImg ? "img2img" : "txt2img"} → model: ${model}, prompt: "${prompt}"`);
      const res = await this.client.post(`${this.base}/dashboard/user/openai/generate`, form.getBuffer(), {
        headers: h
      });
      return {
        ...res.data,
        key: this.sessionKey
      };
    } catch (err) {
      this.error("[GEN] Failed →", this.o(err, "response.data.message", err.message));
      throw err;
    }
  }
  async status({
    key,
    offset = 5
  }) {
    try {
      await this.ensureKey(key);
      await this.dash();
      const h = {
        ...this.headers(),
        "x-csrf-token": this.csrfToken,
        "x-socket-id": this.socketId || "x"
      };
      this.log(`[LAZYLOAD] Fetching offset: ${offset}`);
      const res = await this.client.get(`${this.base}/dashboard/user/openai/generate/lazyload`, {
        headers: h,
        params: {
          offset: offset,
          post_type: "ai_image_generator"
        }
      });
      return {
        ...res.data,
        key: this.sessionKey
      };
    } catch (err) {
      this.error("[LAZYLOAD] Failed →", err.message);
      throw err;
    }
  }
  async listKeys() {
    const all = await this.wudysoft.listPastes();
    return all.filter(p => p.title?.startsWith("exsite_")).map(p => ({
      key: p.key,
      title: p.title
    }));
  }
  async deleteKey({
    key
  }) {
    const ok = await this.wudysoft.deletePaste(key);
    if (this.sessionKey === key) this.sessionKey = null;
    return {
      success: ok,
      key: key
    };
  }
  async dash() {
    try {
      const res = await this.client.get(`${this.base}/dashboard`, {
        headers: this.headers()
      });
      const html = res.data;
      this.csrfToken = html.match(/name="csrf-token" content="([^"]+)"/)?.[1] || this.csrfToken;
      this.socketId = html.match(/"socketId":"([^"]+)"/)?.[1] || this.socketId;
    } catch (err) {
      this.error("[DASH] Failed →", err.message);
    }
  }
  async img(src) {
    if (!src) return null;
    let buffer, filename = "image.png",
      contentType = "image/png";
    if (Buffer.isBuffer(src)) {
      buffer = src;
    } else if (typeof src === "string") {
      if (src.startsWith("http")) {
        const res = await this.client.get(src, {
          responseType: "arraybuffer"
        });
        buffer = Buffer.from(res.data);
        contentType = res.headers["content-type"] || contentType;
      } else if (src.startsWith("data:")) {
        const match = src.match(/^data:([^;]+);/);
        if (match) contentType = match[1];
        buffer = Buffer.from(src.split(",")[1], "base64");
      }
    } else {
      throw new Error("imageUrl: URL/base64/Buffer only");
    }
    return {
      value: buffer,
      options: {
        filename: filename,
        contentType: contentType
      }
    };
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
  const api = new ExsiteAI();
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
        response = await api.listKeys();
        break;
      case "del_key":
        if (!params.key) {
          return res.status(400).json({
            error: "Parameter 'key' wajib diisi untuk action 'del_key'."
          });
        }
        response = await api.deleteKey(params);
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
          error: `Action tidak valid: ${action}. Action yang didukung: register, generate, list_key, del_key, status.`
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