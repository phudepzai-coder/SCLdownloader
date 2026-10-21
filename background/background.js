/**
 * SoundCloud Music Downloader - Background Service Worker
 * Tối ưu hóa xử lý đa luồng stream, tự động fallback transcoding, hỗ trợ fMP4 AAC và Progressive MP3.
 */

// Client ID đang hoạt động của SoundCloud
const FALLBACK_CLIENT_IDS = [
  "CIyAjPWv6JyzBPHwaAtKp4qeSaVRWfaz",
  "iZIs9mchVcX5lhVR1EZLYO1UX9Tlc5iK",
  "a3e059563d7fd3372b49b37f00a00bcf",
  "b86551b8c199ce551ad6a9871790409a"
];

/**
 * Lấy Client ID từ cache hoặc tự động bóc tách từ assets của SoundCloud
 */
async function getClientId(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = await chrome.storage.local.get(["sc_client_id", "sc_client_id_exp"]);
    if (cached.sc_client_id && cached.sc_client_id_exp && Date.now() < cached.sc_client_id_exp) {
      return cached.sc_client_id;
    }
  }

  try {
    const homeRes = await fetch("https://soundcloud.com", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const html = await homeRes.text();

    const scriptRegex = /<script\s+[^>]*src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g;
    let match;
    const scriptUrls = [];
    while ((match = scriptRegex.exec(html)) !== null) {
      scriptUrls.push(match[1]);
    }

    const candidates = scriptUrls.slice(-8).reverse();

    for (const url of candidates) {
      try {
        const jsRes = await fetch(url);
        const jsCode = await jsRes.text();

        const idRegexes = [
          /client_id\s*[:=]\s*["']([a-zA-Z0-9]{32})["']/,
          /,client_id:"([a-zA-Z0-9]{32})"/,
          /"client_id"\s*:\s*"([a-zA-Z0-9]{32})"/
        ];

        for (const regex of idRegexes) {
          const idMatch = jsCode.match(regex);
          if (idMatch && idMatch[1]) {
            const clientId = idMatch[1];
            await chrome.storage.local.set({
              sc_client_id: clientId,
              sc_client_id_exp: Date.now() + 24 * 60 * 60 * 1000
            });
            console.log("[SCDL] Lấy thành công Client ID:", clientId);
            return clientId;
          }
        }
      } catch (err) {
        console.warn("[SCDL] Không đọc được script:", url, err);
      }
    }
  } catch (error) {
    console.error("[SCDL] Lỗi khi bóc tách client_id:", error);
  }

  return FALLBACK_CLIENT_IDS[0];
}

/**
 * Xử lý URL rút gọn
 */
async function expandShortUrl(shortUrl) {
  try {
    if (shortUrl.includes("on.soundcloud.com") || shortUrl.includes("soundcloud.app.goo.gl")) {
      const res = await fetch(shortUrl, { method: "HEAD", redirect: "follow" });
      return res.url || shortUrl;
    }
  } catch (e) {
    console.warn("[SCDL] Không thể giải mã URL rút gọn:", e);
  }
  return shortUrl;
}

/**
 * Sắp xếp các transcoding theo thứ tự ưu tiên chất lượng tốt nhất và ổn định nhất
 */
function sortTranscodings(transcodings) {
  const score = (t) => {
    const proto = t.format?.protocol || "";
    const mime = t.format?.mime_type || "";

    // 1. MP3 direct progressive (tải trực tiếp nhanh và tương thích nhất)
    if (proto === "progressive" && mime.includes("audio/mpeg")) return 100;
    // 2. HLS AAC MP4 (âm thanh chất lượng cao 160kbps AAC fMP4)
    if (proto === "hls" && mime.includes("audio/mp4")) return 90;
    // 3. HLS Opus (âm thanh nén tốt)
    if (proto === "hls" && mime.includes("opus")) return 80;
    // 4. Các định dạng progressive khác
    if (proto === "progressive") return 70;
    // 5. Tránh các định dạng mpegurl cũ hay bị lỗi 404
    if (mime.includes("mpegurl")) return 10;
    return 50;
  };

  return [...transcodings].sort((a, b) => score(b) - score(a));
}

/**
 * Phân tích URL bài hát SoundCloud
 */
async function resolveTrack(url) {
  let targetUrl = await expandShortUrl(url.trim());
  let clientId = await getClientId();

  const resolveApiUrl = (cid) => 
    `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(targetUrl)}&client_id=${cid}`;

  let res = await fetch(resolveApiUrl(clientId));

  if (res.status === 401) {
    console.log("[SCDL] Client ID 401, đang đổi key mới...");
    clientId = await getClientId(true);
    res = await fetch(resolveApiUrl(clientId));
  }

  if (!res.ok) {
    throw new Error(`Không tìm thấy bài hát hoặc link không hợp lệ (HTTP ${res.status}).`);
  }

  const data = await res.json();

  if (data.kind !== "track") {
    if (data.kind === "playlist") {
      throw new Error("Link này là một Playlist/Album. Vui lòng chọn bài hát cụ thể.");
    }
    throw new Error(`Link không phải là bài hát (Loại: ${data.kind || "không rõ"}).`);
  }

  if (!data.media || !data.media.transcodings || data.media.transcodings.length === 0) {
    throw new Error("Bài hát này không có luồng âm thanh để tải.");
  }

  const sortedTranscodings = sortTranscodings(data.media.transcodings);

  return {
    id: data.id,
    title: data.title || "SoundCloud Track",
    artist: data.user ? (data.user.username || data.user.name || "SoundCloud Artist") : "SoundCloud Artist",
    duration: data.duration || 0,
    artwork: data.artwork_url ? data.artwork_url.replace("-large", "-t500x500") : (data.user && data.user.avatar_url ? data.user.avatar_url : ""),
    permalink_url: data.permalink_url || targetUrl,
    transcoding: sortedTranscodings[0],
    all_transcodings: sortedTranscodings,
    track_authorization: data.track_authorization,
    clientId: clientId
  };
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim();
}

async function saveToHistory(trackInfo) {
  try {
    const { download_history = [] } = await chrome.storage.local.get("download_history");
    const newEntry = {
      id: trackInfo.id,
      title: trackInfo.title,
      artist: trackInfo.artist,
      artwork: trackInfo.artwork,
      url: trackInfo.permalink_url,
      timestamp: Date.now()
    };
    
    const filtered = download_history.filter(item => item.id !== trackInfo.id);
    filtered.unshift(newEntry);
    await chrome.storage.local.set({ download_history: filtered.slice(0, 30) });
  } catch (e) {
    console.warn("[SCDL] Lỗi lưu lịch sử:", e);
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * Tải file từ luồng HLS m3u8 (hỗ trợ cả fMP4 AAC và TS chunks)
 */
async function downloadHlsStream(m3u8Url, filename, onProgress) {
  // 1. Tải playlist m3u8
  const res = await fetch(m3u8Url);
  if (!res.ok) throw new Error("Không thể tải playlist m3u8.");
  const playlistText = await res.text();

  // 2. Kiểm tra có đoạn init MP4 (#EXT-X-MAP:URI="...") không
  let initUrl = null;
  const mapMatch = playlistText.match(/#EXT-X-MAP:URI="([^"]+)"/);
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf("/") + 1);

  if (mapMatch && mapMatch[1]) {
    const mapUri = mapMatch[1];
    initUrl = mapUri.startsWith("http") ? mapUri : baseUrl + mapUri;
  }

  // 3. Phân tích các đoạn media segments
  const lines = playlistText.split("\n");
  const segmentUrls = [];

  for (let line of lines) {
    line = line.trim();
    if (line && !line.startsWith("#")) {
      if (line.startsWith("http://") || line.startsWith("https://")) {
        segmentUrls.push(line);
      } else {
        segmentUrls.push(baseUrl + line);
      }
    }
  }

  if (segmentUrls.length === 0) {
    throw new Error("Không tìm thấy các phân đoạn âm thanh trong playlist.");
  }

  const chunks = [];

  // Tải init chunk nếu có
  if (initUrl) {
    if (onProgress) onProgress(5);
    const initRes = await fetch(initUrl);
    if (!initRes.ok) throw new Error("Không thể tải header khởi tạo (init.mp4).");
    const initBuf = await initRes.arrayBuffer();
    chunks.push(new Uint8Array(initBuf));
  }

  // Tải các segment chunks
  const total = segmentUrls.length;
  for (let i = 0; i < total; i++) {
    const chunkRes = await fetch(segmentUrls[i]);
    if (!chunkRes.ok) throw new Error(`Lỗi tải đoạn âm thanh ${i + 1}/${total}`);
    const buffer = await chunkRes.arrayBuffer();
    chunks.push(new Uint8Array(buffer));
    
    if (onProgress) {
      const currentPercent = Math.min(95, Math.round(5 + ((i + 1) / total) * 90));
      onProgress(currentPercent);
    }
  }

  // Ghép các mảng dữ liệu lại
  const totalLength = chunks.reduce((acc, curr) => acc + curr.length, 0);
  const mergedArray = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    mergedArray.set(chunk, offset);
    offset += chunk.length;
  }

  if (onProgress) onProgress(98);

  const base64Data = arrayBufferToBase64(mergedArray.buffer);
  const mimeType = filename.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg";
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      conflictAction: "uniquify"
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (onProgress) onProgress(100);
      resolve(downloadId);
    });
  });
}

