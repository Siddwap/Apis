import crypto from "crypto";
import axios from "axios";
class MusicFull {
  constructor() {
    try {
      this.reportUrl = "https://account-api.musicful.ai/v2/report-data";
      this.descUrl = "https://aimusic-api.musicful.ai/musicful/app/v1/async/description-to-song";
      this.lyricsUrl = "https://aimusic-api.musicful.ai/musicful/app/v1/async/lyrics-to-song";
      this.resultUrl = "https://aimusic-api.musicful.ai/musicful/app/v1/song/result";
      this.key = Buffer.from("147258369topmeidia96385topmeidia", "utf8");
      this.iv = Buffer.from("1597531topmeidia", "utf8");
      this.pollInt = 1e4;
      this.pollMax = 30;
      this.code = this.genCode();
      console.log(`[INIT] Device ID: ${this.code}`);
    } catch (e) {
      console.error("[FATAL] Constructor failed:", e.message);
      throw e;
    }
  }
  genCode() {
    try {
      const code = crypto.randomBytes(8).toString("hex");
      console.log(`[GEN] Code: ${code}`);
      return code;
    } catch (e) {
      console.error("[ERROR] genCode failed:", e.message);
      return "fallback-" + Date.now();
    }
  }
  md5(d) {
    try {
      const hash = crypto.createHash("md5").update(String(d)).digest("hex").toUpperCase();
      console.log(`[HASH] MD5(${d}) → ${hash}`);
      return hash;
    } catch (e) {
      console.error("[ERROR] md5 failed:", e.message);
      return "";
    }
  }
  decrypt(txt) {
    if (!txt || typeof txt !== "string") {
      console.warn("[WARN] decrypt: invalid input");
      return "";
    }
    try {
      const buf = Buffer.from(txt, "base64");
      const dec = crypto.createDecipheriv("aes-256-cbc", this.key, this.iv);
      const result = dec.update(buf, null, "utf8") + dec.final("utf8");
      console.log(`[DECRYPT] Success: ${txt.substring(0, 20)}... → ${result.substring(0, 30)}...`);
      return result;
    } catch (e) {
      console.error(`[DECRYPT FAIL] ${txt.substring(0, 20)}... → ${e.message}`);
      return txt;
    }
  }
  async auth() {
    let ts, sign, body;
    try {
      ts = Date.now();
      sign = this.md5(this.code + ts + "member_sign");
      body = new URLSearchParams({
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
      console.log(`[AUTH] POST ${this.reportUrl}`);
      const {
        data
      } = await axios.post(this.reportUrl, body, {
        timeout: 1e4
      });
      if (!data || data.code !== 200) {
        throw new Error(data?.msg || "Unknown auth error");
      }
      console.log(`[AUTH] Success: ${data.data?.user_id || "OK"}`);
    } catch (e) {
      console.error(`[AUTH FAIL] ${e.message}`);
      throw new Error(`Auth failed: ${e.message}`);
    }
  }
  async reqDesc(desc) {
    if (!desc || typeof desc !== "string") throw new Error("Description required");
    try {
      const body = new URLSearchParams({
        description: desc,
        instrumental: "0",
        mv: "v4.0"
      });
      console.log(`[REQ DESC] "${desc.substring(0, 50)}..."`);
      const {
        data
      } = await axios.post(this.descUrl, body, {
        headers: {
          "tourist-authorization": `Bearer ${this.code}`
        },
        timeout: 15e3
      });
      if (!data || data.status !== 200) throw new Error(data?.message || "Request failed");
      const ids = data.data?.ids || [];
      console.log(`[REQ DESC] Success: ${ids.length} IDs → [${ids.join(", ")}]`);
      return ids;
    } catch (e) {
      console.error(`[REQ DESC FAIL] ${e.message}`);
      throw e;
    }
  }
  async reqLyrics({
    lyrics,
    style,
    title
  }) {
    if (!lyrics) throw new Error("Lyrics required");
    try {
      const body = new URLSearchParams({
        lyrics: lyrics.trim(),
        style: style || "pop",
        title: title || "Untitled",
        instrumental: "0",
        mv: "v4.0"
      });
      console.log(`[REQ LYRICS] Title: "${title || "Untitled"}" | Style: ${style || "default"}`);
      const {
        data
      } = await axios.post(this.lyricsUrl, body, {
        headers: {
          "tourist-authorization": `Bearer ${this.code}`
        },
        timeout: 15e3
      });
      if (!data || data.status !== 200) throw new Error(data?.message || "Request failed");
      const ids = data.data?.ids || [];
      console.log(`[REQ LYRICS] Success: ${ids.length} IDs → [${ids.join(", ")}]`);
      return ids;
    } catch (e) {
      console.error(`[REQ LYRICS FAIL] ${e.message}`);
      throw e;
    }
  }
  async poll(ids) {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("Invalid IDs");
    console.log(`[POLL START] ${ids.length} IDs: [${ids.join(", ")}]`);
    for (let i = 1; i <= this.pollMax; i++) {
      try {
        const {
          data
        } = await axios.get(`${this.resultUrl}?ids=${ids.join(",")}`, {
          headers: {
            "tourist-authorization": `Bearer ${this.code}`
          },
          timeout: 1e4
        });
        if (!data || data.status !== 200) throw new Error(data?.message || "Poll failed");
        const songs = data.data?.result || [];
        console.log(`[POLL ${i}/${this.pollMax}] ${songs.length} songs checked`);
        const allDone = songs.every(s => s.status === 0 || s.fail_code !== null);
        if (allDone) {
          const success = songs.filter(s => s.status === 0).length;
          console.log(`[POLL DONE] ${success}/${songs.length} succeeded`);
          return songs;
        }
        console.log(`[POLL WAIT] ${this.pollInt / 1e3}s...`);
        await new Promise(r => setTimeout(r, this.pollInt));
      } catch (e) {
        console.error(`[POLL ${i} FAIL] ${e.message}`);
        if (i === this.pollMax) throw e;
        await new Promise(r => setTimeout(r, this.pollInt));
      }
    }
    throw new Error("Polling exhausted all attempts");
  }
  async run(reqFn) {
    console.log("[RUN] Starting generation flow...");
    try {
      await this.auth();
      const ids = await reqFn();
      if (!ids?.length) throw new Error("No song IDs returned");
      const raw = await this.poll(ids);
      const result = raw.map(s => {
        const base = {
          id: s.id
        };
        return s.status === 0 ? {
          ...base,
          status: "Success",
          duration: (s.duration || 0) / 1e3,
          audio: this.decrypt(s.audio_url || ""),
          cover: this.decrypt(s.cover_url || "")
        } : {
          ...base,
          status: "Failed",
          fail: s.fail_code ?? "unknown"
        };
      });
      console.log(`[RUN] Complete: ${result.filter(r => r.status === "Success").length} songs ready`);
      return result;
    } catch (e) {
      console.error(`[RUN ERROR] ${e.message}`);
      throw e;
    }
  }
  async generate({
    mode = "prompt",
    ...rest
  }) {
    console.log(`[GENERATE] Mode: ${mode}`);
    try {
      return mode === "lyrics" ? this.run(() => this.reqLyrics(rest)) : this.run(() => this.reqDesc(rest.prompt ?? rest.description ?? ""));
    } catch (e) {
      console.error(`[GENERATE FAIL] ${e.message}`);
      throw e;
    }
  }
  async status({
    task_id,
    ...rest
  }) {
    const ids = task_id ? [task_id] : rest.ids || [];
    if (!ids.length) {
      console.error("[STATUS] No IDs provided");
      throw new Error("task_id or ids required");
    }
    console.log(`[STATUS] Checking: [${ids.join(", ")}]`);
    try {
      const raw = await this.poll(ids);
      const result = raw.map(s => ({
        id: s.id,
        status: s.status === 0 ? "ready" : "processing",
        fail: s.fail_code ?? null,
        duration: s.duration ? s.duration / 1e3 : null
      }));
      console.log(`[STATUS] Result: ${result.filter(r => r.status === "ready").length} ready`);
      return result;
    } catch (e) {
      console.error(`[STATUS FAIL] ${e.message}`);
      throw e;
    }
  }
  static async handle(req, res) {
    const {
      action,
      ...params
    } = req.method === "GET" ? req.query : req.body;
    if (!action) {
      return res.status(400).json({
        error: "Parameter 'action' wajib diisi."
      });
    }
    const api = new MusicFull();
    try {
      let response;
      switch (action) {
        case "generate":
          if (!params.prompt) {
            return res.status(400).json({
              error: "Parameter 'prompt' wajib diisi untuk action 'generate'."
            });
          }
          response = await api.generate({
            mode: params.lyrics ? "lyrics" : "prompt",
            ...params
          });
          break;
        case "status":
          if (!params.task_id) {
            return res.status(400).json({
              error: "Parameter 'task_id' wajib diisi untuk action 'status'."
            });
          }
          response = await api.status(params);
          break;
        default:
          return res.status(400).json({
            error: `Action tidak valid: ${action}. Gunakan 'generate' atau 'status'.`
          });
      }
      return res.status(200).json({
        success: true,
        data: response
      });
    } catch (error) {
      console.error(`[HANDLER FATAL] Action '${action}':`, error.message);
      return res.status(500).json({
        success: false,
        error: error.message || "Terjadi kesalahan internal pada server."
      });
    }
  }
}