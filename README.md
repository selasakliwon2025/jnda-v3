# jnda-v3
Aplikasi Presensi
Tujuan	Database inti JN Daily Attendance V3.
Platform	GAS + Google Sheets, relational-like agar mudah migrasi Laravel + MySQL.
Timezone	Asia/Jakarta
Office	Senin-Kamis 08:00-16:30; Jumat 08:00-17:00.
Operational	07:00-19:00 / 19:00-07:00 atau 08:00-20:00 / 20:00-08:00.
Security	07:00-19:00 / 19:00-07:00; satu pegawai dapat memiliki banyak lokasi. (kasus satpam Graha Pelni & Margomulyo)
Crew	Fleksibel; SHIP_ID otomatis dari employee; tidak memilih kapal.
Nahkoda	HR_ShipAuthority mendukung pengganti sementara.
GPS	Otomatis berdasarkan assignment; validasi server-side.
Durasi	Timestamp server; WORKING_MINUTES dan OVERTIME_MINUTES.
Archive	Target aktif ±3 bulan; backup diverifikasi sebelum purge.
Device binding	OFF.
