# Digital Logic Lab

Simulator rangkaian logika yang bisa dimainkan langsung di browser. Tinggal pasang saklar, gerbang, dan LED, sambungkan kabelnya, lalu hasilnya langsung terlihat.

Project capstone **HACKTIV8 x IBM SkillsBuild** (track IT - AI Agent for Programming). Dibuat lewat **vibe coding** bareng **IBM Bob**: pembuat memberi prompt, menguji, dan merevisi, sedangkan kodenya ditulis Bob.

**Dibuat oleh:** Muhamad Rafie Aditya, Institut Teknologi Sepuluh Nopember

**Tanggal:** 24 Oktober 2026

**Coba langsung:** https://kueketawa.github.io/digital-logic-lab

---

## Gambaran Singkat

Contoh rangkaian paling sederhana: dua saklar masuk ke gerbang AND, hasilnya ke LED.

```
[Saklar A] ──┐
             ├──► [ AND ] ──► (LED F1)
[Saklar B] ──┘
```

LED hanya menyala kalau A dan B sama-sama bernilai 1. Kabel yang membawa sinyal 1 tampil terang, sedangkan sinyal 0 tampil redup.

## Kenapa Project Ini Dibuat

Gerbang logika adalah dasar dari Sistem Digital, tapi susah dibayangkan kalau hanya lewat buku dan slide. Latihan di kertas cuma memberi jawaban akhir: sinyalnya mengalir ke mana tidak kelihatan, dan kesalahan baru ketahuan belakangan.

Digital Logic Lab menjawabnya lewat papan kerja interaktif. Rangkaian dirakit sendiri, input diubah-ubah, dan output serta aliran sinyal di tiap kabel langsung terlihat.

## Cocok untuk Siapa

- Mahasiswa baru Teknik Informatika (atau jurusan sejenis) yang sedang belajar logika digital.
- Siapa pun yang ingin bereksperimen dengan gerbang AND, OR, dan NOT tanpa membeli komponen atau memasang aplikasi.

## Fitur

Yang dicentang sudah diuji dan berfungsi.

**Inti**
- [x] Komponen: Saklar, LED, dan tujuh gerbang (AND, OR, NOT, NAND, NOR, XOR, XNOR)
- [x] Tambah komponen dari panel dan geser di papan kerja
- [x] Sambung kabel dari output ke input
- [x] Simulasi real-time: klik saklar, seluruh rangkaian langsung dihitung ulang
- [x] Kabel terang untuk sinyal 1, redup untuk sinyal 0
- [x] Hapus komponen (tombol ×) dan tombol "Bersihkan Papan"
- [x] Sambung ke input yang sudah terisi, kabel lama otomatis diganti
- [x] Gerbang bisa disisipkan ke kabel dengan dijatuhkan di atasnya
- [x] Sambungan yang membentuk loop ditolak
- [x] Label gerbang tampil sekali saja

**Penyempurnaan**
- [x] Panel "Cara Pakai"
- [x] Tampilan responsif (panel kiri bisa dilipat, papan bisa digeser)
- [x] Ganti gerbang dengan menumpuk gerbang lain di atasnya
- [x] Undo dan redo

## Teknologi

- **HTML** untuk struktur halaman
- **CSS** untuk tampilan (tema gelap ala laboratorium)
- **JavaScript** murni untuk logika dan interaksi
- **SVG** untuk menggambar kabel
- **IBM Bob** sebagai asisten penulis kode

Tanpa framework, library tambahan, backend, ataupun model AI di dalam aplikasinya. Semua perhitungan berjalan di browser.

## Cara Menjalankan

Cara paling gampang: unduh atau clone repository ini, lalu buka `index.html` di browser (Chrome, Edge, atau Firefox).

Di VS Code, bisa juga klik kanan `index.html` lalu pilih **Open with Live Server**.

Tidak perlu instalasi dan tidak butuh internet.

## Cara Pakai

1. **Tambah komponen** dari panel kiri. Mulai dari satu Saklar dan satu LED.
2. **Sambung kabel:** klik lingkaran di sisi **kanan** komponen (output), lalu klik lingkaran di sisi **kiri** komponen lain (input).
3. **Klik Saklar** untuk mengganti nilainya antara 0 dan 1, lalu perhatikan LED dan warna kabel.
4. **Tambah gerbang** untuk rangkaian yang lebih seru. Semua gerbang punya dua input, kecuali NOT yang hanya satu.
5. **Hapus** komponen lewat tombol ×, atau pilih kabel lalu tekan Delete. "Bersihkan Papan" mengosongkan semuanya.