/**
 * Thực hiện tải bài hát với cơ chế tự động chuyển transcoding nếu gặp lỗi
 */
async function downloadTrack(trackInfo, onProgress) {
  let clientId = trackInfo.clientId || await getClientId();
  const transcodingsToTry = trackInfo.all_transcodings && trackInfo.all_transcodings.length > 0 
    ? trackInfo.all_transcodings 
    : [trackInfo.transcoding];

  let lastError = null;

  for (const transcoding of transcodingsToTry) {
    try {
      console.log("[SCDL] Thử tải với định dạng:", transcoding.format.protocol, transcoding.format.mime_type);

      let mediaApiUrl = transcoding.url;
      if (trackInfo.track_authorization) {
        mediaApiUrl += `?track_authorization=${encodeURIComponent(trackInfo.track_authorization)}&client_id=${clientId}`;
      } else {
        mediaApiUrl += `?client_id=${clientId}`;
      }

      let mediaRes = await fetch(mediaApiUrl);
      if (mediaRes.status === 401) {
        clientId = await getClientId(true);
        mediaApiUrl = transcoding.url + (trackInfo.track_authorization ? `?track_authorization=${encodeURIComponent(trackInfo.track_authorization)}&client_id=${clientId}` : `?client_id=${clientId}`);
        mediaRes = await fetch(mediaApiUrl);
      }

      if (!mediaRes.ok) {
        console.warn(`[SCDL] Transcoding ${transcoding.format.protocol} trả về HTTP ${mediaRes.status}, thử transcoding khác...`);
        lastError = new Error(`Lỗi HTTP ${mediaRes.status}`);
        continue;
      }

      const mediaJson = await mediaRes.json();
      const directStreamUrl = mediaJson.url;
      if (!directStreamUrl) {
        continue;
      }

      const isProgressive = transcoding.format.protocol === "progressive";
      let extension = "mp3";
      if (transcoding.format.mime_type.includes("audio/mp4")) {
        extension = "m4a";
      } else if (transcoding.format.mime_type.includes("opus")) {
        extension = "opus";
      }

      const safeTitle = sanitizeFilename(`${trackInfo.artist} - ${trackInfo.title}.${extension}`);

      if (isProgressive) {
        return await new Promise((resolve, reject) => {
          chrome.downloads.download({
            url: directStreamUrl,
            filename: safeTitle,
            conflictAction: "uniquify"
          }, async (downloadId) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (onProgress) onProgress(100);
            await saveToHistory(trackInfo);
            resolve({ downloadId, filename: safeTitle, protocol: "progressive" });
          });
        });
      } else {
        const downloadId = await downloadHlsStream(directStreamUrl, safeTitle, onProgress);
        await saveToHistory(trackInfo);
        return { downloadId, filename: safeTitle, protocol: "hls" };
      }
    } catch (err) {
      console.warn("[SCDL] Lỗi với transcoding hiện tại:", err);
      lastError = err;
    }
  }

  throw lastError || new Error("Không thể tải bài hát với bất kỳ định dạng nào của SoundCloud.");
}

// Lắng nghe message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "RESOLVE_TRACK") {
    resolveTrack(request.url)
      .then(track => sendResponse({ success: true, track }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "DOWNLOAD_TRACK") {
    downloadTrack(request.track, (percent) => {
      if (request.requestId) {
        chrome.runtime.sendMessage({
          action: "DOWNLOAD_PROGRESS",
          requestId: request.requestId,
          percent: percent
        }).catch(() => {});
      }
    })
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "GET_HISTORY") {
    chrome.storage.local.get("download_history", (data) => {
      sendResponse({ success: true, history: data.download_history || [] });
    });
    return true;
  }

  if (request.action === "CLEAR_HISTORY") {
    chrome.storage.local.set({ download_history: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
