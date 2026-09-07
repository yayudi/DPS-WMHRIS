# DPS-WMHRIS

> **Warehouse Management System (WMS) & Human Resources Information System (HRIS)**

![Vue.js](https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D)
![Go](https://img.shields.io/badge/go-%2300ADD8.svg?style=for-the-badge&logo=go&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-005C84?style=for-the-badge&logo=mysql&logoColor=white)

Sistem terintegrasi untuk manajemen gudang (WMS) dan sumber daya manusia (HRIS). Repositori ini bersifat **publik** dan dapat digunakan atau dikembangkan ulang (fork/clone) secara bebas.

## 🚀 Fitur Utama
* **WMS:** Manajemen inventaris, stok masuk/keluar, retur manual, *stock opname*, perhitungan dengan sistem FIFO/FEFO.
* **HRIS:** (Modul HR sedang dalam pengembangan) Manajemen data karyawan, absensi, perhitungan *payroll*.
* **Background Jobs:** Proses berat (seperti kalkulasi *payroll* atau *stock opname*) berjalan via CLI Workers / CRON untuk menghindari *timeout* HTTP.
* **Audit Trail:** Sistem *changelog* dan pelacakan riwayat aktivitas untuk keamanan data.

## 🛠 Teknologi yang Digunakan
* **Frontend:** Vue.js 3 (Composition API, `<script setup>`), Tailwind CSS
* **Backend:** Golang (Gin framework), MySQL (`database/sql` + `sqlx`)
* **Testing:** Go `testing` package

## 📋 Prasyarat
Sebelum menjalankan aplikasi, pastikan Anda telah menginstal:
* Go (v1.21 atau lebih baru)
* Node.js (v18 atau lebih baru, untuk frontend)
* MySQL (v8.0 disarankan)
* Git

## ⚙️ Cara Instalasi & Menjalankan (Local)

**1. Clone Repository**
```bash
git clone https://github.com/USERNAME/DPS-WMHRIS.git
cd DPS-WMHRIS
```

**2. Setup Backend**
```bash
cd backend
go mod download
# Buat file .env berdasarkan .env.example
cp .env.example .env
# Sesuaikan kredensial database di dalam file .env
```
*Jalankan migrasi/skema database jika tersedia (misalnya melalui file `.agent/context/schema.sql`).*

**3. Setup Frontend**
```bash
cd ../frontend
npm install
# Buat file .env berdasarkan .env.example
cp .env.example .env
```

**4. Menjalankan Mode Development**
Buka 2 terminal terpisah:
```bash
# Terminal 1 (Backend)
cd backend
go run cmd/api/main.go

# Terminal 2 (Frontend)
cd frontend
npm run dev
```

## 🧠 Knowledge Graph (Graphify)
Proyek ini menggunakan **Graphify** untuk memetakan arsitektur dan relasi *source code* dalam bentuk graf. Folder output (`graphify-out`) **tidak disertakan** di dalam repositori untuk menghindari *bloat*.

Jika Anda ingin men-generate atau memperbarui *knowledge graph* secara lokal, jalankan perintah berikut di root folder:
```bash
graphify update .
```

## 📜 Lisensi
Distributed under the MIT License. Silahkan gunakan, modifikasi, dan distribusikan kembali.
