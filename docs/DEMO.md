# เดโมบน Cloudflare

เปิดระบบเป็นเดโมให้คนทั่วไปลองใช้ได้ตลอด 24 ชั่วโมง ผ่าน [Cloudflare Containers](https://developers.cloudflare.com/containers/)
deploy อัตโนมัติด้วย GitHub Actions ทุกครั้งที่ push เข้า `main` (หลังชุดทดสอบผ่าน)

## เดโมทำงานอย่างไร

```
ผู้ใช้ → https://csproject-demo.<subdomain>.workers.dev
        → Cloudflare Worker (deploy/cloudflare/src/index.ts)
        → Container 1 ตัว (Dockerfile): หน้าเว็บ + API + MongoDB ชั่วคราว
```

- container รันในโหมดเดโม (`DEMO_MODE=true`): ใช้ MongoDB ภายใน container แล้วใส่ข้อมูลตัวอย่างให้ทุกครั้งที่เริ่ม
  หน้าเข้าสู่ระบบแสดงบัญชีทดสอบให้กดเข้าได้เลย และมีแถบแจ้งว่าเป็นระบบทดลอง
- ไม่มีผู้ใช้ 30 นาที container จะหลับ (ไม่เสียค่าใช้จ่ายขณะหลับ) มีคนเปิดเว็บก็ตื่นเองภายในไม่กี่วินาที
  **ทุกครั้งที่ตื่นข้อมูลจะกลับเป็นข้อมูลตัวอย่าง** ใครแก้หรือลบอะไรไว้ก็หายไป เดโมจึงไม่พังถาวร
- เดโมไม่ส่งอีเมล (ไม่ได้ตั้ง SMTP) และไม่ควรใส่ข้อมูลจริง ใช้งานจริงให้ติดตั้งตาม [INSTALL.md](INSTALL.md)

## ตั้งค่าครั้งแรก

### 1. บัญชี Cloudflare และแผน Workers Paid

1. สมัคร/เข้าสู่ระบบที่ [dash.cloudflare.com](https://dash.cloudflare.com)
2. Workers & Pages → Plans → เลือก **Workers Paid** ($5/เดือน — Containers ต้องใช้แผนนี้)
3. ถ้ายังไม่เคยใช้ Workers ให้ตั้ง workers.dev subdomain (Workers & Pages → Overview จะถามครั้งแรก)

### 2. สร้าง API token

My Profile → API Tokens → Create Token → ใช้แม่แบบ **Edit Cloudflare Workers**
- Account Resources: เลือกบัญชีของคุณ
- ถ้าในรายการสิทธิ์มี **Containers** ให้เพิ่ม `Account → Containers → Edit` ด้วย
- Create Token แล้วคัดลอก token เก็บไว้ (แสดงครั้งเดียว)

Account ID ดูได้ที่หน้า Workers & Pages (แถบด้านขวา "Account ID")

### 3. ใส่ secrets ใน GitHub

repository บน GitHub → Settings → Secrets and variables → Actions → New repository secret

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token จากขั้นตอนที่ 2 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID |

หรือใช้ GitHub CLI ในโฟลเดอร์โปรเจค (จะถามค่าให้วาง):

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
```

### 4. Deploy

push อะไรก็ได้เข้า `main` หรือไปที่แท็บ Actions → CI → Re-run (job `deploy-demo`)
deploy ครั้งแรกใช้เวลาราว 5–10 นาที (build image) ดูลิงก์เดโมได้ใน log ของขั้นตอน "Deploy to Cloudflare"
หรือที่ Cloudflare Dashboard → Workers & Pages → `csproject-demo`

> ถ้าไม่ได้ตั้ง secrets job `deploy-demo` จะข้ามไปเอง (CI ยังผ่านตามปกติ)

## ค่าใช้จ่าย (ประมาณ)

แผน Workers Paid $5/เดือน รวมการใช้งาน container ต่อเดือน: หน่วยความจำ 25 GiB-ชั่วโมง, CPU 375 vCPU-นาที, ดิสก์ 200 GB-ชั่วโมง
เดโมใช้ instance แบบ `basic` (1 GiB, 1/4 vCPU) และหลับเมื่อไม่มีคนใช้ จึงจ่ายเฉพาะช่วงที่มีคนเปิดอยู่
ใช้งานไม่เกินประมาณ 25 ชั่วโมงที่ container ทำงานต่อเดือนจะอยู่ในส่วนที่รวมแล้ว
ถ้าเปิดค้างต่อเนื่องทั้งเดือน ค่าหน่วยความจำส่วนเกินประมาณ $6/เดือน (บวก CPU ตามการใช้งานจริง)
ดูราคาปัจจุบันที่ [หน้าราคา Containers](https://developers.cloudflare.com/containers/pricing/)

## ปรับแต่ง

| ต้องการ | แก้ที่ |
|---|---|
| เวลาก่อน container หลับ | `sleepAfter` ใน `deploy/cloudflare/src/index.ts` |
| ชื่อ Worker / URL | `name` ใน `deploy/cloudflare/wrangler.jsonc` |
| ขนาดเครื่อง | `instance_type` (`lite`, `basic`, `standard-1` …) ใน `wrangler.jsonc` |
| บัญชีที่แสดงในหน้าเข้าสู่ระบบ | `server/src/routes/public.ts` (`/config`) |

ใช้โดเมนของตัวเอง: Cloudflare Dashboard → Workers & Pages → `csproject-demo` → Settings → Domains & Routes

## deploy จากเครื่องตัวเอง (ทางเลือก)

ต้องมี Docker (Docker Desktop) ทำงานอยู่:

```bash
cd deploy/cloudflare
npm ci
npx wrangler login
npx wrangler deploy
```

ลองรันเดโมในเครื่องด้วย Docker: `docker build -t csproject-demo . && docker run -p 8080:8080 csproject-demo` แล้วเปิด http://localhost:8080
(หรือไม่ใช้ Docker: `npm run build` แล้ว `NODE_ENV=production DEMO_MODE=true COOKIE_SECURE=false node server/dist/index.js`)

## เลิกใช้เดโม

Cloudflare Dashboard → Workers & Pages → `csproject-demo` → Settings → Delete
แล้วลบ secrets `CLOUDFLARE_API_TOKEN` ใน GitHub (job deploy จะข้ามไปเอง)
