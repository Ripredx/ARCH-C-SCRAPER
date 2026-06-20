# ARCH/C STUDIO - LOGO ANAYASASI

Bu belge, Arch/C Studio markasının kalbinde yer alan tipografik logonun hiçbir şekilde bozulmaması gereken temel yapı taşlarını, CSS matematiğini ve kavramsal analizini içeren resmi tasarım kılavuzudur (Design Constitution).

---

## 1. TEMEL KURALLAR (DEĞİŞTİRİLEMEZ)

1. **İmaj Dosyası Kullanılmaz:** Logo her zaman DOM (HTML) üzerinde tipografik elemanlarla oluşturulur. Bu, hover animasyonlarının çalışması ve sayfa yüklenme (LCP) hızının maksimumda tutulması için kritiktir.
2. **Font İkilisi Sabittir:** Ana marka ismi (`<Arch/C>`) **Outfit** fontuyla, alt unvan (`STUDIO`) ise **JetBrains Mono** fontuyla yazılır.
3. **Zıtlık (Kontrast) Prensibi:** Üst satır ne kadar kalın, dar ve bitişikse; alt satır o kadar ince, küçük ve birbirinden uzak (açık aralıklı) olmalıdır.

---

## 2. KOD VE MATEMATİK: NAVBAR & FOOTER (Standart Ölçek)

Standart menü veya footer alanlarında kullanılan logonun tipografik ve CSS özellikleri:

### `<Arch/C>` Seksiyonu
- **Font Ailesi:** `Outfit` (var(--font-display))
- **Ağırlık:** `600` (Semibold)
- **Harf Aralığı (Tracking):** `-0.05em` (tracking-tighter)
- **Satır Yüksekliği (Leading):** `1` (leading-none)
- **Boyut (Size):** Masaüstünde `1.875rem` (30px), mobilde `1.5rem` (24px)
- **Hover Etkileşimi:** 500ms içinde `--accent-electric` rengine yumuşak geçiş.

### `STUDIO` Seksiyonu
- **Font Ailesi:** `JetBrains Mono` (var(--font-mono))
- **Ağırlık:** `400` (Regular)
- **Harf Aralığı (Tracking):** `0.4em` (Aşırı açık)
- **Metin Dönüşümü:** `uppercase`
- **Boyut (Size):** `0.6rem` (Ortalama 9-10px)
- **Renk:** `%70` Opaklıkta Beyaz (`text-white/70`)

---

## 3. KOD VE MATEMATİK: PRELOADER (Dev Ölçek)

Açılış ekranında kullanıcıyı karşılayan devasa logonun dinamik (viewport-based) tipografik özellikleri:

### `<Arch/C>` Seksiyonu
- **Font Ağırlığı:** `600` (Semibold)
- **Boyut (Size):** `clamp(2rem, 10vw, 10rem)` (Mobilde min 32px, ekrana göre dinamik büyüme, maks 160px)
- **Harf Aralığı:** `-0.05em`
- **Renk:** `#FFFFFF` (Tam beyaz)

### `STUDIO` Seksiyonu
- **Font Ağırlığı:** `400` (Regular)
- **Boyut (Size):** `clamp(1.2rem, 4vw, 2.5rem)` (Mobilde min 19px, ekrana göre dinamik büyüme, maks 40px)
- **Harf Aralığı:** `0.4em`
- **Renk:** `%80` Opaklıkta Beyaz (`text-white/80`)

---

## 4. KAVRAMSAL ANALİZ VE GÖSTERGEBİLİM (SEMIOTICS)

Logo, minimal bir yapıda dahi birçok alt mesaj barındıracak şekilde tasarlanmıştır:

1. **Tag Yapısı `< >` (Syntax Cues):** 
   Kelimenin HTML/XML etiketleri arasına alınması, stüdyonun temel üretim aracının "kod" olduğunu doğrudan hissettirir. Sadece tasarlayan değil, yazan (kodlayan) bir mühendislik ekibi mesajı verir.

2. **İsimlendirme (Arch / C):**
   - **Arch (Architecture):** Mimarinin sadece inşaat sektörüne ait olmadığını, yazılım mimarisini, sağlam temelleri ve sistem tasarımlarını temsil eder.
   - **C (Code / Cyber / Computation):** Teknolojinin ve bilgisayar biliminin köklerine inen bir harftir. "Arch/C" birleşimi, sistemin mimarisi anlamına gelir. Eğik çizgi (`/`) terminal ve dizin (path) mantığına bir göndermedir.

3. **Zıtlıkların Uyumu:**
   Üstte kalın, dar aralıklı, monolitik bir ana isim (Arch/C); altta ise incecik, çok geniş aralıklı, endüstriyel monospace fontla yazılmış (STUDIO) kelimesi. Bu kontrast; hem "Estetik/Tasarım" kavramını hem de "Analitik/Mühendislik" yaklaşımını tek bir mühürde birleştirir. Brutalist ancak son derece rafine bir görsellik sunar.
