import axios from "axios";
import {
  wrapper
} from "axios-cookiejar-support";
import {
  CookieJar
} from "tough-cookie";
import * as cheerio from "cheerio";
import FormData from "form-data";
class PinterestDownloader {
  constructor() {
    console.log("Initializing PinterestDownloader...");
    const jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: jar,
      responseType: "json",
      headers: {
        "X-Requested-With": "XMLHttpRequest"
      }
    }));
    this.baseUrl = "https://pindown.io";
  }
  async download({
    url,
    ...rest
  }) {
    console.log(`Starting download process for URL: ${url}`);
    try {
      console.log("Fetching initial page to get form tokens...");
      const initialResponse = await this.client.get(this.baseUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        responseType: "text",
        ...rest
      });
      const $initial = cheerio.load(initialResponse.data);
      const hiddenInput = $initial('form#get_video input[type="hidden"]');
      const tokenName = hiddenInput.attr("name");
      const tokenValue = hiddenInput.attr("value");
      if (!tokenName || !tokenValue) {
        throw new Error("Could not find the required form token. The website structure might have changed.");
      }
      console.log(`Successfully retrieved dynamic form token: NAME=${tokenName}, VALUE=${tokenValue}`);
      console.log("Sending POST request to get download links...");
      const form = new FormData();
      form.append("url", url);
      form.append(tokenName, tokenValue);
      const actionResponse = await this.client.post(`${this.baseUrl}/action`, form, {
        headers: {
          ...form.getHeaders(),
          Referer: this.baseUrl,
          Accept: "application/json, text/javascript, */*; q=0.01",
          Origin: this.baseUrl,
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36"
        }
      });
      let htmlToParse;
      if (actionResponse.data && actionResponse.data.success && typeof actionResponse.data.html === "string") {
        console.log('JSON response with HTML content received. Parsing the "html" property.');
        htmlToParse = actionResponse.data.html;
      } else {
        console.warn("Response is not the expected JSON format. Attempting to parse as raw HTML.");
        htmlToParse = typeof actionResponse.data === "string" ? actionResponse.data : "";
      }
      if (!htmlToParse) {
        throw new Error("No valid HTML content found in the response from the server.");
      }
      const $result = cheerio.load(htmlToParse);
      const mediaContent = $result(".media-content");
      const title = mediaContent.find("strong")?.text()?.trim() || "No title available";
      const description = mediaContent.find(".video-des")?.text()?.trim() || "No description";
      const image = $result(".media-left .image img");
      const thumbnail = image?.attr("src") || "No thumbnail available";
      const videoPreview = $result(".modal-content video");
      const previewUrl = videoPreview?.attr("src") || "No preview available";
      console.log("Extracting download links from the table...");
      const downloads = [];
      $result(".download-link table tbody tr").each((i, elem) => {
        const type = $result(elem).find(".video-quality")?.text()?.trim();
        const link = $result(elem).find("a.button")?.attr("href");
        if (type && link) {
          downloads.push({
            type: type,
            url: link
          });
        }
      });
      const result = {
        title: title,
        description: description,
        thumbnail: thumbnail,
        preview: previewUrl,
        downloads: downloads
      };
      console.log("Download process completed successfully.");
      return result;
    } catch (error) {
      console.error("An error occurred during the download process:", error.message);
      console.error("Error details:", error.response?.data || error.config || error);
      return {
        error: "Failed to download video.",
        message: error.message
      };
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.url) {
    return res.status(400).json({
      error: "Url are required"
    });
  }
  try {
    const api = new PinterestDownloader();
    const response = await api.download(params);
    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}