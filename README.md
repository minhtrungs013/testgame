# 🏕️ Testgame — Sinh tồn

Game 3D sinh tồn góc nhìn thứ 3 (Three.js, chạy trực tiếp trên trình duyệt, không cần build).

## Giai đoạn 1 (hiện tại)
- Nhân vật thứ 3: WASD di chuyển, chuột xoay camera (pointer lock), Shift chạy nhanh, Space nhảy
- Thế giới: đồi cỏ, 130 cây, 55 tảng đá, 42 bụi quả mọng
- Thu thập: nhắm vào cây/đá/bụi → **E** hoặc **chuột trái**
  - 🪵 Chặt cây → Gỗ (cây đổ và mọc lại sau 60s)
  - 🪨 Đập đá → Đá
  - 🫐 Hái quả → Quả mọng (nhấn **F** để ăn, +22 độ no)
- Sinh tồn: Máu / Độ no / Thể lực — đói quá sẽ mất máu, chết thì hồi sinh
- Ngày/đêm: chu kỳ 8 phút, ban đêm trời tối

## Chạy game
Cần một static server (ES modules không chạy bằng `file://`):

```bash
npx serve .
# hoặc
python3 -m http.server 8000
```

Mở trình duyệt vào địa chỉ hiện ra, bấm vào màn hình để bắt đầu.

## Cấu trúc
```
index.html          HUD + overlay
css/style.css       giao diện
js/main.js          khởi động, vòng lặp, ngày/đêm
js/noise.js         noise + độ cao địa hình
js/world.js         địa hình, cây, đá, bụi quả (instanced)
js/player.js        nhân vật thứ 3 + animation
js/gather.js        tương tác thu thập + hạt hiệu ứng
js/ui.js            HUD, thông báo
```

## Lộ trình
- [x] Giai đoạn 1: di chuyển + thu thập + sinh tồn cơ bản
- [ ] Giai đoạn 2: chế tạo công cụ (rìu, cuốc, giáo, đuốc) + săn thú
- [ ] Giai đoạn 3: xây dựng nơi trú ẩn (tường, mái, lửa trại)
- [ ] Giai đoạn 4: thú dữ, thời tiết, độ khó tăng dần, multiplayer
