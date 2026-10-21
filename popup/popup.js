/**
 * SoundCloud Music Downloader - Popup Script
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const tabDownloader = document.getElementById("tabDownloader");
  const tabHistory = document.getElementById("tabHistory");
  const viewDownloader = document.getElementById("viewDownloader");
  const viewHistory = document.getElementById("viewHistory");

  const urlInput = document.getElementById("urlInput");
  const btnPaste = document.getElementById("btnPaste");
  const btnCurrentTab = document.getElementById("btnCurrentTab");
  const btnDownload = document.getElementById("btnDownload");

  const statusBox = document.getElementById("statusBox");
  const statusSpinner = document.getElementById("statusSpinner");
  const statusText = document.getElementById("statusText");
  const statusPercent = document.getElementById("statusPercent");
  const progressBarContainer = document.getElementById("progressBarContainer");
  const progressBar = document.getElementById("progressBar");

  const trackCard = document.getElementById("trackCard");
  const trackArtwork = document.getElementById("trackArtwork");
  const trackTitle = document.getElementById("trackTitle");
  const trackArtist = document.getElementById("trackArtist");
  const trackDuration = document.getElementById("trackDuration");
  const trackQuality = document.getElementById("trackQuality");

  const historyList = document.getElementById("historyList");
  const historyEmpty = document.getElementById("historyEmpty");
  const btnClearHistory = document.getElementById("btnClearHistory");

  let currentRequestId = null;

  // Format thời lượng
  function formatTime(ms) {
    if (!ms) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  }

  // Chuyển Tab
  tabDownloader.addEventListener("click", () => {
    tabDownloader.classList.add("active");
    tabHistory.classList.remove("active");
    viewDownloader.classList.remove("hidden");
    viewHistory.classList.add("hidden");
  });

  tabHistory.addEventListener("click", () => {
    tabHistory.classList.add("active");
    tabDownloader.classList.remove("active");
    viewHistory.classList.remove("hidden");
    viewDownloader.classList.add("hidden");
    loadHistory();
  });

  // Tự động kiểm tra URL tab hiện tại khi mở popup
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && (tab.url.includes("soundcloud.com/") || tab.url.includes("on.soundcloud.com/"))) {
      // Bỏ qua các trang cài đặt hoặc trang chủ chung nếu chưa vào bài hát cụ thể
      if (!tab.url.endsWith("soundcloud.com/") && !tab.url.includes("/discover") && !tab.url.includes("/feed")) {
        urlInput.value = tab.url;
      }
    }
  } catch (e) {
    console.warn("Không thể đọc active tab:", e);
  }

  // Nút Lấy link Tab hiện tại
  btnCurrentTab.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        urlInput.value = tab.url;
        showStatus("Đã lấy URL từ tab hiện tại", "success", 2000);
      }
    } catch (e) {
      showStatus("Không thể lấy URL từ tab: " + e.message, "error");
    }
  });

  // Nút Dán Clipboard
  btnPaste.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        showStatus("Đã dán từ bộ nhớ tạm", "success", 1500);
      }
    } catch (e) {
      urlInput.focus();
      document.execCommand("paste");
    }
  });

  // Hiển thị trạng thái
  function showStatus(msg, type = "loading", autoHideMs = 0) {
    statusBox.classList.remove("hidden", "error", "success");
    statusText.textContent = msg;
    statusPercent.textContent = "";
    progressBarContainer.classList.add("hidden");

    if (type === "loading") {
      statusSpinner.classList.remove("hidden");
    } else {
      statusSpinner.classList.add("hidden");
      if (type === "error") statusBox.classList.add("error");
      if (type === "success") statusBox.classList.add("success");
    }

    if (autoHideMs > 0) {
      setTimeout(() => {
        statusBox.classList.add("hidden");
      }, autoHideMs);
    }
  }

  // Cập nhật tiến trình download
  function updateProgress(percent) {
    statusSpinner.classList.add("hidden");
    progressBarContainer.classList.remove("hidden");
    statusPercent.textContent = `${percent}%`;
    progressBar.style.width = `${percent}%`;
    statusText.textContent = percent < 100 ? "Đang tải dữ liệu âm thanh..." : "Đang hoàn tất đóng gói...";
  }

  // Lắng nghe tiến trình từ background service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "DOWNLOAD_PROGRESS" && message.requestId === currentRequestId) {
      updateProgress(message.percent);
    }
  });

  // Xử lý Tải nhạc
  btnDownload.addEventListener("click", async () => {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
      showStatus("Vui lòng dán link bài hát SoundCloud!", "error");
      urlInput.focus();
      return;
    }

    if (!rawUrl.includes("soundcloud.com")) {
      showStatus("Liên kết không hợp lệ. Vui lòng nhập link SoundCloud.", "error");
      return;
    }

    btnDownload.disabled = true;
    currentRequestId = "req_" + Date.now();
    trackCard.classList.add("hidden");
    showStatus("Đang phân tích thông tin bài hát...", "loading");

    try {
      // 1. Phân tích bài hát
      const resolveRes = await chrome.runtime.sendMessage({
        action: "RESOLVE_TRACK",
        url: rawUrl
      });

      if (!resolveRes || !resolveRes.success) {
        throw new Error(resolveRes?.error || "Không thể phân tích bài hát này.");
      }

      const track = resolveRes.track;

      // 2. Hiển thị thông tin Card Preview
      trackTitle.textContent = track.title;
      trackTitle.title = track.title;
      trackArtist.textContent = track.artist;
      trackDuration.textContent = formatTime(track.duration);
      trackArtwork.src = track.artwork || "../icons/icon128.png";

      const isProgressive = track.transcoding.format.protocol === "progressive";
      trackQuality.textContent = isProgressive ? "MP3 Direct (Chuẩn)" : "HLS High Quality";
      trackCard.classList.remove("hidden");

      // 3. Tiến hành tải
      showStatus(isProgressive ? "Đang tải bài hát về máy..." : "Đang xử lý luồng âm thanh...", "loading");

      const downloadRes = await chrome.runtime.sendMessage({
        action: "DOWNLOAD_TRACK",
        track: track,
        requestId: currentRequestId
      });

      if (!downloadRes || !downloadRes.success) {
        throw new Error(downloadRes?.error || "Lỗi trong quá trình lưu file nhạc.");
      }

      showStatus("Tải thành công! File đã lưu vào thư mục Tải về (Downloads).", "success", 4000);
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      btnDownload.disabled = false;
    }
  });

  // Nhấn Enter trong ô input để tải ngay
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      btnDownload.click();
    }
  });

  // Tải danh sách lịch sử
  async function loadHistory() {
    historyList.innerHTML = "";
    const res = await chrome.runtime.sendMessage({ action: "GET_HISTORY" });
    const history = res?.history || [];

    if (history.length === 0) {
      historyEmpty.classList.remove("hidden");
      historyList.classList.add("hidden");
      return;
    }

    historyEmpty.classList.add("hidden");
    historyList.classList.remove("hidden");

    history.forEach(item => {
      const el = document.createElement("div");
      el.className = "history-item";
      el.innerHTML = `
        <img class="history-art" src="${item.artwork || '../icons/icon48.png'}" alt="art">
        <div class="history-details">
          <div class="history-title" title="${item.title}">${item.title}</div>
          <div class="history-artist">${item.artist}</div>
        </div>
        <a href="${item.url}" target="_blank" class="history-link-icon" title="Mở trên SoundCloud">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
      `;

      // Bấm vào item thì dán lại URL vào tab download
      el.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        urlInput.value = item.url;
        tabDownloader.click();
      });

      historyList.appendChild(el);
    });
  }

  // Xóa lịch sử
  btnClearHistory.addEventListener("click", async () => {
    if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử tải không?")) {
      await chrome.runtime.sendMessage({ action: "CLEAR_HISTORY" });
      loadHistory();
    }
  });
});
