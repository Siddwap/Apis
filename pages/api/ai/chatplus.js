import axios from "axios";
import crypto from "crypto";
class ChatPlusAPI {
  constructor() {
    this.client = axios.create({
      baseURL: "https://chatplus.com/api",
      headers: {
        Accept: "*/*",
        "Accept-Language": "id-ID",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "application/json",
        Origin: "https://chatplus.com",
        Pragma: "no-cache",
        Referer: "https://chatplus.com/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"'
      }
    });
  }
  async chat({
    prompt,
    messages = [],
    sessionId = `guest_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    model = "gpt-4o-mini",
    ...rest
  }) {
    try {
      console.log("Proses chat dimulai...", {
        sessionId: sessionId,
        prompt: prompt?.slice(0, 50),
        messagesCount: messages.length
      });
      const allMessages = [...messages, ...prompt ? [{
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        role: "user",
        content: prompt,
        parts: [{
          type: "text",
          text: prompt
        }]
      }] : []];
      if (!allMessages.length) {
        throw new Error("Prompt or messages is required");
      }
      const payload = {
        id: sessionId,
        messages: allMessages,
        selectedChatModelId: model,
        token: null,
        ...rest
      };
      console.log("Mengirim request...", {
        sessionId: sessionId,
        messagesCount: allMessages.length
      });
      const response = await this.client.post("/chat", payload);
      console.log("Response diterima:", response?.status);
      const data = response?.data || "";
      const lines = data.split("\n");
      const result = lines.filter(line => line.trim() && !line.startsWith("e:") && !line.startsWith("d:")).map(line => {
        const colonIndex = line.indexOf(":");
        if (colonIndex !== -1) {
          const content = line.slice(colonIndex + 1).trim();
          if (content.startsWith('"') && content.endsWith('"')) {
            return content.slice(1, -1);
          }
          return content;
        }
        return line;
      }).filter(text => text && text !== "null").join("");
      const eventLine = lines.find(line => line.startsWith("e:") || line.startsWith("d:"));
      const eventData = eventLine ? JSON.parse(eventLine.slice(2)) : {};
      const usage = eventData?.usage || {
        promptTokens: null,
        completionTokens: null
      };
      const reason = eventData?.finishReason || "unknown";
      console.log("Proses selesai:", {
        resultLength: result.length,
        usage: usage,
        reason: reason
      });
      return {
        result: result || "No response",
        sessionId: sessionId,
        usage: usage,
        reason: reason,
        messageId: lines.find(line => line.startsWith("f:"))?.slice(2)?.replace(/"/g, "") || null
      };
    } catch (error) {
      console.error("Error pada chat:", error?.response?.data || error?.message);
      return {
        result: "Error: " + (error?.response?.data?.message || error?.message || "Unknown error"),
        sessionId: sessionId,
        usage: {
          promptTokens: null,
          completionTokens: null
        },
        reason: "error",
        messageId: null
      };
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt) {
    return res.status(400).json({
      error: "Prompt is required"
    });
  }
  try {
    const api = new ChatPlusAPI();
    const response = await api.chat(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}