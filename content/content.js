/**
 * SoundCloud Music Downloader - Content Script
 * Tự động chèn nút Tải MP3 trực tiếp vào giao diện SoundCloud
 */

(function () {
  const DOWNLOAD_ICON = `
    <svg viewBox="0 0 24 24" width="12" height="12">
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
    </svg>
  `;

  // Hiển thị Toast thông báo trên giao diện SoundCloud
  function showToast(message, type = "info", duration = 3500) {
    const existing = document.querySelector(".scdl-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `scdl-toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = "opacity 0.3s, transform 0.3s";
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Tìm URL bài hát từ một phần tử sound item
  function extractTrackUrl(element) {
    // 1. Nếu là bottom player
    if (element.closest(".playControls")) {
      const badgeLink = document.querySelector(".playbackSoundBadge__titleLink");
      if (badgeLink && badgeLink.href) {
        return badgeLink.href.split("?")[0];
      }
    }

    // 2. Tìm trong container bài hát hiện tại
    const soundItem = element.closest(".sound, .searchList__item, .trackItem, .userStreamItem, .soundListItem");
    if (soundItem) {
      const titleLink = soundItem.querySelector("a.soundTitle__title, a.trackItem__trackTitle");
      if (titleLink && titleLink.href) {
        return titleLink.href.split("?")[0];
      }
    }

    // 3. Fallback: Lấy URL của trang hiện tại (nếu đang ở trang track cụ thể)
    const currentUrl = window.location.href.split("?")[0];
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2 && !["discover", "stream", "upload", "you", "settings", "messages"].includes(pathParts[0])) {
      return currentUrl;
    }

    return null;
  }

  // Tạo nút Download
  function createDownloadBtn(getUrlCallback) {
    const btn = document.createElement("button");
    btn.className = "sc-button sc-button-small sc-button-responsive scdl-btn";
    btn.type = "button";
    btn.title = "Tải file MP3 này";
    btn.innerHTML = `${DOWNLOAD_ICON}<span>Tải MP3</span>`;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const trackUrl = getUrlCallback();
      if (!trackUrl) {
        showToast("Không xác định được liên kết bài hát.", "error");
        return;
      }

      btn.disabled = true;
      btn.classList.add("loading");
      btn.innerHTML = `<span class="scdl-spinner"></span><span>Đang xử lý...</span>`;
      showToast("Đang phân tích bài hát...", "info", 2000);

      try {
        // 1. Resolve metadata
        const resolveRes = await chrome.runtime.sendMessage({
          action: "RESOLVE_TRACK",
          url: trackUrl
        });

        if (!resolveRes || !resolveRes.success) {
          throw new Error(resolveRes?.error || "Không thể phân tích dữ liệu bài hát.");
        }

        const track = resolveRes.track;
        showToast(`Đang tải: ${track.artist} - ${track.title}`, "info", 3000);

        // 2. Download
        const downloadRes = await chrome.runtime.sendMessage({
          action: "DOWNLOAD_TRACK",
          track: track
        });

        if (!downloadRes || !downloadRes.success) {
          throw new Error(downloadRes?.error || "Lỗi khi lưu file bài hát.");
        }

        btn.innerHTML = `<span>✓ Đã tải</span>`;
        showToast(`Đã tải thành công: ${track.title}!`, "success", 4000);

        setTimeout(() => {
          btn.disabled = false;
          btn.classList.remove("loading");
          btn.innerHTML = `${DOWNLOAD_ICON}<span>Tải MP3</span>`;
        }, 3000);
      } catch (err) {
        showToast("Lỗi: " + err.message, "error", 4000);
        btn.disabled = false;
        btn.classList.remove("loading");
        btn.innerHTML = `${DOWNLOAD_ICON}<span>Thử lại</span>`;
      }
    });

    return btn;
  }

  // Quét và chèn nút Download vào giao diện
  function injectButtons() {
    // 1. Chèn vào nhóm nút hành động của từng track trên stream / playlist / sound page
    const actionGroups = document.querySelectorAll(
      ".soundActions .sc-button-group:not([data-scdl-injected]), " +
      ".listenEngagement .sc-button-group:not([data-scdl-injected])"
    );

    actionGroups.forEach(group => {
      group.setAttribute("data-scdl-injected", "true");
      const btn = createDownloadBtn(() => extractTrackUrl(group));
      group.appendChild(btn);
    });

    // 2. Chèn vào Player bar ở đáy màn hình (Bottom Player)
    const playerControls = document.querySelector(".playControls__elements:not([data-scdl-injected])");
    if (playerControls) {
      const playerBadgeActions = playerControls.querySelector(".playbackSoundBadge__actions");
      if (playerBadgeActions && !playerBadgeActions.querySelector(".scdl-btn")) {
        playerBadgeActions.setAttribute("data-scdl-injected", "true");
        const btn = createDownloadBtn(() => extractTrackUrl(playerBadgeActions));
        playerBadgeActions.appendChild(btn);
      }
    }
  }

  // Khởi chạy observer theo dõi sự thay đổi của DOM
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(injectButtons, 250);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Chạy lần đầu sau khi load
  setTimeout(injectButtons, 1000);
})();
