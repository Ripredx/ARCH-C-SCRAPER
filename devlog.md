# Arch/C Scraping Engine - DevLog

Tarih: 2026-06-20 / 2026-06-21
Geliştirici: Antigravity AI & User

## Proje Gelişimi ve UI/UX İyileştirmeleri

Sistemin arayüzü (The Forge ve genel yapı), standart ve statik web sayfalarından, profesyonel bir Geliştirme Ortamı (IDE) standartlarına yükseltildi.

**Neler Yapıldı?**
- **Sürükle & Bırak Paneller (`react-resizable-panels`)**: Ekrandaki modüllerin boyutları kullanıcı tarafından isteğe göre esnetilebilir hale getirildi. 
- **Katlanabilir Navigasyon (`lucide-react`)**: Sol taraftaki ana menü katlanabilir yapıya geçirilerek, çalışma alanındaki yatay genişlik maksimize edildi.
- **Sekmeli Çalışma Alanı (Tabbed Navigation)**: The Forge ekranında yer alan JSON veri önizleme ve Terminal logları sekmeli bir yapıya geçirilerek dikey boşluklardan tasarruf edildi. Rapor ekranının genişlemesine olanak tanındı.
- **Esnek Dosya Gezgini**: Sol taraftaki dosya gezgininin daraltılabilme limiti (minSize) düşürülerek, dosyalar seçildikten sonra panelin tamamen sola itilebilmesine olanak sağlandı.
- **Akıllı Site Doğrulama ve Sınıflandırma (Yeni!)**: The Harvester topladığı bağlantıları doğrudan kabul etmek yerine arka planda `httpx` kullanarak eşzamanlı (asenkron) "ping" atacak şekilde geliştirildi. Raporlar artık 4 ana grupta oluşturuluyor:
  - Aktif Web Sitesi Olanlar
  - Sosyal Medya Kullanıcıları (Instagram, Facebook vb. tespiti)
  - Hiç Linki Olmayanlar
  - Kalıcı Kapalı / Ölü Linkler (Veritabanından ve rapordan anında temizlenir)
- **Haritada Sahipsiz İşletme Tespiti**: İşletmenin Google Benim İşletmem hesabının sahiplenip sahiplenilmediği ("Bu işletmeyi sahiplenin" butonu) algılanıp, ajanslar için "Google Maps Hizmeti Satış" fırsatı olarak rapora "⚠️ Haritada Sahipsiz" rozeti eklendi.
- **Tek Tıkla WhatsApp İletişimi**: Cep telefonu numarasına benzeyen numaralar (05xx vb.) sistem tarafından tespit edilerek HTML rapora doğrudan "📱 WhatsApp'tan Mesaj At" linki eklendi.
- **Temiz Raporlama (Ham Veri Temizliği)**: Deep Crawl işlemleri sonrası oluşan ve okunması zor olan ham JSON dosyaları kullanıcının isteği üzerine sistemden tamamen kaldırıldı. Sadece okunabilir, renkli ve zengin HTML raporlar saklanıp ön yüze sunuluyor.
- **Açılır/Kapanır (Accordion) HTML Raporlar**: Raporlarda oluşan veri karmaşasını önlemek için HTML raporları içerisindeki firma listesi kategorileri (Sitesi Kapalı, Hiç Linki Olmayanlar vb.) `<details>` ve `<summary>` etiketleri ile katlanabilir (collapsible) yapıya geçirildi ve CSS animasyonları eklendi.
- **Güvenli Link Yönlendirmesi (Yeni Sekmede Açma)**: Arayüzden tıklanan her web sitesi, Haritalar ve WhatsApp bağlantısının otomatik olarak yeni sekmede açılması sağlandı. Frontend güvenlik katmanı (DOMPurify) bu etiketlere izin verecek şekilde yapılandırıldı.
- **Görsel Optimizasyonu**: Otomatik üretilen WhatsApp ikonunun esneyerek sayfa düzenini bozmasını engellemek için SVG boyutlandırmalarına kısıtlamalar getirildi.

---

## Karşılaşılan Hatalar ve Çözümleri

### 1. JSON Parse Hatası: "AttributeError: 'str' object has no attribute 'get'"
- **Sorun**: Python veriyi okurken `item.get("website")` çağrısında çöktü. `raw_data` doğrudan bir sözlük (dictionary) döndürüyordu, ve biz ana döngüyü en dıştaki katmandan başlatmıştık (source, keyword gibi meta veriler).
- **Çözüm**: JSON'ın veri katmanına inilmesi gerekiyordu. `business_list = raw_data.get("results", [])` yazılarak doğru anahtar `results` dizisine odaklanıldı ve döngü bu liste üzerinde çalıştırılarak düzeltildi.

### 2. AsyncOpenAI Çakışması: Uvicorn Proxy Error
- **Sorun**: `forge.py` içerisindeki OpenAI modülü başlatılırken eski bir asenkron çağrı (proxies) yöntemi kullanılıyordu. Bu durum backend'in başlatılamamasına sebep oldu.
- **Çözüm**: Stratejik bir kararla, the Forge ekranında web sitesi olan ve olmayanları ayırmak için yapay zekaya ihtiyaç olmadığına kanaat getirdik (Maliyet ve Hız). Saf Python (Pure Python) ile mili-saniyeler içinde bu ayrımın yapılmasına geçildi. `AsyncOpenAI` modülü `forge.py` içerisinden tamamen silinerek bu hata kökünden çözüldü.

