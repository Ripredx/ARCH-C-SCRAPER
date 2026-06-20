# Arch/C Scraper Studio

**Arch/C Scraper Studio**, işletme verilerini (özellikle Google Maps üzerinden) otomatik olarak toplayan, temizleyen ve yerel bir Yapay Zeka (LLM) modeli kullanarak bu verileri analiz edip satış metinleri (cold pitch) veya derinlemesine analiz raporları oluşturmanızı sağlayan siberpunk temalı, tam teşekküllü bir araçtır.

![Arch/C Studio](frontend/src/assets/hero.png) <!-- Hero görseliniz varsa burası için placeholder -->

## 🚀 Özellikler

- **The Harvester (Veri Toplayıcı):** Google Maps üzerinden anahtar kelime, lokasyon ve limit belirleyerek işletme verilerini çeker (Telefon, Adres, Web Sitesi vb.).
- **Otomatik Veri Rafinerisi:** Çekilen ham verileri otomatik olarak işler ve analiz edilmesi kolay HTML Grid kartlarına dönüştürür.
- **Komuta Merkezi (Command Center):** Elde edilen verileri siberpunk tasarımlı karanlık bir arayüzde listeler. İşletmeleri "Web sitesi olanlar (SEO/Rakip Fırsatı)" ve "Web sitesi olmayanlar (Sıcak Satış Fırsatı)" olarak sınıflandırır.
- **Deep Crawl (Derin Kazı):** Web sitesi olan işletmelerin sitelerine `Scrapling` ile girerek detaylı içerik taraması yapar ve ham veriyi kaydeder.
- **Yapay Zeka Entegrasyonu:** İşletme verilerini ve Deep Crawl sonuçlarını **LM Studio** (Yerel çalışan modeller) üzerinden geçirerek saniyeler içinde doğrudan müşteriye gönderilebilecek kişiselleştirilmiş satış metinleri (Pitch) üretir.
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

Backend gereksinimlerini kurmak için:
```bash
cd backend
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
