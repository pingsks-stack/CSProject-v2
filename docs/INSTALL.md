# คู่มือติดตั้ง CS Project v2 บนเซิร์ฟเวอร์

สำหรับผู้ดูแลเซิร์ฟเวอร์หรือเจ้าหน้าที่ IT ที่จะติดตั้งระบบติดตามโครงงานให้ใช้งานจริง
(ถ้าจะรันบนเครื่องตัวเองเพื่อพัฒนา ดู [README.md](../README.md) แทน — สั่ง `npm run dev` ได้เลย ส่วนเดโมออนไลน์ดู [DEMO.md](DEMO.md))

## สารบัญ

1. [ภาพรวมของระบบ](#1-ภาพรวมของระบบ)
2. [สิ่งที่ต้องเตรียม](#2-สิ่งที่ต้องเตรียม)
3. [ติดตั้งโปรแกรมพื้นฐาน](#3-ติดตั้งโปรแกรมพื้นฐาน)
4. [ดาวน์โหลดโปรเจคและติดตั้งไลบรารี](#4-ดาวน์โหลดโปรเจคและติดตั้งไลบรารี)
5. [ตั้งค่า server/.env](#5-ตั้งค่า-serverenv)
6. [Build และสร้างผู้ดูแลระบบคนแรก](#6-build-และสร้างผู้ดูแลระบบคนแรก)
7. [ให้ระบบทำงานตลอดเวลา (service)](#7-ให้ระบบทำงานตลอดเวลา-service)
8. [เปิดใช้ผ่าน HTTPS (reverse proxy)](#8-เปิดใช้ผ่าน-https-reverse-proxy)
9. [ตั้งค่าการส่งอีเมล](#9-ตั้งค่าการส่งอีเมล)
10. [GitHub (ไม่บังคับ)](#10-github-ไม่บังคับ)
11. [สำรองและกู้คืนข้อมูล](#11-สำรองและกู้คืนข้อมูล)
12. [อัปเดตเป็นเวอร์ชันใหม่](#12-อัปเดตเป็นเวอร์ชันใหม่)
13. [ปัญหาที่พบบ่อย](#13-ปัญหาที่พบบ่อย)

---

## 1. ภาพรวมของระบบ

```
ผู้ใช้ (เบราว์เซอร์)
   │  https://csproject.<โดเมน>
   ▼
IIS หรือ nginx  ── ใบรับรอง HTTPS, จำกัดขนาดไฟล์อัปโหลด
   │  http://localhost:4000
   ▼
Node.js (server/dist/index.js) ── เสิร์ฟทั้งหน้าเว็บ (client/dist) และ API (/api)
   │                    │
   ▼                    ▼
MongoDB            server/uploads/  (ไฟล์เอกสาร รูปภาพ ที่ผู้ใช้อัปโหลด)
```

- โปรแกรมทั้งหมดรันเป็น **Node.js process เดียว** (พอร์ต 4000 ค่าเริ่มต้น) ไม่ต้องตั้งเว็บเซิร์ฟเวอร์แยกสำหรับหน้าเว็บ
- ข้อมูลที่ต้องสำรองมี 2 ส่วน: **ฐานข้อมูล MongoDB** และ **โฟลเดอร์ `server/uploads/`**
- เปิดพอร์ต 443 (HTTPS) ให้ภายนอกเท่านั้น พอร์ต 4000 และ MongoDB (27017) ให้เข้าได้เฉพาะจากเครื่องเดียวกัน

## 2. สิ่งที่ต้องเตรียม

| รายการ | ข้อกำหนด |
|---|---|
| เซิร์ฟเวอร์ | Windows Server 2019 ขึ้นไป หรือ Ubuntu 22.04/24.04, RAM 2 GB ขึ้นไป |
| พื้นที่ดิสก์ | 10 GB ขึ้นไป (ไฟล์เล่มรายงานเพิ่มขึ้นทุกปี ไฟล์ละไม่เกิน 30 MB) |
| Node.js | เวอร์ชัน 22 LTS ขึ้นไป |
| MongoDB | Community Server 7 หรือ 8 (ติดตั้งบนเครื่องเดียวกัน) หรือใช้ MongoDB Atlas |
| Git | สำหรับดาวน์โหลดและอัปเดตโปรเจค |
| โดเมนและใบรับรอง | เช่น `csproject.ict.up.ac.th` พร้อมใบรับรอง HTTPS (ของมหาวิทยาลัยหรือ Let's Encrypt) |
| บัญชีอีเมลสำหรับส่ง (ไม่บังคับ) | ใช้ส่งการแจ้งเตือน/ลืมรหัสผ่าน เช่น Gmail หรือ Microsoft 365 ของมหาวิทยาลัย |

## 3. ติดตั้งโปรแกรมพื้นฐาน

### Windows Server (PowerShell แบบ Administrator)

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install MongoDB.Server
```

ถ้าไม่มี winget ให้ดาวน์โหลดตัวติดตั้งจาก [nodejs.org](https://nodejs.org), [git-scm.com](https://git-scm.com) และ [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
ตอนติดตั้ง MongoDB ให้เลือก **Install MongoD as a Service** แล้วตรวจว่า service ชื่อ `MongoDB` ทำงานอยู่ (`Get-Service MongoDB`)

เปิด PowerShell ใหม่แล้วตรวจเวอร์ชัน:

```powershell
node -v    # ต้องได้ v22 ขึ้นไป
git --version
```

### Ubuntu

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git

# MongoDB 8 (ตามคู่มือทางการ https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/)
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

### (แนะนำ) ตั้งรหัสผ่านให้ MongoDB

ค่าเริ่มต้น MongoDB รับการเชื่อมต่อจากเครื่องเดียวกันเท่านั้น (`bindIp: 127.0.0.1`) ซึ่งปลอดภัยระดับหนึ่งแล้ว
ถ้าต้องการเพิ่มรหัสผ่าน ให้สร้างผู้ใช้ฐานข้อมูลด้วย `mongosh`:

```javascript
use csproject
db.createUser({ user: 'csproject', pwd: '<รหัสผ่านยาว ๆ>', roles: [{ role: 'readWrite', db: 'csproject' }] })
```

แล้วเปิด `security.authorization: enabled` ในไฟล์ตั้งค่า MongoDB (`mongod.cfg` บน Windows, `/etc/mongod.conf` บน Ubuntu) และ restart service
จากนั้นใช้ `MONGODB_URI=mongodb://csproject:<รหัสผ่าน>@127.0.0.1:27017/csproject` ในขั้นตอนที่ 5

## 4. ดาวน์โหลดโปรเจคและติดตั้งไลบรารี

```bash
# Windows เช่น D:\apps   |   Ubuntu เช่น /opt
git clone <ลิงก์ repository ของ CSProject-v2> csproject
cd csproject
npm ci
```

`npm ci` ติดตั้งไลบรารีทั้งหมดตาม `package-lock.json` (ต้องติดตั้งแบบครบ ไม่ใช้ `--omit=dev` เพราะต้องใช้ตอน build และรันสคริปต์ดูแลระบบ)
ถ้าเห็นข้อความเตือน `allow-scripts` ไม่ต้องทำอะไร

## 5. ตั้งค่า server/.env

```bash
# Windows: copy server\.env.example server\.env
cp server/.env.example server/.env
```

แก้ `server/.env` อย่างน้อยค่าเหล่านี้:

```ini
NODE_ENV=production
MONGODB_URI=mongodb://127.0.0.1:27017/csproject
JWT_SECRET=<ค่าสุ่มยาว ๆ ดูวิธีสร้างด้านล่าง>
APP_URL=https://csproject.ict.up.ac.th
PORT=4000
```

สร้างค่าสุ่มสำหรับ `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

ค่าทั้งหมดที่ตั้งได้:

| ค่า | จำเป็น | ความหมาย |
|---|---|---|
| `NODE_ENV` | ✔ | `production` บนเซิร์ฟเวอร์จริง |
| `MONGODB_URI` | ✔ | ที่อยู่ฐานข้อมูล (Atlas: `mongodb+srv://...`) |
| `JWT_SECRET` | ✔ | กุญแจเซ็นการล็อกอิน **ห้ามเผยแพร่** ถ้าเปลี่ยน ผู้ใช้ทุกคนต้องล็อกอินใหม่ |
| `APP_URL` | ✔ | ที่อยู่เว็บที่ผู้ใช้เปิด ใช้ทำลิงก์ในอีเมล (ไม่มี `/` ท้าย) |
| `PORT` | | พอร์ตของ Node.js (ค่าเริ่มต้น 4000) |
| `TRUST_PROXY` | | reverse proxy ที่เชื่อถือ ค่าเริ่มต้น `loopback` (อยู่เครื่องเดียวกัน) ถ้าอยู่คนละเครื่องใส่ IP ของ proxy |
| `COOKIE_SECURE` | | ค่าเริ่มต้น `true` ในโหมด production (ส่งคุกกี้ล็อกอินเฉพาะ HTTPS) ตั้ง `false` เฉพาะกรณีจำเป็นต้องใช้ `http://` ภายในเครือข่าย |
| `UPLOAD_DIR` | | โฟลเดอร์เก็บไฟล์อัปโหลด (ค่าเริ่มต้น `server/uploads`) ระบุเป็นพาธเต็มได้ เช่นดิสก์อื่น |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | | การส่งอีเมล ดูขั้นตอนที่ 9 (ไม่ตั้ง = ไม่ส่งอีเมล) |
| `REMINDERS` | | `off` = ปิดการเตือนกำหนดส่งอัตโนมัติ |
| `BACKUP_DIR`, `BACKUP_KEEP` | | โฟลเดอร์ไฟล์สำรองและจำนวนชุดที่เก็บ (ค่าเริ่มต้น `backups`, 14) |
| `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET` | | การเชื่อม GitHub ดูขั้นตอนที่ 10 |

## 6. Build และสร้างผู้ดูแลระบบคนแรก

```bash
npm run build
npm run create-admin
```

`create-admin` จะถามชื่อผู้ใช้ ชื่อ และอีเมล แล้วแสดง **รหัสผ่านชั่วคราว** (หรือใส่ทั้งหมดในคำสั่งเดียว:
`npm run create-admin -- --username admin --name "ผู้ดูแลระบบ" --email admin@up.ac.th`)

ลองรัน:

```bash
npm start
```

เปิด `http://localhost:4000` บนเซิร์ฟเวอร์ ล็อกอินด้วยแอดมิน แล้วเปลี่ยนรหัสผ่านทันที กด `Ctrl+C` เพื่อหยุด
จากนั้นเข้าไปที่เมนูแอดมินเพื่อ: สร้างบัญชีอาจารย์ (หน้า "ผู้ใช้งาน"), ตั้งกำหนดส่งของภาคการศึกษา, ตรวจประเภทโครงงาน และตั้งชื่อประธานหลักสูตร (หน้า "ตั้งค่าแบบฟอร์ม")

> ในโหมด production ระบบ **ไม่สร้างบัญชีทดสอบ** (demo_student ฯลฯ) ให้ — บัญชีเหล่านั้นมีเฉพาะบนเครื่องพัฒนา

## 7. ให้ระบบทำงานตลอดเวลา (service)

### Windows: ใช้ NSSM

ดาวน์โหลด [NSSM](https://nssm.cc/download) แตกไฟล์ไว้ เช่น `C:\tools\nssm.exe` แล้วสั่ง (PowerShell แบบ Administrator):

```powershell
C:\tools\nssm.exe install CSProject "C:\Program Files\nodejs\node.exe" "D:\apps\csproject\server\dist\index.js"
C:\tools\nssm.exe set CSProject AppDirectory "D:\apps\csproject\server"
C:\tools\nssm.exe set CSProject AppStdout "D:\apps\csproject\logs\server.log"
C:\tools\nssm.exe set CSProject AppStderr "D:\apps\csproject\logs\server.log"
C:\tools\nssm.exe set CSProject DependOnService MongoDB
C:\tools\nssm.exe start CSProject
```

สร้างโฟลเดอร์ `logs` ก่อน คำสั่งที่ใช้บ่อย: `nssm restart CSProject`, `nssm stop CSProject`, `Get-Service CSProject`

### Ubuntu: ใช้ systemd

```bash
sudo useradd --system --home /opt/csproject csproject
sudo chown -R csproject:csproject /opt/csproject
sudo nano /etc/systemd/system/csproject.service
```

```ini
[Unit]
Description=CS Project v2
After=network.target mongod.service

[Service]
WorkingDirectory=/opt/csproject/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
User=csproject

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now csproject
journalctl -u csproject -f      # ดู log
```

## 8. เปิดใช้ผ่าน HTTPS (reverse proxy)

ไฟล์อัปโหลดใหญ่สุดไฟล์ละ 30 MB และอัปโหลดไฟล์โครงงานได้ครั้งละ 10 ไฟล์ จึงต้องตั้ง proxy ให้รับคำขอได้อย่างน้อย **320 MB**

### IIS (Windows)

1. ติดตั้ง [URL Rewrite](https://www.iis.net/downloads/microsoft/url-rewrite) และ [Application Request Routing (ARR)](https://www.iis.net/downloads/microsoft/application-request-routing)
2. IIS Manager → คลิกชื่อเซิร์ฟเวอร์ → Application Request Routing Cache → Server Proxy Settings → ติ๊ก **Enable proxy** → Apply
3. URL Rewrite (ระดับเซิร์ฟเวอร์) → View Server Variables → เพิ่ม `HTTP_X_FORWARDED_PROTO`
4. สร้างเว็บไซต์ใหม่ ผูก binding `https` กับใบรับรองของโดเมน ชี้ Physical path ไปที่โฟลเดอร์ว่าง เช่น `D:\apps\csproject-proxy` แล้ววางไฟล์ `web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="CSProject" stopProcessing="true">
          <match url="(.*)" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="https" />
          </serverVariables>
          <action type="Rewrite" url="http://localhost:4000/{R:1}" />
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="335544320" />
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
```

5. (แนะนำ) เพิ่มเว็บไซต์ http ที่ redirect ไป https

### nginx (Ubuntu)

```nginx
server {
    listen 443 ssl http2;
    server_name csproject.ict.up.ac.th;
    ssl_certificate     /etc/ssl/certs/csproject.crt;
    ssl_certificate_key /etc/ssl/private/csproject.key;
    client_max_body_size 320m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server {
    listen 80;
    server_name csproject.ict.up.ac.th;
    return 301 https://$host$request_uri;
}
```

ถ้ายังไม่มีใบรับรอง ใช้ Let's Encrypt: `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx`

> ถ้าจำเป็นต้องใช้ผ่าน `http://` ภายในเครือข่ายโดยไม่มี HTTPS ต้องตั้ง `COOKIE_SECURE=false` ไม่อย่างนั้นเบราว์เซอร์จะไม่เก็บคุกกี้ล็อกอิน (ล็อกอินแล้วเด้งกลับ)

## 9. ตั้งค่าการส่งอีเมล

ระบบใช้อีเมลสำหรับ: ลืมรหัสผ่าน, แจ้งเตือน (คำเชิญอาจารย์ ผลอนุมัติคำขอ ผลตรวจเอกสาร ผลพิจารณา) และเตือนกำหนดส่ง
ผู้ใช้ปิดการรับอีเมลแจ้งเตือนเองได้ที่หน้าโปรไฟล์ ถ้าไม่ตั้งค่า SMTP ระบบยังใช้งานได้ปกติ แต่ไม่ส่งอีเมล (ลืมรหัสผ่านต้องให้แอดมินรีเซ็ตให้)

**Gmail** (เปิดยืนยันตัวตน 2 ขั้นตอน แล้วสร้าง [App Password](https://myaccount.google.com/apppasswords)):

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=csproject.up@gmail.com
SMTP_PASS=<App Password 16 ตัว>
MAIL_FROM="CS Project <csproject.up@gmail.com>"
```

**Microsoft 365 ของมหาวิทยาลัย**: `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`
(ต้องขอให้ผู้ดูแลอีเมลเปิด *Authenticated SMTP* ให้บัญชีที่ใช้ส่ง)

ทดสอบ: restart service → หน้าเข้าสู่ระบบ → "ลืมรหัสผ่าน?" ด้วยบัญชีของตัวเอง ถ้าไม่ได้รับอีเมล ดู log ที่ขึ้นต้นด้วย `[mail]`

การเตือนกำหนดส่งทำงานเองทุกชั่วโมงระหว่าง 07:00–21:00 (เวลาไทย) เตือนนิสิตที่ยังไม่ส่งบทนั้นเมื่อเหลือ 3 วัน, 1 วัน และหลังเลยกำหนด 1 วัน (เตือนเรื่องละครั้งเดียว)

## 10. GitHub (ไม่บังคับ)

นิสิตเชื่อม GitHub repository แบบ public กับโครงงานได้เองที่หน้าโครงงาน (รายละเอียดใน README)

- **`GITHUB_TOKEN`** (แนะนำเมื่อมีหลายโครงงาน): GitHub ให้เรียกได้ 60 ครั้ง/ชม. ถ้าไม่มี token
  สร้างที่ GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Repository access: *Public repositories (read-only)* → ไม่ต้องเลือกสิทธิ์อื่น
- **`GITHUB_WEBHOOK_SECRET`** (ให้อัปเดตทันทีที่ push): ตั้งเป็นค่าสุ่ม (ใช้คำสั่งเดียวกับ `JWT_SECRET`) แล้วแจ้งนิสิตให้เพิ่ม webhook ใน repository
  ชี้มาที่ `https://<โดเมน>/api/github/webhook` (ใช้ได้เมื่อเซิร์ฟเวอร์เข้าถึงได้จากอินเทอร์เน็ต) ถ้าไม่ตั้ง ระบบจะอัปเดตเองเมื่อมีคนเปิดหน้าโครงงาน

## 11. สำรองและกู้คืนข้อมูล

### สำรอง

```bash
npm run backup
```

สร้างโฟลเดอร์ `backups/<วันเวลา>/` ที่มีข้อมูลทุก collection (`db/*.jsonl`), สำเนาไฟล์อัปโหลด (`uploads/`) และ `manifest.json`
เก็บไว้ล่าสุด `BACKUP_KEEP` ชุด (ค่าเริ่มต้น 14) ชุดที่เก่ากว่าถูกลบอัตโนมัติ ไม่ต้องหยุดระบบขณะสำรอง

**ตั้งให้สำรองทุกคืน**

Windows Task Scheduler → Create Task → Trigger: Daily 02:00 → Action: Start a program
- Program: `cmd.exe`
- Arguments: `/c "cd /d D:\apps\csproject && npm run backup >> backups\backup.log 2>&1"`
- ติ๊ก *Run whether user is logged on or not*

Ubuntu (`sudo crontab -u csproject -e`):

```cron
0 2 * * * cd /opt/csproject && /usr/bin/npm run backup >> backups/backup.log 2>&1
```

> คัดลอกโฟลเดอร์ `backups` ไปเก็บนอกเครื่องด้วย (อีกดิสก์ network share หรือคลาวด์ของมหาวิทยาลัย) เพราะถ้าเครื่องเสีย สำรองที่อยู่บนเครื่องเดียวกันจะหายไปด้วย

### กู้คืน

**ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่ด้วยชุดสำรอง**

```bash
nssm stop CSProject                                      # หรือ sudo systemctl stop csproject
npm run restore -- 2026-10-08T02-00-00 --yes             # ชื่อโฟลเดอร์ใน backups/ หรือพาธเต็ม
nssm start CSProject
```

ควรทดลองกู้คืนบนเครื่องทดสอบเป็นระยะ เพื่อให้แน่ใจว่าชุดสำรองใช้ได้จริง

## 12. อัปเดตเป็นเวอร์ชันใหม่

อ่านสิ่งที่เปลี่ยนใน [CHANGELOG.md](../CHANGELOG.md) ก่อน แล้ว:

```bash
npm run backup          # สำรองก่อนทุกครั้ง
git pull
npm ci
npm run build
nssm restart CSProject  # หรือ sudo systemctl restart csproject
```

## 13. ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| ล็อกอินถูกแล้วแต่เด้งกลับหน้าเข้าสู่ระบบ | เปิดผ่าน `http://` แต่คุกกี้ตั้งให้ส่งเฉพาะ HTTPS → ใช้ HTTPS หรือตั้ง `COOKIE_SECURE=false` |
| service ไม่ขึ้น log บอก `ต้องตั้ง JWT_SECRET` | ยังไม่ได้ตั้ง `JWT_SECRET` ใน `server/.env` หรือยังเป็นค่า `change-me` |
| log บอก `ต้องตั้ง MONGODB_URI` หรือเชื่อมฐานข้อมูลไม่ได้ | ตรวจว่า MongoDB service ทำงาน และ `MONGODB_URI` ถูกต้อง (ชื่อผู้ใช้/รหัสผ่าน ถ้าเปิด authorization) |
| เปิดเว็บแล้วได้ข้อความ `Cannot GET /` | ยังไม่ได้ `npm run build` (ต้องมีโฟลเดอร์ `client/dist`) แล้ว restart service |
| อัปโหลดไฟล์ใหญ่แล้วขึ้น 413 | ขนาดที่ proxy รับต่ำเกิน → ตั้ง `maxAllowedContentLength` (IIS) หรือ `client_max_body_size` (nginx) ตามขั้นตอนที่ 8 |
| ลิงก์ในอีเมลชี้ไปที่ผิด | ตั้ง `APP_URL` ให้ตรงกับที่อยู่เว็บจริง |
| อีเมลไม่ถูกส่ง | ดู log `[mail]` ตรวจ SMTP_USER/SMTP_PASS (Gmail ต้องใช้ App Password) และ firewall ขาออกพอร์ต 587 |
| เชื่อม GitHub แล้วขึ้น "GitHub จำกัดจำนวนครั้ง" | ตั้ง `GITHUB_TOKEN` |
| ลืมรหัสผ่านแอดมิน | `npm run create-admin -- --username <ชื่อแอดมิน>` จะตั้งรหัสผ่านชั่วคราวใหม่ให้ |
| พอร์ต 4000 ถูกใช้แล้ว | เปลี่ยน `PORT` ใน `.env` และแก้ปลายทางใน proxy ให้ตรงกัน |