Beberapa trik yang memudahkan:

- **Sisip gerbang:** jatuhkan gerbang yang belum tersambung di atas sebuah kabel, kabelnya otomatis terbelah.
- **Ganti gerbang:** tumpuk gerbang yang belum tersambung di atas gerbang lain dengan jumlah input sama (misalnya AND di atas OR), tipenya berganti dan kabel tetap tersambung.
- **Ganti kabel:** sambungkan ke input yang sudah terisi, kabel lama otomatis diganti.
- **Urungkan dan ulangi:** Ctrl+Z untuk undo, Ctrl+Y (atau Ctrl+Shift+Z) untuk redo.
- **Geser papan:** seret area kosong untuk menggeser tampilan, dan tombol "Pusatkan tampilan" membawa semua komponen kembali ke layar.

Satu hal yang sering membingungkan: input yang belum disambung dianggap bernilai **0**. Jadi kalau AND hanya disambung di satu input, hasilnya selalu 0 dan LED tidak akan menyala.

| A | B | A AND B | A OR B |
|---|---|---|---|
| 0 | 0 | 0 | 0 |
| 0 | 1 | 0 | 1 |
| 1 | 0 | 0 | 1 |
| 1 | 1 | 1 | 1 |

## Isi Folder

```
digital-logic-lab/
├── index.html    # kerangka halaman: panel komponen dan papan kerja
├── style.css     # tampilan dan tema
├── script.js     # logika, simulasi, dan interaksi
└── README.md
```

## Cara Kerjanya (Singkat)

Kode dipisah jadi beberapa bagian supaya rapi:

- **Data:** daftar komponen dan kabel, sebagai satu sumber kebenaran.
- **Evaluasi:** rangkaian diperlakukan sebagai graf, lalu dihitung berurutan dari komponen yang tidak punya kabel masuk sampai ke LED. Input kosong dihitung 0, dan rangkaian tidak boleh punya loop.
- **Tampilan:** menggambar komponen dan kabel, lalu memperbarui warna kabel dan status LED setiap ada perubahan.
- **Interaksi:** klik, geser, menyambung kabel, dan menghapus.

Aturan gerbang:

| Gerbang | Input | Output jadi 1 kalau |
|---|---|---|
| AND | 2 | kedua input bernilai 1 |
| OR | 2 | salah satu atau kedua input bernilai 1 |
| NOT | 1 | input bernilai 0 |
| NAND | 2 | bukan kedua input bernilai 1 (kebalikan AND) |
| NOR | 2 | kedua input bernilai 0 (kebalikan OR) |
| XOR | 2 | kedua input berbeda nilai |
| XNOR | 2 | kedua input sama nilai |

## Proses Pembuatan Bareng IBM Bob

### Susunan Prompt (3 Layer)

| Layer | Isinya |
|---|---|
| **Layer 1: Role & Context** | Bob berperan sebagai Senior Frontend Engineer, lengkap dengan konteks project (simulator edukatif untuk mahasiswa baru) dan batasan teknologi: HTML, CSS, JavaScript murni, SVG, tanpa framework |
| **Layer 2: Task & Requirements** | Daftar fitur yang konkret: komponen, menyambung kabel, simulasi real-time, hapus, aturan sambungan, tolak loop, label otomatis |
| **Layer 3: Constraints & Output** | Output tiga file, tema gelap, logika dipisah dari tampilan, teks antarmuka berbahasa Indonesia, tanpa error di console, rencana dijelaskan dulu sebelum menulis kode, dan kasus uji ditelusuri setelah selesai |

### Iterasi Prompt

Setiap masalah diperbaiki lewat satu revisi pada layer yang relevan, ditambah pesan "jangan ubah hal lain" supaya fitur yang sudah jalan tidak ikut rusak.

