# Arch/C Scraping Engine - DevLog

Tarih: 2026-06-20
Geliştirici: Antigravity AI & User

## Proje Gelişimi ve UI/UX İyileştirmeleri

Sistemin arayüzü (The Forge ve genel yapı), standart ve statik web sayfalarından, profesyonel bir Geliştirme Ortamı (IDE) standartlarına yükseltildi. 

**Neler Yapıldı?**
- **Sürükle & Bırak Paneller (`react-resizable-panels`)**: Ekrandaki modüllerin boyutları kullanıcı tarafından isteğe göre esnetilebilir hale getirildi. 
- **Katlanabilir Navigasyon (`lucide-react`)**: Sol taraftaki ana menü katlanabilir yapıya geçirilerek, çalışma alanındaki yatay genişlik maksimize edildi.
- **Sekmeli Çalışma Alanı (Tabbed Navigation)**: The Forge ekranında yer alan JSON veri önizleme ve Terminal logları sekmeli bir yapıya geçirilerek dikey boşluklardan tasarruf edildi. Rapor ekranının genişlemesine olanak tanındı.
- **Esnek Dosya Gezgini**: Sol taraftaki dosya gezgininin daraltılabilme limiti (minSize) düşürülerek, dosyalar seçildikten sonra panelin tamamen sola itilebilmesine olanak sağlandı.

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