### 3. Syntax-Highlighter Kütüphane Yükleme Hatası (ENOENT)
- **Sorun**: Vite derleyicisi (Frontend), JSON renklendirme için kullandığımız `react-syntax-highlighter` kütüphanesini bulamıyordu, çünkü node_modules altında eksik inmişti.
- **Çözüm**: Terminal (Powershell) üzerinden npm önbelleği temizlendi ve `npm install react-syntax-highlighter --save` ile kütüphane temiz ve baştan yüklendi.

### 4. Beyaz Ekran Hatası (White Screen of Death) & Yanlış Kütüphane Sürümü
- **Sorun**: Arayüz kodlarında sürükle-bırak paneller için `<PanelGroup>` eklendi. Ancak Vite çalıştığında ekrana bembeyaz bir boşluk geldi. Yapılan analizde, NPM'in `react-resizable-panels` kütüphanesinin çok farklı/alakasız bir sürümünü (4.11.2) indirdiği tespit edildi. Kütüphane aradığımız modülleri barındırmıyordu.
- **Çözüm**: Gerekli kütüphanenin doğru ve globalde en çok kullanılan stabil sürümü (`v2.1.7`) tespit edildi. `npm install react-resizable-panels@2.1.7` komutuyla doğru modül zorla yüklenerek uygulamanın tekrar render edilebilmesi sağlandı ve beyaz ekran sorunu aşıldı. Ayrıca kullanılmayan `React` importları koddaki gereksiz uyarıları engellemek için temizlendi.

### 5. OpenAI ve HTTPX Sürüm Çakışması (Proxies Hatası)
- **Sorun**: `TypeError: Client.__init__() got an unexpected keyword argument 'proxies'` hatası alındı. Backend'de `scrapling` kütüphanesini kurduğumuzda, o kütüphane HTTP istekleri için kullandığı `httpx` paketinin en son sürümünü (0.28.1) kurdu. Ancak sistemdeki `openai` (v1.35.3) sürümü eski olduğu için, artık var olmayan `proxies` adında bir ayar kullanmaya çalışıp backend'in tamamen çökmesine sebep oldu.
- **Çözüm**: Arka planda terminal kullanılarak `pip install --upgrade openai` komutuyla OpenAI kütüphanesi en güncel haline (v2.x) yükseltildi ve `httpx` ile olan sözdizimi uyumsuzluğu kökünden çözüldü.

### 6. Deep Crawl'da Sayfa Yükleme Hatası: `NS_ERROR_UNKNOWN_HOST`
- **Sorun**: Playwright (Camoufox) çökmüş veya alan adı kullanım dışı kalmış bir web sitesine bağlanmaya çalıştığında `NS_ERROR_UNKNOWN_HOST` hatası veriyor ve sayfa DOM yüklemesini sonsuza kadar bekliyordu.
- **Çözüm**: İşlemleri hızlandırmak ve gereksiz hata yığınlarını önlemek için the Harvester (`scraper.py`) aşamasına asenkron bir `httpx` doğrulayıcısı ekledik. Playwright ile bağlanmadan saniyeler önce `httpx` ile siteye hızlı bir "ping" atılıp sitenin aktif olup olmadığı (4xx/5xx veya Timeout hataları) doğrulandı.

### 7. Uvicorn Çoklu İşlem Çökmesi (Multiprocessing Crash)
- **Sorun**: Deep Crawl veya büyük kazıma işlemleri esnasında eşzamanlı (async) thread yönetiminde `uvicorn` `_subprocess.py` üzerinden çökmeler yaşıyordu (Traceback: SpawnProcess-4).
- **Çözüm**: Playwright/Camoufox ile yapılan web kazıma işlemleri ana event loop'tan tamamen izole edilerek asenkron thread mantığına (`asyncio.to_thread`) taşındı. Ayrıca `Camoufox` tarayıcısının kapanırken bellek sızıntısı yapmaması için try/finally blokları ve `gc.collect()` gibi manuel çöp toplayıcı destekleriyle stabil hale getirildi.

### 8. Deep Crawl Raporları 404 Not Found Hatası
- **Sorun**: Rapor URL'si backend'den (FastAPI) frontend'e stream edilirken f-string içerisinde `\\n` şeklinde literal olarak (slash ve n harfi) gönderilmiş. Bu sebeple Frontend URL'nin sonuna satır sonunu metin olarak (`...html\nDONE`) eklemiş ve raporlar bulunamamış.
- **Çözüm**: Backend kodu içerisindeki literal `\\n` kaçış karakterleri normal satır sonu olan `\n` ile değiştirilip düzeltildi.

### 9. Frontend Linklerinin Yeni Sekmede Açılmaması (DOMPurify Engeli)
- **Sorun**: Tüm `a href` etiketlerine `target="_blank"` konulmasına rağmen React tarafında linkler yeni sekmede açılmıyordu.
- **Çözüm**: Güvenlik katmanı olan `DOMPurify`'ın varsayılan olarak `target` etiketini sildiği (tab-nabbing saldırısına karşı) fark edildi. Sanitizer ayarlarına `{ ADD_ATTR: ['target'] }` kuralı eklenerek sorun çözüldü.
