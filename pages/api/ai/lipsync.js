import axios from "axios";
import {
  randomUUID
} from "crypto";
import Encoder from "@/lib/encoder";
import SpoofHead from "@/lib/spoof-head";
const BASE = "https://lipsync.video/api";
class LipSync {
  constructor(opts = {}) {
    this.uid = opts.userId ?? randomUUID().replace(/-/g, "").slice(0, 32);
    this.auth = opts.authorization ?? `Bearer ${randomUUID()}`;
    this.cookie = opts.cookie ?? "i18n_redirected=id;";
    this.config = {
      baseURL: BASE,
      headers: this.buildHeader({
        referer: "https://lipsync.video/id/my-creations"
      })
    };
    this.ax = axios.create(this.config);
    console.log(`[init] user-id: ${this.uid} | auth: ${this.auth}`);
  }
  buildHeader({
    referer,
    cookie,
    authorization,
    ...extra
  } = {}) {
    return {
      accept: "application/json, text/plain, */*",
      "accept-language": "id-ID",
      "cache-control": "no-cache",
      "content-type": "application/json",
      origin: "https://lipsync.video",
      pragma: "no-cache",
      priority: "u=1, i",
      referer: referer ?? "https://lipsync.video/id/my-creations",
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      cookie: cookie ?? this.cookie,
      "user-id": this.uid,
      authorization: authorization ?? this.auth,
      ...extra,
      ...SpoofHead()
    };
  }
  async enc({
    job_id,
    type
  }) {
    if (!job_id || !type) {
      console.log("[enc] input param required: job_id, type");
      throw new Error("enc: job_id and type are required");
    }
    try {
      const {
        uuid
      } = await Encoder.enc({
        data: {
          job_id: job_id,
          type: type
        },
        method: "combined"
      });
      console.log(`[enc] ${job_id} → ${uuid}`);
      return uuid;
    } catch (e) {
      console.log("[enc] fail:", e.message);
      throw e;
    }
  }
  async dec(task_id) {
    if (!task_id) {
      console.log("[dec] input param required: task_id");
      throw new Error("dec: task_id is required");
    }
    try {
      const {
        text
      } = await Encoder.dec({
        uuid: task_id,
        method: "combined"
      });
      const data = JSON.parse(text);
      console.log(`[dec] ${task_id} → ${data.job_id}`);
      return data;
    } catch (e) {
      console.log("[dec] fail:", e.message);
      throw e;
    }
  }
  buildPayload(type, overrides = {}) {
    const defaults = {
      language: "en",
      subtitle_mode: 1,
      model: "v1",
      speaker: "English_Trustworth_Man",
      speed: 1,
      pitch: 0,
      volume: 5,
      emotion: "neutral",
      estimated_time: 170 + Math.random() * 10
    };
    const job_type = `${type}GeneratedTemplates`;
    return {
      job_type: job_type,
      ...defaults,
      ...overrides
    };
  }
  async generate({
    type,
    image,
    video,
    text,
    referer,
    cookie,
    authorization,
    ...rest
  }) {
    if (!type) {
      console.log("[generate] input param required: type");
      throw new Error("generate: type is required");
    }
    const map = {
      talkingPhoto: {
        url: "tts-cartoon-lipsync/v2/job",
        type: "tts-talking-photo",
        referer: "https://lipsync.video/id/ai-talking-photo-generator",
        required: ["image", "text"]
      },
      baby: {
        url: "tts-cartoon-lipsync/v2/job",
        type: "tts-baby-lipsync",
        referer: "https://lipsync.video/id/ai-baby-podcast",
        required: ["image", "text"]
      },
      cartoon: {
        url: "tts-cartoon-lipsync/v2/job",
        type: "tts-cartoon-lipsync",
        referer: "https://lipsync.video/id/ai-cartoon-lip-sync-generator",
        required: ["image", "text"]
      },
      drawing: {
        url: "tts-cartoon-lipsync/v2/job",
        type: "tts-drawing-lipsync",
        referer: "https://lipsync.video/id/ai-drawing-lip-sync-generator",
        required: ["image", "text"]
      },
      video: {
        url: "tts-lipsync/v2/job",
        type: "tts-lipsync",
        referer: "https://lipsync.video/id",
        required: ["video", "text"]
      }
    };
    const t = map[type];
    if (!t) {
      console.log("[error] type invalid. available:");
      Object.keys(map).forEach(k => console.log(`  - ${k}`));
      return null;
    }
    const missing = t.required.filter(field => !eval(field));
    if (missing.length > 0) {
      console.log(`[generate] input param required: ${missing.join(", ")}`);
      throw new Error(`generate: ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required`);
    }
    const url = t.url;
    const body = this.buildPayload(type, {
      image: image,
      video: video,
      text: text,
      ...rest
    });
    const headers = this.buildHeader({
      referer: referer ?? t.referer,
      cookie: cookie,
      authorization: authorization
    });
    console.log(`[generate] ${type} → POST ${url}`);
    try {
      const res = await this.ax.post(url, body, {
        headers: headers
      });
      const job_id = res.data?.data?.job_id ?? res.data?.job_id;
      if (!job_id) {
        console.log("[generate] no job_id in response");
        return null;
      }
      const task_id = await this.enc({
        job_id: job_id,
        type: t.type
      });
      console.log(`[generate] task_id: ${task_id}`);
      return {
        task_id: task_id
      };
    } catch (e) {
      console.log("[generate] fail:", e.response?.data ?? e.message);
      return null;
    }
  }
  async status({
    task_id,
    referer,
    cookie,
    authorization,
    ...rest
  }) {
    if (!task_id) {
      console.log("[status] input param required: task_id");
      throw new Error("status: task_id is required");
    }
    let payload;
    try {
      payload = await this.dec(task_id);
    } catch (e) {
      throw new Error("Invalid task_id: decryption failed");
    }
    const {
      job_id,
      type
    } = payload;
    if (!job_id || !type) {
      console.log("[status] decrypted data missing: job_id or type");
      throw new Error("Invalid task_id: missing job_id or type");
    }
    const headers = this.buildHeader({
      referer: referer ?? "https://lipsync.video/id/my-creations",
      cookie: cookie,
      authorization: authorization
    });
    console.log(`[status] query ${job_id} (${type})`);
    try {
      const res = await this.ax.post("/workflow/query", {
        jobs: [{
          id: job_id,
          type: type
        }],
        ...rest
      }, {
        headers: headers
      });
      const data = res.data ?? {};
      console.log(`[status] ${data.status ?? "unknown"} (${data.progress ?? 0}%)`);
      return data;
    } catch (e) {
      console.log("[status] fail:", e.response?.data ?? e.message);
      return null;
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
      error: "Action (create or status) is required."
    });
  }
  const api = new LipSync();
  try {
    switch (action) {
      case "create": {
        const {
          type,
          text,
          image,
          video,
          ...rest
        } = params;
        if (!type) {
          return res.status(400).json({
            error: "type is required for 'create' action."
          });
        }
        if (!text) {
          return res.status(400).json({
            error: "text is required for 'create' action."
          });
        }
        const needsImage = ["talkingPhoto", "baby", "cartoon", "drawing"].includes(type);
        const needsVideo = type === "video";
        if (needsImage && !image) {
          return res.status(400).json({
            error: "image is required for this type."
          });
        }
        if (needsVideo && !video) {
          return res.status(400).json({
            error: "video is required for type 'video'."
          });
        }
        const createResponse = await api.generate({
          type: type,
          text: text,
          image: image,
          video: video,
          ...rest
        });
        if (!createResponse?.task_id) {
          return res.status(500).json({
            error: "Failed to create job. No task_id returned."
          });
        }
        return res.status(200).json(createResponse);
      }
      case "status": {
        const {
          task_id
        } = params;
        if (!task_id) {
          return res.status(400).json({
            error: "task_id is required for 'status' action."
          });
        }
        const statusResponse = await api.status({
          task_id: task_id
        });
        if (!statusResponse) {
          return res.status(404).json({
            error: "Task not found or invalid task_id."
          });
        }
        return res.status(200).json(statusResponse);
      }
      default:
        return res.status(400).json({
          error: "Invalid action. Supported actions are 'create' and 'status'."
        });
    }
  } catch (error) {
    console.error("[API Error]", error.message);
    return res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}