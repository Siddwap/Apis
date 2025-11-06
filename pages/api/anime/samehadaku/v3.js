import axios from "axios";
import * as cheerio from "cheerio";
import PROXY from "@/configs/proxy-url";
const proxy = PROXY.url;
console.log("CORS proxy", proxy);
class SamehadakuScraper {
  constructor() {
    this.base = "https://v1.samehadaku.how";
    this.corsProxy = proxy;
    this.headers = {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "cache-control": "no-cache"
    };
  }
  async fetchPage(url) {
    const proxiedUrl = `${this.corsProxy}${url}`;
    console.log(`[FETCH] Mengakses: ${proxiedUrl}`);
    try {
      const {
        data
      } = await axios.get(proxiedUrl, {
        headers: this.headers
      });
      return cheerio.load(data);
    } catch (error) {
      console.error(`[FETCH ERROR] Gagal mengambil URL ${url}: ${error.message}`);
      throw new Error(`Gagal mengambil data dari server: ${error.message}`);
    }
  }
  async home() {
    console.log("[HOME] Memproses halaman utama...");
    try {
      const $ = await this.fetchPage(this.base);
      const top10 = [];
      $(".widget-post .topten-animesu li").each((i, el) => {
        const $a = $(el).find("a.series");
        const rankText = $a.find("b.is-topten b:last-child").text().trim();
        const ratingText = $a.find("span.rating").text().trim().replace(/[^0-9.]/g, "");
        if ($a.attr("href")) {
          top10.push({
            title: $a.find("span.judul").text().trim(),
            url: $a.attr("href"),
            postId: $a.attr("rel") || null,
            thumbnail: $a.find("img").attr("src"),
            rating: parseFloat(ratingText) || 0,
            rank: parseInt(rankText) || 0
          });
        }
      });
      const latestAnime = [];
      $('.widget_senction:has(.widget-title:contains("Anime Terbaru")) .post-show ul li').each((i, el) => {
        const $el = $(el);
        const $link = $el.find(".thumb a");
        const $dtla = $el.find(".dtla");
        let releasedOnText = $dtla.find('span:contains("Released on")').text().trim();
        releasedOnText = releasedOnText.replace(/.*?:/, "").trim();
        releasedOnText = releasedOnText.replace(/yang lalu/, "").trim();
        if ($link.attr("href")) {
          latestAnime.push({
            title: $dtla.find("h2.entry-title a").text().trim(),
            url: $link.attr("href"),
            thumbnail: $link.find("img").attr("src"),
            episode: $dtla.find('span:contains("Episode") author').text().trim(),
            postedBy: $dtla.find('span:contains("Posted by") author').text().trim(),
            releasedOn: releasedOnText
          });
        }
      });
      console.log(`[HOME] Ditemukan ${top10.length} Top 10 dan ${latestAnime.length} Anime Terbaru.`);
      return {
        ok: true,
        data: {
          top10: top10,
          latestAnime: latestAnime
        },
        totalTop10: top10.length,
        totalLatest: latestAnime.length
      };
    } catch (e) {
      console.error(`[HOME] Error: ${e.message}`);
      return {
        ok: false,
        error: e.message || "Terjadi kesalahan saat memproses halaman home"
      };
    }
  }
  async releaseSchedule() {
    console.log(`[SCHEDULE] Memproses jadwal rilis...`);
    try {
      const url = `${this.base}/jadwal-rilis/`;
      const $ = await this.fetchPage(url);
      const days = [];
      $("#the-days ul li div").each((i, el) => {
        const $el = $(el);
        days.push({
          dayId: $el.attr("data-day"),
          name: $el.find("span").text().trim(),
          isActive: $el.hasClass("on")
        });
      });
      const schedule = [];
      $(".result-schedule .animepost").each((i, el) => {
        const $el = $(el);
        const $a = $el.find(".animposx > a");
        const scoreText = $a.find(".content-thumb .score").text().trim().replace(/[^0-9.]/g, "") || "0";
        let releaseTimeText = $el.find(".data_tw .ltseps").text().trim();
        releaseTimeText = releaseTimeText.replace(/<i class="fa fa-clock-o"><\/i>/g, "").trim();
        if ($a.attr("href")) {
          schedule.push({
            title: $a.find(".data .title").text().trim(),
            url: $a.attr("href"),
            postId: $el.find(".animposx a").attr("rel") || null,
            thumbnail: $a.find(".content-thumb img").attr("src"),
            type: $a.find(".content-thumb .type").text().trim(),
            score: parseFloat(scoreText) || 0,
            genre: $a.find(".data .type").text().trim(),
            releaseTime: releaseTimeText
          });
        }
      });
      console.log(`[SCHEDULE] Ditemukan ${schedule.length} anime pada jadwal.`);
      return {
        ok: true,
        data: {
          days: days,
          schedule: schedule
        },
        total: schedule.length
      };
    } catch (e) {
      console.error(`[SCHEDULE] Error: ${e.message}`);
      return {
        ok: false,
        error: e.message || "Terjadi kesalahan saat memproses jadwal rilis"
      };
    }
  }
  async search({
    query
  }) {
    console.log(`[SEARCH] Memproses query: ${query}`);
    try {
      const url = `${this.base}/?s=${encodeURIComponent(query)}`;
      const $ = await this.fetchPage(url);
      const searchResults = [];
      $("main#main.site-main article.animpost").each((i, el) => {
        const $el = $(el);
        const $link = $el.find(".animposx a");
        const $stooltip = $el.find(".stooltip");
        const scoreText = $el.find(".content-thumb .score").text().trim().replace(/[^0-9.]/g, "") || "0";
        let viewsText = $stooltip.find(".metadata span:contains('Views')").text().trim();
        viewsText = viewsText.replace("Views", "").trim();
        const postId = $el.attr("id")?.replace("post-", "") || null;
        const genres = [];
        $stooltip.find(".genres a").each((i, el) => {
          genres.push({
            name: $(el).text().trim(),
            url: $(el).attr("href")
          });
        });
        if ($link.attr("href")) {
          searchResults.push({
            title: $el.find(".data h2").text().trim(),
            url: $link.attr("href"),
            postId: postId,
            thumbnail: $el.find(".content-thumb img").attr("src"),
            type: $el.find(".content-thumb .type").text().trim(),
            status: $el.find(".data .type").text().trim(),
            score: parseFloat(scoreText) || 0,
            views: viewsText,
            synopsis: $stooltip.find(".ttls").text().trim(),
            genres: genres
          });
        }
      });
      console.log(`[SEARCH] Ditemukan ${searchResults.length} hasil`);
      return {
        ok: true,
        data: searchResults,
        total: searchResults.length
      };
    } catch (e) {
      console.error(`[SEARCH] Error: ${e.message}`);
      return {
        ok: false,
        error: e.message || "Terjadi kesalahan saat pencarian"
      };
    }
  }
  async detail({
    url
  }) {
    console.log(`[DETAIL] Memproses URL: ${url}`);
    try {
      const $ = await this.fetchPage(url);
      const title = $("#infoarea .entry-header.info_episode h1.entry-title").text().trim().replace("Sub Indo", "").trim();
      const postId = $('article[id^="post-"]').attr("id")?.replace("post-", "") || null;
      const synopsis = $(".infoanime .infox .desc .entry-content-single").text().trim();
      const thumbnail = $(".infoanime .thumb img").attr("src");
      const rating = parseFloat($('.infoanime .thumb .rtg span[itemprop="ratingValue"]').text().trim()) || 0;
      const ratingCount = parseInt($('.infoanime .thumb .rtg i[itemprop="ratingCount"]').attr("content")) || 0;
      const ratingPercentMatch = $(".infoanime .thumb .rtg span").attr("style")?.match(/width:(\d+)%/);
      const ratingPercent = ratingPercentMatch ? parseInt(ratingPercentMatch[1]) : 0;
      const genres = [];
      $(".infoanime .infox .genre-info a").each((i, el) => {
        genres.push({
          name: $(el).text().trim(),
          url: $(el).attr("href")
        });
      });
      const animeDetails = {};
      $(".anim-senct .right-senc .spe span").each((i, el) => {
        const $el = $(el);
        const rawText = $el.text().trim();
        const parts = rawText.split(":");
        if (parts.length >= 2) {
          const rawKey = $el.find("b").text().trim();
          let key = rawKey.toLowerCase().replace(/\s/g, "");
          let value = parts.slice(1).join(":").trim();
          if ($el.find("a").length > 0) {
            const items = [];
            $el.find("a").each((i, a) => {
              items.push({
                name: $(a).text().trim(),
                url: $(a).attr("href")
              });
            });
            animeDetails[key] = items;
          } else {
            if (key === "released") {
              value = value.replace(/\s*-\s*[\w\s,]+$/, "").trim();
            }
            animeDetails[key] = value;
          }
        }
      });
      const episodes = [];
      $(".lstepsiode.listeps ul li").each((i, el) => {
        const $el = $(el);
        const $rightLink = $el.find(".epsright .eps a");
        const $leftLink = $el.find(".epsleft .lchx a");
        if ($leftLink.attr("href")) {
          episodes.push({
            number: $rightLink.text().trim(),
            title: $leftLink.text().trim(),
            url: $leftLink.attr("href"),
            releaseDate: $el.find(".epsleft .date").text().trim()
          });
        }
      });
      const relatedSeries = [];
      $(".widget-post .rand-animesu li").each((i, el) => {
        const $a = $(el).find("a.series");
        const ratingText = $a.find("span.rating").text().trim().replace(/[^0-9.]/g, "") || "0";
        if ($a.attr("href")) {
          relatedSeries.push({
            title: $a.find("span.judul").text().trim(),
            url: $a.attr("href"),
            postId: $a.attr("rel") || null,
            thumbnail: $a.find("img").attr("src"),
            latestEpisode: $a.find("span.episode").text().trim(),
            rating: parseFloat(ratingText) || 0
          });
        }
      });
      console.log(`[DETAIL] Berhasil: ${title} dengan ${episodes.length} episode`);
      return {
        ok: true,
        data: {
          title: title,
          postId: postId,
          synopsis: synopsis,
          thumbnail: thumbnail,
          rating: rating,
          ratingCount: ratingCount,
          ratingPercent: ratingPercent,
          details: animeDetails,
          genres: genres,
          episodes: episodes.reverse(),
          relatedSeries: relatedSeries,
          totalEpisodes: episodes.length,
          totalRelated: relatedSeries.length
        }
      };
    } catch (e) {
      console.error(`[DETAIL] Error: ${e.message}`);
      return {
        ok: false,
        error: e.message || "Terjadi kesalahan saat memproses detail anime"
      };
    }
  }
  async download({
    url
  }) {
    console.log(`[DOWNLOAD] Memproses URL episode: ${url}`);
    try {
      const $ = await this.fetchPage(url);
      const title = $(".entry-header.info_episode h1.entry-title").text().trim().replace("Sub Indo", "").trim();
      const episodeNumber = $('.sbdbti .epx span[itemprop="episodeNumber"]').text().trim();
      const postId = $('article[id^="post-"]').attr("id")?.replace("post-", "") || null;
      const releaseTime = $(".sbdbti .epx .time-post").text().trim().replace('i class="fa fa-clock-o" aria-hidden="true">', "").trim();
      const prevUrl = $(".naveps .nvs a:not(.nonex):first").attr("href") || null;
      const nextUrl = $(".naveps .nvs.rght a:not(.nonex)").attr("href") || null;
      const allEpisodesUrl = $(".naveps .nvsc a").attr("href") || null;
      const animeTitle = $(".naveps .nvsc a").text().trim().replace("All Episode", "").trim();
      const videoServers = [];
      $("#server ul li").each((i, el) => {
        const $div = $(el).find("div.east_player_option");
        if ($div.length) {
          videoServers.push({
            name: $div.find("span").text().trim(),
            postId: $div.attr("data-post"),
            number: $div.attr("data-nume"),
            type: $div.attr("data-type"),
            isActive: $div.hasClass("on")
          });
        }
      });
      const downloadLinks = [];
      $("#downloadb ul li").each((i, el) => {
        const $el = $(el);
        const quality = $el.find("strong").text().trim();
        const mirrors = [];
        $el.find("span a").each((j, a) => {
          mirrors.push({
            host: $(a).text().trim(),
            url: $(a).attr("href")
          });
        });
        if (quality && mirrors.length > 0) {
          downloadLinks.push({
            quality: quality,
            mirrors: mirrors
          });
        }
      });
      const playerEmbedUrl = $("#player_embed .pframe iframe").attr("src") || null;
      const moreEpisodes = [];
      $(".episode-lainnya .lstepsiode.listeps ul li").each((i, el) => {
        const $el = $(el);
        const $link = $el.find(".epsleft .lchx a");
        if ($link.attr("href")) {
          moreEpisodes.push({
            title: $link.text().trim(),
            url: $link.attr("href"),
            thumbnail: $el.find(".epsright.thumbnailrighteps img").attr("src"),
            releaseDate: $el.find(".epsleft .date").text().trim()
          });
        }
      });
      console.log(`[DOWNLOAD] Berhasil mengurai ${title}.`);
      return {
        ok: true,
        data: {
          title: title,
          animeTitle: animeTitle,
          episodeNumber: episodeNumber,
          postId: postId,
          releaseTime: releaseTime,
          playerEmbedUrl: playerEmbedUrl,
          videoServers: videoServers,
          downloadLinks: downloadLinks,
          navigation: {
            prevUrl: prevUrl,
            nextUrl: nextUrl,
            allEpisodesUrl: allEpisodesUrl
          },
          moreEpisodes: moreEpisodes
        }
      };
    } catch (e) {
      console.error(`[DOWNLOAD] Error: ${e.message}`);
      return {
        ok: false,
        error: e.message || "Terjadi kesalahan saat memproses halaman episode"
      };
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
      error: "Paramenter 'action' wajib diisi. Contoh: ?action=home"
    });
  }
  const api = new SamehadakuScraper();
  try {
    let response;
    switch (action) {
      case "home":
        response = await api.home();
        break;
      case "schedule":
        response = await api.releaseSchedule(params);
        break;
      case "search":
        if (!params.query) {
          return res.status(400).json({
            error: "Paramenter 'query' wajib diisi untuk action 'search'."
          });
        }
        response = await api.search(params);
        break;
      case "detail":
        if (!params.url) {
          return res.status(400).json({
            error: "Paramenter 'url' wajib diisi untuk action 'detail'."
          });
        }
        response = await api.detail(params);
        break;
      case "download":
        if (!params.url) {
          return res.status(400).json({
            error: "Paramenter 'url' wajib diisi untuk action 'download'."
          });
        }
        response = await api.download(params);
        break;
      default:
        return res.status(400).json({
          error: `Action tidak valid: ${action}. Action yang didukung: 'home', 'schedule', 'search', 'detail', dan 'download'.`
        });
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error(`[FATAL ERROR] Kegagalan pada action '${action}':`, error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Terjadi kesalahan internal pada server."
    });
  }
}