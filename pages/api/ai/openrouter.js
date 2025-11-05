import fetch from "node-fetch";
class OpenRouterAPI {
  constructor() {
    this.config = {
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "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",
      defaultPayload: {
        model: "openai/gpt-4o",
        temperature: .7,
        max_tokens: 1e3
      },
      endpoints: {
        chat: "/chat/completions",
        completions: "/completions",
        models: "/models",
        credits: "/credits"
      }
    };
  }
  async chat({
    prompt = "",
    messages = [],
    model,
    ...rest
  }) {
    console.log("[Chat] Starting chat request...");
    try {
      const endpoint = this.config.endpoints?.chat || "/chat/completions";
      const url = `${this.config.baseUrl}${endpoint}`;
      console.log(`[Chat] URL: ${url}`);
      console.log(`[Chat] Messages count: ${messages.length}`);
      const payload = {
        model: model || this.config.defaultPayload?.model || "openai/gpt-4o",
        messages: messages.length ? messages : [{
          role: "user",
          content: prompt
        }],
        ...this.config.defaultPayload,
        ...rest
      };
      console.log("[Chat] Sending request with payload:", JSON.stringify(payload, null, 2));
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(payload)
      });
      console.log(`[Chat] Response status: ${response.status} ${response.statusText}`);
      const data = await response.json();
      if (!response.ok) {
        console.error("[Chat] Error response:", data);
        throw new Error(data?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      console.log("[Chat] Request successful");
      return data;
    } catch (error) {
      console.error("[Chat] Error occurred:", error.message);
      throw error;
    }
  }
  async completions({
    prompt = "",
    model,
    ...rest
  }) {
    console.log("[Completions] Starting completions request...");
    try {
      const endpoint = this.config.endpoints?.completions || "/completions";
      const url = `${this.config.baseUrl}${endpoint}`;
      console.log(`[Completions] URL: ${url}`);
      console.log(`[Completions] Prompt length: ${prompt.length}`);
      const payload = {
        model: model || this.config.defaultPayload?.model || "openai/gpt-4o",
        prompt: prompt || "Hello",
        ...this.config.defaultPayload,
        ...rest
      };
      console.log("[Completions] Sending request...");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(payload)
      });
      console.log(`[Completions] Response status: ${response.status} ${response.statusText}`);
      const data = await response.json();
      if (!response.ok) {
        console.error("[Completions] Error response:", data);
        throw new Error(data?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      console.log("[Completions] Request successful");
      return data;
    } catch (error) {
      console.error("[Completions] Error occurred:", error.message);
      throw error;
    }
  }
  async models({
    ...rest
  }) {
    console.log("[Models] Fetching available models...");
    try {
      const endpoint = this.config.endpoints?.models || "/models";
      const url = `${this.config.baseUrl}${endpoint}`;
      console.log(`[Models] URL: ${url}`);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          ...rest.headers
        }
      });
      console.log(`[Models] Response status: ${response.status} ${response.statusText}`);
      const data = await response.json();
      if (!response.ok) {
        console.error("[Models] Error response:", data);
        throw new Error(data?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      console.log(`[Models] Found ${data?.data?.length || 0} models`);
      return data;
    } catch (error) {
      console.error("[Models] Error occurred:", error.message);
      throw error;
    }
  }
  async credits({
    ...rest
  }) {
    console.log("[Credits] Fetching credit balance...");
    try {
      const endpoint = this.config.endpoints?.credits || "/credits";
      const url = `${this.config.baseUrl}${endpoint}`;
      console.log(`[Credits] URL: ${url}`);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          ...rest.headers
        }
      });
      console.log(`[Credits] Response status: ${response.status} ${response.statusText}`);
      const data = await response.json();
      if (!response.ok) {
        console.error("[Credits] Error response:", data);
        throw new Error(data?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      console.log("[Credits] Balance retrieved successfully");
      return data;
    } catch (error) {
      console.error("[Credits] Error occurred:", error.message);
      throw error;
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
      error: "Paramenter 'action' wajib diisi."
    });
  }
  const api = new OpenRouterAPI();
  try {
    let response;
    switch (action) {
      case "chat":
        if (!params.messages) {
          return res.status(400).json({
            error: "Paramenter 'messages' wajib diisi untuk action 'chat'."
          });
        }
        response = await api.chat(params);
        break;
      case "completions":
        if (!params.prompt) {
          return res.status(400).json({
            error: "Paramenter 'prompt' wajib diisi untuk action 'completions'."
          });
        }
        response = await api.completions(params);
        break;
      case "models":
        response = await api.models();
        break;
      case "credits":
        response = await api.credits();
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Action yang didukung: 'chat', 'completions', 'models', 'credits'.`
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