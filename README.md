# 🎮 Pony Town - Dự Án Phục Hồi Hoàn Chỉnh (Full Project Reconstruction)

Dự án tái thiết kế và phục hồi hoàn chỉnh game **Pony Town** từ bản snapshot web thô, tự động suy luận và bù đắp toàn bộ các thành phần còn thiếu (Full-stack Backend, WebSocket Real-time, Engine Game Canvas Pixel Art, Audio Synth, Hệ thống tạo nhân vật, Map thị trấn và Tương thích Bot Ma Sói).

---

## 🌟 1. Tổng quan & Những gì đã được phục hồi bù lại

Ban đầu, thư mục chỉ có 1 file HTML lưu trang web tĩnh (`🎮 Pony Town.html`) cùng file bundle nén `bootstrap-33FTUFJL.js.download` bị lỗi không thể chạy độc lập do thiếu chunk, thiếu backend, thiếu spritesheet và thiếu server WebSocket.

Dự án đã được phân tích và phục hồi toàn diện:
1. **Frontend Game Engine Pixel Art (`public/js/`):**
   - **`sprites.js`**: Bộ dựng hình pixel art chuyển động mượt mà cho ngựa Pony (4 dáng trot/phi nước kiệu, đứng, ngồi, nằm, ngủ, bay đập cánh, thơm má/boop, khóc, cười, ngáp), mane tóc, đuôi, sừng kỳ lân (Unicorn), cánh thiên mã (Pegasus/Alicorn), biểu cảm mắt và phụ kiện (mũ, nơ, hoa, kính râm).
   - **`world.js`**: Bản đồ thị trấn thị giác đặc trưng (quảng trường đá trung tâm, đường đất, dòng sông uốn lượn, cầu gỗ, vườn táo hái được quả, ghế gỗ công viên, đèn lồng phát sáng về đêm, chu kỳ Ngày/Hoàng hôn/Đêm năng động).
   - **`audio.js`**: Bộ tổng hợp âm thanh Web Audio API thời gian thực không phụ thuộc file mạng (tiếng móng ngựa lộc cộc trên từng mặt cỏ/đá/gỗ, tiếng kêu boop đáng yêu, tiếng cắn táo giòn tan, tiếng đập cánh bay và nhạc nền piano du dương mộc mạc phong cách Pony Town).
   - **`customizer.js`**: Trình tạo & chỉnh sửa ngoại hình Pony đa dạng (chủng loài, màu lông, móng, kiểu tóc, màu highlight, phụ kiện, nút Randomize phối màu ngẫu nhiên hài hòa).
   - **`chat.js`**: Bong bóng thoại (speech bubble) lơ lửng trên đầu nhân vật, hỗ trợ chat công khai (Say), thì thầm riêng (`/w <tên> <nội dung>`).
   - **`game.js`**: Vòng lặp game chuẩn 60FPS, camera theo dõi mượt mà, physics trượt va chạm, minimap, thanh hành động (Action Bar).

2. **Backend Server đa người chơi (`server.js`):**
   - Xây dựng trên nền tảng **Node.js + Express + WebSocket (`ws`)**.
   - Cung cấp toàn bộ REST API tương thích với bản gốc: `/api2/game/status`, `/api/servers`, `/api1/account`, `/api/account-characters`, `/api/pony/save`, `/api/update-settings`.
   - WebSocket `/ws` đồng bộ vị trí, chuyển động, hành động, hái táo, chat giữa nhiều người chơi trong thời gian thực.
   - **Hệ thống NPC thông minh**: Tự động sinh các Pony NPC thân thiện (như Derpy, Apple Cobbler) dạo chơi thị trấn, hái táo và tự động phản hồi thì thầm khi chơi một mình.
   - **100% tương thích với Tampermonkey Bot**: Hỗ trợ đầy đủ cú pháp whisper cho bot Quản Trò Ma Sói (`script.txt` / `masoi_ponytown`).

3. **Khắc phục Client Dump gốc (`archive/` & `public/assets/scripts/`):**
   - Tái tạo runtime chunk bị thiếu: `chunk-D5DYARK6.js` (cung cấp đầy đủ các hàm runtime esbuild `__async`, `__commonJS`, `__esm`, `__export`, `__require`, `__toCommonJS`, `__toESM`, `__yieldStar`).
   - Cung cấp stub `hls-JXBHVJCY.js`.
   - Có thể mở bản gốc đã vá lỗi qua đường dẫn `http://localhost:3000/legacy`.