| # | Masalah yang ditemukan | Perubahan | Hasil |
|---|---|---|---|
| 0 | Di rencana Bob, gerbang NOT memakai operator bitwise dan evaluasi hanya dimulai dari saklar | Diminta negasi logika (hasil pasti 0 atau 1) dan evaluasi dimulai dari semua komponen tanpa kabel masuk | Berhasil |
| 1 | Label gerbang muncul dua kali | Revisi tampilan di Layer 3 | Berhasil |
| 2 | Bingung memulai pemakaian | Tambah panel "Cara Pakai" dan tooltip di titik koneksi | Berhasil |
| 3 | Menyambung ke input yang sudah terisi ditolak, sehingga kabel harus dihapus manual | Aturan baru: kabel lama otomatis diganti | Berhasil |
| 4 | Gerbang tidak bisa disisipkan ke rangkaian yang sudah tersambung | Fitur baru: gerbang dijatuhkan di atas kabel, kabelnya terbelah | Berhasil |
| 5 | Panel kiri tidak bisa dilipat dan papan tidak bisa digeser saat jendela dikecilkan | Tombol lipat panel, papan bisa digeser, tombol "Pusatkan tampilan" | Berhasil |
| 6 | Gerbang yang ditumpuk di atas gerbang justru memicu sorotan kabel | Fitur ganti gerbang, prioritasnya di atas sisip kabel | Berhasil |
| 7 | Salah sedikit harus mengulang dari awal | Undo dan redo | Berhasil |
| 8 | Pilihan gerbang masih terbatas pada AND, OR, dan NOT | Penambahan gerbang NAND, NOR, XOR, dan XNOR | Berhasil |

### Pelajaran dari Proses

- **Spesifik itu penting.** Kasus uji yang ditulis di prompt membuat Bob bisa memeriksa hasilnya sendiri.
- **Satu masalah, satu revisi.** Kalau prompt ditulis ulang total, penyebab kerusakan jadi susah dilacak.
- **Hasil tetap diperiksa manual.** Keluaran Bob selalu dicoba di browser, tidak langsung dipercaya (menghindari "vibe trap").
- **Kelihatan gagal belum tentu gagal.** Di iterasi 3, perbaikan awalnya tampak tidak jalan. Ternyata halaman perlu di-refresh paksa (Ctrl+F5) dan urutan klik perlu dicek dulu.

## Pengujian

Semua dites manual di browser.

| Kasus uji | Harusnya | Hasil |
|---|---|---|
| Saklar A dan B ke AND ke LED | LED nyala hanya kalau A=1 dan B=1 | Berhasil |
| Saklar A dan B ke OR ke LED | LED nyala kalau A=1 atau B=1 | Berhasil |
| Saklar ke NOT ke LED | LED nyala hanya kalau saklar 0 | Berhasil |
| (A AND B) OR (NOT C) | Benar untuk 8 kombinasi input | Berhasil |
| Sambungan yang membentuk loop | Ditolak dan muncul pesan | Berhasil |
| Geser komponen yang punya kabel | Kabel ikut menempel | Berhasil |
| Hapus komponen yang punya kabel | Tidak ada kabel yang menggantung | Berhasil |
| Sambung ke input yang sudah terisi | Kabel lama diganti kabel baru | Berhasil |
| NOT dijatuhkan di atas kabel saklar ke LED | Kabel terbelah, LED nyala saat saklar 0 | Berhasil |
| AND ditumpuk di atas OR yang sudah tersambung | OR berganti jadi AND, kabel tetap tersambung | Berhasil |
| Undo dan redo | Setiap aksi bisa diurungkan dan diulang | Berhasil |
| Jendela browser dikecilkan | Panel bisa dilipat dan papan bisa digeser | Berhasil |
| Ketujuh gerbang dengan input yang sama | Hasil sesuai tabel kebenaran masing-masing gerbang | Berhasil |

## Keterbatasan

- Setiap gerbang selain NOT hanya punya dua input. Untuk tiga input, sambungkan dua gerbang, misalnya `(A AND B) AND C`.
- Rangkaian dengan loop dan rangkaian sekuensial seperti flip-flop belum didukung.
- Rangkaian belum bisa disimpan dan dibuka lagi.
- Pengujian masih manual, belum ada tes otomatis.

## Rencana ke Depan

- Truth table otomatis dari rangkaian yang dirakit
- Rangkaian contoh (half adder, full adder), plus simpan dan muat rangkaian
- Generator rangkaian dari ekspresi Boolean
- Mode tantangan berlevel: merakit rangkaian yang cocok dengan target truth table
- Zoom papan, duplikat komponen, dan pilih banyak komponen sekaligus
- Tes otomatis untuk logika gerbang

## Terima Kasih

- **IBM Bob** (IBM SkillsBuild), penulis kodenya.
- **HACKTIV8 x IBM SkillsBuild**, penyelenggara programnya.
