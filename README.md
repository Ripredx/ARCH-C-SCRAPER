# Arch/C Scraper Studio

**Arch/C Scraper Studio**, işletme verilerini (özellikle Google Maps üzerinden) otomatik olarak toplayan, temizleyen ve yerel bir Yapay Zeka (LLM) modeli kullanarak bu verileri analiz edip satış metinleri (cold pitch) veya derinlemesine analiz raporları oluşturmanızı sağlayan siberpunk temalı, tam teşekküllü bir araçtır.

![Arch/C Studio](frontend/src/assets/hero.png) <!-- Hero görseliniz varsa burası için placeholder -->

## 🚀 Özellikler

- **The Harvester (Veri Toplayıcı):** Google Maps üzerinden anahtar kelime, lokasyon ve limit belirleyerek işletme verilerini çeker (Telefon, Adres, Web Sitesi vb.). "Kalıcı olarak kapalı" olan işletmeleri doğrudan filtreler.
- **Akıllı Site & Sınıflandırma:** Toplanan web sitelerine `httpx` üzerinden asenkron ping atılarak sitenin aktif olup olmadığı denetlenir. Sonuçlar 4 ana grupta (Aktif Web Sitesi, Sosyal Medya Kullanıcısı, Ölü Link/Site Yok, Sahipsiz) analiz edilir.
- **Satış & Fırsat Dedektörü:** İşletmenin Google'da sahiplenilip sahiplenilmediği ("Bu işletmeyi sahiplenin" etiketi) tespit edilir ve rapora "⚠️ Haritada Sahipsiz" rozeti eklenerek ajanslara fırsat yaratılır. Ayrıca bulunan mobil numaralara tek tıkla "📱 WhatsApp'tan Mesaj At" butonu eklenir.
- **Veri Rafinerisi (Data Refinery):** Kazılan verileri temiz, renk kodlu ve siberpunk tasarımlı, zenginleştirilmiş etkileşimli HTML raporları olarak sunar. HTML raporlarındaki listeler açılır-kapanır (accordion) yapıda sunulur. Tıklanan bağlantılar güvenli biçimde yeni sekmede açılır.
- **Komuta Merkezi (Command Center):** Elde edilen verileri siberpunk tasarımlı karanlık bir arayüzde listeler. İşletmeleri "Web sitesi olanlar" ve "Web sitesi olmayanlar" olarak sınıflandırır.
- **Deep Crawl (Derin Kazı):** İşletmelerin sitelerine `Scrapling` ve `Camoufox` motorlarıyla (SSL hatalarını atlayarak ve Javascript destekli SPA'leri okuyarak) girip derin tarama yapar. Çıkan raporları uygulama içi **Iframe Penceresi (Modal)** üzerinden anında okuyabilirsiniz.
- **Yapay Zeka Entegrasyonu:** İşletme verilerini ve Deep Crawl sonuçlarını **LM Studio** (Yerel çalışan modeller) üzerinden geçirerek saniyeler içinde kişiselleştirilmiş satış metinleri (Pitch) üretir.
- **Canlı WebSocket Logları:** Tüm işlemler sırasında arka planda dönen log akışını (terminal benzeri bir arayüzle) anlık olarak ön yüzde gösterir.

## 🛠️ Kullanılan Teknolojiler

### Backend (Python / FastAPI)
- **[FastAPI](https://fastapi.tiangolo.com/):** Hızlı ve modern REST API + WebSocket mimarisi.
- **[Scrapling](https://github.com/D4Vinci/Scrapling):** Kamufle edilmiş ve akıllı web scraping işlemleri için kullanıldı.
- **[Playwright](https://playwright.dev/python/):** Dinamik sayfa yüklemeleri (Google Maps) için Scrapling'in altında çalıştırıldı.
- **[OpenAI API (Local / LM Studio) ](https://lmstudio.ai/):** Localhost üzerinden koşan yapay zeka entegrasyonu.

### Frontend (React / Vite)
- **[React.js](https://react.dev/) + [Vite](https://vitejs.dev/):** Hızlı modern ön yüz mimarisi.
- **[Tailwind CSS](https://tailwindcss.com/):** Siberpunk temalı (neon mavi, pembe ve karanlık gri tonlar) UI tasarımı.
- **[Lucide React](https://lucide.dev/):** Vektörel minimal ikonlar.

## ⚙️ Kurulum ve Çalıştırma

### Gereksinimler
- Node.js (v18+)
- Python (3.10+)
- **LM Studio** (Yapay zeka özellikleri için `http://localhost:1234/v1` adresinde çalışıyor olmalıdır)

### 1. Kurulum Komutları

**Otomatik Kurulum (Önerilen):**
Proje kök dizininde bulunan **`install.bat`** dosyasına tıklayarak tüm Python ve Node.js bağımlılıklarını tek tıkla otomatik olarak kurabilirsiniz.

**Manuel Kurulum:**
Backend gereksinimlerini kurmak için:
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
playwright install
```

Frontend bağımlılıklarını kurmak için:
```bash
cd frontend
npm install
```

### 2. Projeyi Başlatma
Projenin kök dizininde bulunan **`start_project.bat`** dosyasına tıklayarak projeyi tek tıkla çalıştırabilirsiniz.
Alternatif olarak manuel çalıştırmak isterseniz:

**Backend'i başlatmak için:**
```bash
cd backend
uvicorn main:app --reload --port 8080
```

**Frontend'i başlatmak için:**
```bash
cd frontend
npm run dev
```

Ardından tarayıcınızdan `http://localhost:5173/` (Vite varsayılan portu) adresine giderek uygulamaya erişebilirsiniz.

## 💡 Kullanım Akışı
1. LM Studio'yu açın ve yerel bir modeli `Server` (Local Inference Server) modunda çalıştırın.
2. Uygulamaya girip sol menüden **The Harvester** sekmesini açın.
3. Aradığınız anahtar kelimeyi (örn. "cafe", "diş kliniği") ve lokasyonu (örn. "Kadıköy") yazıp işlemi başlatın.
4. Çıkan logları izleyin. İşlem tamamlandıktan sonra sol menüden **Komuta Merkezi** sekmesine geçin.
5. Oluşturulan son raporu açın ve hedef işletmelerinizi görüntüleyin.
6. İşletme kartları üzerindeki butonlarla "Satış Metni Oluştur" veya "Deep Crawl" operasyonlarını başlatın.

---
*Geliştirilmiş ve tasarlanmış olan bu proje **Arch/C Studio** vizyonuyla hayata geçirilmiştir.*