---

## 🚀 2. Hướng dẫn khởi chạy

### Cách 1: Chạy nhanh bằng 1 click (Khuyên dùng trên Windows)
- Nhấp đúp chuột vào file:
  ```bat
  start.bat
  ```
- File này sẽ tự động khởi động server và mở trình duyệt tại `http://localhost:3000`.

### Cách 2: Chạy qua dòng lệnh (Command Line)
```bash
# Cài đặt thư viện (chỉ cần chạy lần đầu)
npm install

# Khởi động server
npm start
```

Mở trình duyệt truy cập:
👉 **`http://localhost:3000`**

---

## 🎮 3. Phím điều khiển trong game

| Phím / Hành động | Chức năng |
| :--- | :--- |
| **W, A, S, D** hoặc **Phím Mũi Tên** | Di chuyển (phi nước kiệu) 8 hướng |
| **Chuột trái (Click)** | Nhấp vào đất để di chuyển đến vị trí đó |
| **F** | Bay lên không trung (Dành cho Pegasus & Alicorn, bay qua sông và rào chắn) |
| **X** | Ngồi xuống (Sit) |
| **C** | Nằm nghỉ (Lie down) |
| **Z** | Ngủ (Sleep - nhắm mắt và phát hiệu ứng chữ Zzz) |
| **B** | Thơm má / Boop (Thò chân trước ra và bắn tim ❤️) |
| **L** | Cười Haha |
| **K** | Khóc (Rơi hạt nước mắt) |
| **Y** | Ngáp uể oải |
| **E** | Nhặt quả táo / Thả vật phẩm / Ăn táo |
| **Enter** | Mở ô chat để trò chuyện |
| **`/w <tên> <lời nhắn>`** | Thì thầm riêng cho người chơi khác |

---

## 👥 4. Kiểm tra tính năng nhiều người chơi (Multiplayer)
1. Mở tab trình duyệt thứ nhất tại `http://localhost:3000`, chọn 1 chú ngựa và nhấn **Play Game**.
2. Mở tab trình duyệt thứ hai (hoặc mở cửa sổ ẩn danh), chọn 1 chú ngựa khác và nhấn **Play Game**.
3. Bạn sẽ thấy ngay hai chú ngựa xuất hiện cùng nhau trong thị trấn, cùng di chuyển, boop nhau, chat hiện bong bóng thoại và thì thầm trong thời gian thực!

---

## 📁 5. Cấu trúc thư mục dự án

```
c:\Users\hoang\Downloads\game/
├── package.json              # Khai báo dependency và script khởi chạy
├── server.js                 # Server backend Node.js (REST API + WebSocket)
├── start.bat                 # Script chạy nhanh 1-click cho Windows
├── README.md                 # Tài liệu hướng dẫn chi tiết
├── data/                     # Thư mục dữ liệu lưu trữ
│   ├── characters.json       # Danh sách Pony tự tạo được lưu
│   ├── world.json            # Tọa độ cây cối, ghế, đèn lồng và quả táo
│   └── settings.json         # Cài đặt âm lượng, góc nhìn
├── public/                   # Thư mục web client chính
│   ├── index.html            # Giao diện chính của game
│   ├── css/
│   │   └── style.css         # Bộ stylesheet pixel art chuẩn Pony Town
│   ├── js/
│   │   ├── sprites.js        # Engine vẽ ngựa và gạch pixel art
│   │   ├── world.js          # Hệ thống bản đồ, va chạm, ngày/đêm
│   │   ├── audio.js          # Bộ tổng hợp âm thanh & nhạc piano
│   │   ├── customizer.js     # Trình tạo & chỉnh sửa nhân vật
│   │   ├── net.js            # Client WebSocket đồng bộ mạng
│   │   ├── chat.js           # Bong bóng chat & lệnh thì thầm
│   │   └── game.js           # Vòng lặp game, camera & phím bấm
│   └── assets/
│       ├── scripts/          # Chứa chunk esbuild runtime đã sửa lỗi
│       └── style/            # Stylesheet backup
└── archive/                  # Lưu trữ file tải gốc ban đầu
```
