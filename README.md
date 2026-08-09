# ย้าย Frontend ไป GitHub Pages + ใช้ Apps Script เป็น API

โครงสร้างใหม่: **Google Sheet ยังเป็นฐานข้อมูลเหมือนเดิม 100%** และ **Apps Script ยังรันเหมือนเดิม**
เปลี่ยนแค่บทบาทของ Apps Script จาก "เสิร์ฟหน้าเว็บ" → "ตอบ API อย่างเดียว"
ส่วนหน้าเว็บ (HTML) ทั้งหมดย้ายไปอยู่บน GitHub Pages แทน

## สิ่งที่แก้ไว้ให้แล้วในไฟล์ชุดนี้

1. **`code.js`** — เพิ่ม `handleApiRequest()` และ `ALLOWED_API_FUNCTIONS` เข้าไปใน `doPost`
   - ถ้า request มี field `fn` → ถือว่าเป็นการเรียก API จากหน้าเว็บ (ผ่าน `gas-bridge.js`)
   - ถ้าไม่มี → ถือว่าเป็น LINE Webhook เหมือนเดิมทุกประการ (ย้ายไปอยู่ใน `handleLineWebhook()` โดยไม่แก้ logic)
   - `doGet` ที่เสิร์ฟหน้า HTML แบบเดิม **ยังอยู่เหมือนเดิม ไม่ได้ลบ** — จะยังเปิดได้ตามปกติถ้าอยากใช้คู่กันไปก่อน

2. **`gas-bridge.js`** (ไฟล์ใหม่) — จำลอง `google.script.run` ให้ยิง `fetch()` ไปหา Apps Script Web App แทน
   ทำให้**ไม่ต้องแก้โค้ดฟอร์ม/แดชบอร์ดเดิมในไฟล์ HTML แม้แต่บรรทัดเดียว**

3. **ไฟล์ HTML ทั้ง 6 ไฟล์** (`admin, daily, dashboard, purchase, student, weekly`) — เพิ่ม 2 บรรทัดนี้เข้าไปหลัง `<meta charset>`:
   ```html
   <script>
     window.GAS_API_URL = "https://script.google.com/macros/s/ใส่_DEPLOYMENT_ID_ตรงนี้/exec";
   </script>
   <script src="gas-bridge.js"></script>
   ```

---

## ขั้นตอน Deploy

### 1) อัปเดต Apps Script
1. เปิดโปรเจกต์ Apps Script เดิม (ที่ผูกกับ Google Sheet)
2. แทนที่เนื้อหาไฟล์ `.gs` ด้วย `code.js` ที่แก้ไว้ในชุดนี้
3. กด **Deploy → New deployment** (อย่าใช้ deployment เดิม จะได้ URL ใหม่ที่คุมสิทธิ์ชัดเจน)
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (ถ้าเป็นองค์กร Google Workspace ให้เลือก Anyone within [domain] ตามความเหมาะสม)
4. คัดลอก URL ที่ได้ (ลงท้ายด้วย `/exec`)

### 2) ใส่ URL ลงในไฟล์ HTML ทุกไฟล์
แทนที่ `ใส่_DEPLOYMENT_ID_ตรงนี้` ในทั้ง 6 ไฟล์ ด้วย URL จริงจากขั้นตอนที่ 1
(หรือจะทำเป็นไฟล์ config กลางไฟล์เดียวก็ได้ ถ้าอยากดูแลง่ายขึ้น — บอกได้ ผมช่วยรวมให้)

### 3) Push ขึ้น GitHub
```bash
git init
git add .
git commit -m "ย้าย frontend มา GitHub Pages เชื่อม Apps Script ผ่าน API"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```
แล้วไปที่ **Settings → Pages** เลือก branch `main` / โฟลเดอร์ `/ (root)` → จะได้ URL แบบ
`https://<username>.github.io/<repo>/dashboard.html`

### 4) ทดสอบ
- เปิด `dashboard.html` บน GitHub Pages → เปิด DevTools → Network tab ควรเห็น POST ไปที่ Apps Script URL แล้วได้ JSON กลับมา
- ลองส่งฟอร์ม `student.html` แล้วเช็คว่าแถวใหม่ขึ้นใน Google Sheet + แจ้งเตือน LINE ยังทำงาน

---

## ข้อควรระวัง / ข้อจำกัดที่ยังมีอยู่

- **Apps Script quota ยังมีอยู่เหมือนเดิม** (execution time ต่อ request 6 นาที, จำนวน URL Fetch/วัน ฯลฯ) การย้าย frontend ไม่ได้แก้ปัญหานี้ ถ้าเจอบั๊กเพราะ quota ต้องแก้ที่ฝั่ง Apps Script logic
- **CORS**: `gas-bridge.js` ส่ง POST แบบ `Content-Type: text/plain` โดยตั้งใจ เพื่อเลี่ยง preflight (OPTIONS) ที่ Apps Script ตอบไม่ได้ — **อย่าเปลี่ยนเป็น `application/json`** ไม่งั้นจะเจอ CORS error
- **ความปลอดภัย**: `ALLOWED_API_FUNCTIONS` เปิดเฉพาะ 3 ฟังก์ชันที่จำเป็น ถ้าจะเพิ่มฟังก์ชันใหม่ในอนาคต ต้องมาเติมใน list นี้ด้วยไม่งั้นเรียกไม่ได้ (ตั้งใจให้ปลอดภัยไว้ก่อน)
- **Deployment ID เปลี่ยนทุกครั้งที่ New Deployment**: ถ้า deploy ใหม่ทับของเดิม (Manage deployments → Edit) URL จะเดิม ไม่ต้องแก้ไฟล์ HTML ใหม่ แต่ถ้าสร้าง deployment ใหม่แยกจะได้ URL ใหม่ ต้องมาแก้ `GAS_API_URL` ในทุกไฟล์
- **doGet เดิมยังเปิดอยู่**: ถ้าไม่อยากให้คนเข้าหน้าเว็บผ่าน Apps Script URL เดิมได้อีก ต้องปิด/ลบ deployment เก่า