# 🎵 SoundCloud Music Downloader - Chrome Extension (Manifest V3)

Extension dành cho trình duyệt Chrome, Microsoft Edge, Cốc Cốc, Brave... giúp tự động phân tích và tải nhạc MP3 chất lượng cao từ liên kết (URL) của **SoundCloud**.

---

## 🌟 Các tính năng nổi bật

1. **⚡ Tải nhanh qua Popup**:
   - Dán bất kỳ link bài hát nào từ SoundCloud (kể cả link rút gọn `on.soundcloud.com`).
   - Tự động phát hiện và điền link bài hát từ tab bạn đang nghe trên trình duyệt.
   - Hiển thị bản xem trước bài hát (Ảnh bìa, tên bài hát, nghệ sĩ, thời lượng, chuẩn chất lượng).

2. **🎯 Nút tải trực tiếp trên trang SoundCloud (Content Script)**:
   - Tự động thêm nút **"⚡ Tải MP3"** bên cạnh các nút Like / Repost / Share của từng bài hát trên trang `soundcloud.com`.
   - Thêm nút tải nhanh ở thanh phát nhạc dưới đáy màn hình (Bottom Player).
   - Bấm 1 cú click là nhạc tự động tải về máy mà không cần copy link mở popup.

3. **💎 Hỗ trợ đa dạng chuẩn âm thanh**:
   - Tải file **MP3 Progressive** trực tiếp từ CDN tốc độ cao của SoundCloud.
   - Hỗ trợ tải và ghép tự động luồng **HLS (m3u8)** khi bài hát không có link MP3 trực tiếp.

4. **🕒 Lịch sử tải xuống (History)**:
   - Ghi nhớ các bài hát đã tải gần nhất để bạn có thể nghe lại hoặc mở lại link gốc bất cứ lúc nào.

5. **🤖 Tự động xử lý SoundCloud Client ID**:
   - Tự động bóc tách và làm mới `client_id` từ assets của SoundCloud, không lo bị hết hạn API.

---

## 📂 Cấu trúc thư mục dự án

```
focused-nobel/
├── manifest.json         # File cấu hình Manifest V3 của Extension
├── icons/                # Icon các kích thước (16x16, 48x48, 128x128)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── background/           # Service Worker chạy ngầm
│   └── background.js     # Xử lý resolve API, trích xuất client_id, tải file
├── content/              # Script chạy trên giao diện web soundcloud.com
│   ├── content.js        # Nhận diện bài hát, chèn nút tải nhanh
│   └── content.css       # Tạo kiểu dáng cho nút tải & thông báo Toast
└── popup/                # Giao diện Popup khi bấm icon extension
    ├── popup.html
    ├── popup.css
    └── popup.js
```

---

## 🚀 Hướng dẫn cài đặt vào trình duyệt

Bạn không cần cài đặt Node.js hay phần mềm nào khác vì extension được viết bằng **HTML/CSS/JS thuần (Vanilla)**.

### Bước 1: Mở trang Quản lý tiện ích
- Mở **Google Chrome** (hoặc Edge / Cốc Cốc / Brave).
- Nhập vào thanh địa chỉ:
  - Trên Chrome / Cốc Cốc / Brave: `chrome://extensions`
  - Trên Edge: `edge://extensions`

### Bước 2: Bật chế độ nhà phát triển (Developer Mode)
- Bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải màn hình.

### Bước 3: Tải extension vào trình duyệt
- Bấm vào nút **"Load unpacked"** (Tải tiện ích đã giải nén).
- Chọn thư mục dự án: `c:\Users\ASUS\Documents\antigravity\focused-nobel`.
- Extension **SoundCloud Music Downloader** sẽ xuất hiện ngay lập tức trong danh sách tiện ích của bạn!

---

## 💡 Hướng dẫn sử dụng

### Cách 1: Tải bằng Popup Extension
1. Mở tiện ích bằng cách bấm vào biểu tượng extension trên thanh công cụ trình duyệt.
2. Dán link bài hát SoundCloud vào ô nhập (hoặc bấm **"Lấy link tab này"** nếu bạn đang mở bài hát đó).
3. Bấm **"Tải ngay"** (hoặc nhấn phím `Enter`).
4. File MP3 sẽ được tự động tải về thư mục `Downloads` của máy tính.

### Cách 2: Tải trực tiếp trên trang SoundCloud
1. Truy cập vào trang web [https://soundcloud.com](https://soundcloud.com).
2. Khi lướt danh sách bài hát hoặc đang nghe nhạc, bạn sẽ thấy nút màu cam **"⚡ Tải MP3"** xuất hiện ngay dưới bài hát.
3. Nhấp vào nút đó, tiện ích sẽ tự động tải file bài hát về máy kèm thông báo trạng thái ở góc màn hình!
