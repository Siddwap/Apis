import crypto from "crypto";
import axios from "axios";
class MusicGenerator {
  constructor() {
    this.reportUrl = "https://account-api.musicful.ai/v2/report-data";
    this.descUrl = "https://aimusic-api.musicful.ai/musicful/app/v1/async/description-to-song";
    this.lyricsUrl = "https://aimusic-api.musicful.ai/musicful/app/v1/async/lyrics-to-song";
    this.resultUrl = "https://aimusic-api.musicful.ai/musicful/app/v1/song/result";
    this.key = Buffer.from("147258369topmeidia96385topmeidia", "utf8");
    this.iv = Buffer.from("1597531topmeidia", "utf8");
    this.code = this.genCode();
    console.log(`[INIT] Device ID: ${this.code}`);
  }
  genCode() {
    try {
      return crypto.randomBytes(8).toString("hex");
    } catch (e) {
      console.error("[ERROR] genCode failed:", e.message);
      return "fallback-" + Date.now();
    }
  }
  md5(d) {
    return crypto.createHash("md5").update(String(d)).digest("hex").toUpperCase();
  }
  decrypt(txt) {
    if (!txt || typeof txt !== "string") return "";
    try {
      const buf = Buffer.from(txt, "base64");
      const dec = crypto.createDecipheriv("aes-256-cbc", this.key, this.iv);
      return dec.update(buf, null, "utf8") + dec.final("utf8");
    } catch (e) {
      console.error(`[DECRYPT FAIL] ${e.message}`);
      return txt;
    }
  }
  async auth() {
    const ts = Date.now();
    const sign = this.md5(this.code + ts + "member_sign");
    const body = new URLSearchParams({
      software_code: this.code,
      lang: "EN",
      source_site: "google_play",
      information_sources: "200473",
      operating_type: "phone-app",
      operating_system: "android",
      token: "",
      timestamp: ts.toString(),
      sign: sign
    });
    const {
      data
    } = await axios.post(this.reportUrl, body, {
      timeout: 1e4
    });
    if (!data || data.code !== 200) {
      throw new Error(data?.msg || "Auth failed");
    }
    return data;
  }
  async reqDesc(description) {
    if (!description) throw new Error("Description required");
    const body = new URLSearchParams({
      description: description,
      instrumental: "0",
      mv: "v4.0"
    });
    const {
      data
    } = await axios.post(this.descUrl, body, {
      headers: {
        "tourist-authorization": `Bearer ${this.code}`
      },
      timeout: 15e3
    });
    if (!data || data.status !== 200) throw new Error(data?.message || "Request failed");
    return data.data;
  }
  async reqLyrics({
    lyrics,
    style = "pop",
    title = "Untitled"
  }) {
    if (!lyrics) throw new Error("Lyrics required");
    const body = new URLSearchParams({
      lyrics: lyrics.trim(),
      style: style,
      title: title,
      instrumental: "0",
      mv: "v4.0"
    });
    const {
      data
    } = await axios.post(this.lyricsUrl, body, {
      headers: {
        "tourist-authorization": `Bearer ${this.code}`
      },
      timeout: 15e3
    });
    if (!data || data.status !== 200) throw new Error(data?.message || "Request failed");
    return data.data;
  }
  async checkStatus(ids) {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("Invalid IDs");
    const {
      data
    } = await axios.get(`${this.resultUrl}?ids=${ids.join(",")}`, {
      headers: {
        "tourist-authorization": `Bearer ${this.code}`
      },
      timeout: 1e4
    });
    if (!data || data.status !== 200) throw new Error(data?.message || "Status check failed");
    const result = (data.data?.result || []).map(song => ({
      ...song,
      audio_url: song.status === 0 ? this.decrypt(song.audio_url || "") : song.audio_url,
      cover_url: song.status === 0 ? this.decrypt(song.cover_url || "") : song.cover_url
    }));
    return {
      result: result
    };
  }
  async generate({
    mode = "prompt",
    ...params
  }) {
    await this.auth();
    let taskData;
    if (mode === "lyrics") {
      taskData = await this.reqLyrics(params);
    } else {
      const desc = params.prompt || params.description;
      if (!desc) throw new Error("Prompt or description required");
      taskData = await this.reqDesc(desc);
    }
    return taskData;
  }
  async status({
    task_id,
    ids
  }) {
    const idList = task_id ? [task_id] : Array.isArray(ids) ? ids : [];
    if (idList.length === 0) throw new Error("task_id or ids required");
    await this.auth();
    return await this.checkStatus(idList);
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
  const api = new MusicGenerator();
  try {
    let result;
    switch (action) {
      case "generate":
        if (!params.prompt && !params.lyrics && !params.description) {
          return res.status(400).json({
            error: "Parameter 'prompt', 'description', atau 'lyrics' wajib diisi."
          });
        }
        result = await api.generate(params);
        break;
      case "status":
        if (!params.task_id && !params.ids) {
          return res.status(400).json({
            error: "Parameter 'task_id' atau 'ids' wajib diisi."
          });
        }
        result = await api.status(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Gunakan: generate, status.`
        });
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error(`[ERROR] Action '${action}':`, error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Terjadi kesalahan internal."
    });
  }
}