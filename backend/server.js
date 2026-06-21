require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const expressWs = require('express-ws');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const OpenAI = require('openai');

const app = express();
expressWs(app); // Enable WebSockets

app.use(cors());
app.use(express.json());

// Veri klasörleri oluşturma
const dataDir = path.join(__dirname, 'data');
const dirs = ['google_maps', 'deep_crawl', 'reports'];
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
dirs.forEach(d => {
  const p = path.join(dataDir, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p);
});

app.use('/static', express.static(dataDir));

// OpenAI LM Studio Ayarları
const openai = new OpenAI({
  baseURL: 'http://localhost:1234/v1',
  apiKey: 'lm-studio',
});

// WebSocket Clients
const clients = new Set();
app.ws('/api/harvester/logs', (ws, req) => {
  clients.add(ws);
  ws.send('> Node.js Scrapling Engine Connected.');
  ws.on('close', () => clients.delete(ws));
});

const sendLog = (msg) => {
  for (let client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
};

// 1. HARVESTER (Scraping)
app.post('/api/harvester/start', async (req, res) => {
  const { keywords, location, source, limit, isVisible } = req.body;
  sendLog(`> JS Motoru Başlatıldı. Hedef: ${source}`);
  sendLog(`> Aranıyor: ${keywords} in ${location}`);
  
  let browser;
  try {
    sendLog('> Tarayıcı (Playwright) açılıyor...');
    browser = await chromium.launch({ headless: !isVisible });
    const page = await browser.newPage();
    
    sendLog('> Google Haritalar yükleniyor...');
    const query = encodeURIComponent(`${keywords} ${location}`);
    await page.goto(`https://www.google.com/maps/search/${query}`, { waitUntil: 'domcontentloaded' });
    
    sendLog('> İşletmeler aranıyor... Bu işlem limitinize göre biraz sürebilir.');
    
    await page.waitForTimeout(4000);
    
    const results = [];
    let elements = await page.locator('a[href*="/maps/place/"]').all();
    let previousCount = 0;
    let retries = 0;
    
    // Limite ulaşana kadar sol paneli aşağı kaydır (Auto-scroll)
    while (elements.length < limit && retries < 3) {
      previousCount = elements.length;
      sendLog(`> Daha fazla sonuç yükleniyor... (${elements.length} / ${limit})`);
      
      try {
        // Son elemana odaklan ve çeşitli yöntemlerle aşağı kaydır
        await elements[elements.length - 1].hover();
        await page.mouse.wheel(0, 5000);
        await elements[elements.length - 1].focus();
        await page.keyboard.press('PageDown');
        
        // Yeni sonuçların HTML'e yüklenmesini dinamik olarak bekle
        await page.waitForFunction((prevCount) => {
          return document.querySelectorAll('a[href*="/maps/place/"]').length > prevCount;
        }, previousCount, { timeout: 3000 });
        
        retries = 0; // Yeni eleman geldiyse sayacı sıfırla
      } catch (e) {
        retries++; // 3 saniye içinde yeni eleman gelmediyse sayacı artır (Listenin sonu olabilir)
      }
      
      elements = await page.locator('a[href*="/maps/place/"]').all();
    }
    
    const count = Math.min(elements.length, limit || 5);
    
    if (count === 0) {
      sendLog('> HATA: Google Haritalar arama sonucu bulamadı.');
    } else {
      for (let i = 0; i < count; i++) {
        try {
          const href = await elements[i].getAttribute('href');
          const name = await elements[i].getAttribute('aria-label');
          sendLog(`> İşleniyor (${i+1}/${count}): ${name || 'İşletme'}`);
          
          await elements[i].click();
          await page.waitForTimeout(2000); 
          
          const phone = await page.evaluate(() => {
            const btn = document.querySelector('button[data-item-id^="phone:"]');
            if (!btn) return 'Bulunamadı';
            const parts = btn.innerText.split('\n');
            return parts[parts.length - 1].trim();
          }).catch(() => 'Bulunamadı');
          
          const website = await page.evaluate(() => {
            const btn = document.querySelector('a[data-item-id="authority"]');
            return btn ? btn.href : 'Bulunamadı';
          }).catch(() => 'Bulunamadı');
          
          const addressText = await page.evaluate(() => {
            const btn = document.querySelector('button[data-item-id="address"]');
            if (!btn) return location;
            const parts = btn.innerText.split('\n');
            return parts[parts.length - 1].trim();
          }).catch(() => location);

          results.push({
            name: name || `İşletme ${i+1}`,
            phone: phone,
            address: addressText,
            website: website,
            url: href
          });
        } catch (err) {
          sendLog(`> Atlandı (${i+1}): Veri okunamadı.`);
        }
      }
    }
    
    const safeKeywords = (keywords || 'genel').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const safeLocation = (location || 'veri').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${safeKeywords}_${safeLocation}_${Date.now()}.json`;
    
    fs.writeFileSync(path.join(dataDir, 'google_maps', filename), JSON.stringify(results, null, 2));
    
    sendLog(`> Başarılı! ${results.length} işletme bulundu.`);
    res.json({ success: true });
  } catch (err) {
    sendLog(`> HATA: ${err.message}`);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// 2. REFINERY (Data Management)
app.get('/api/forge/all-files', (req, res) => {
  const categories = { harvester_raw: [], deep_crawl_reports: [], llm_reports: [] };
  if (fs.existsSync(path.join(dataDir, 'google_maps'))) categories.harvester_raw = fs.readdirSync(path.join(dataDir, 'google_maps'));
  if (fs.existsSync(path.join(dataDir, 'deep_crawl'))) categories.deep_crawl_reports = fs.readdirSync(path.join(dataDir, 'deep_crawl'));
  if (fs.existsSync(path.join(dataDir, 'reports'))) categories.llm_reports = fs.readdirSync(path.join(dataDir, 'reports'));
  res.json(categories);
});

app.get('/api/forge/content/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const dirMap = { 'harvester_raw': 'google_maps', 'deep_crawl_reports': 'deep_crawl', 'llm_reports': 'reports' };
  const realDir = dirMap[category] || category;
  const p = path.join(dataDir, realDir, filename);
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf8');
    res.json({ content: JSON.parse(content) });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.delete('/api/forge/content/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const dirMap = { 'harvester_raw': 'google_maps', 'deep_crawl_reports': 'deep_crawl', 'llm_reports': 'reports' };
  const realDir = dirMap[category] || category;
  const p = path.join(dataDir, realDir, filename);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Delete all files
app.delete('/api/forge/delete-all', (req, res) => {
  const dirs = ['google_maps', 'deep_crawl', 'reports'];
  try {
    let deletedCount = 0;
    for (const d of dirs) {
      const p = path.join(dataDir, d);
      if (fs.existsSync(p)) {
        for (const file of fs.readdirSync(p)) {
          if (file !== '.gitkeep') {
            fs.unlinkSync(path.join(p, file));
            deletedCount++;
          }
        }
      }
    }
    res.json({ success: true, count: deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. AI ANALYZE
app.post('/api/forge/analyze', async (req, res) => {
  const { filename, provider, apiKey } = req.body;
  try {
    const content = fs.readFileSync(path.join(dataDir, 'google_maps', filename), 'utf8');
    
    let clientOptions = { baseURL: 'http://localhost:1234/v1', apiKey: 'lm-studio' };
    let modelName = 'local-model';

    if (provider === 'grok') {
      const finalKey = apiKey || process.env.GROK_API_KEY;
      if (!finalKey) throw new Error('Grok API anahtarı bulunamadı! Lütfen arayüzden girin veya kaydedin.');
      clientOptions = { baseURL: 'https://api.x.ai/v1', apiKey: finalKey };
      modelName = 'grok-4.20-0309-non-reasoning'; // Kullanicinin metin/yorum odakli stratejik secimi
    } else if (provider === 'openai') {
      const finalKey = apiKey || process.env.OPENAI_API_KEY;
      if (!finalKey) throw new Error('OpenAI API anahtarı bulunamadı! Lütfen arayüzden girin veya kaydedin.');
      clientOptions = { apiKey: finalKey }; 
      modelName = 'gpt-4o-mini';
    }

    const aiClient = new OpenAI(clientOptions);

    const completion = await aiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: "Sen bir veri analiz uzmanısın. Aşağıdaki ham JSON verisini incele. Çıktıyı KESİNLİKLE sadece JSON formatında ver. JSON formatı şu şekilde olmalı:\n{\n  \"summary\": \"Sektördeki işletmelerin genel durumu hakkında 2-3 cümlelik yönetici özeti.\",\n  \"businesses\": [\n    { \"name\": \"Firma Adı\", \"phone\": \"Telefon veya Bulunamadı\", \"address\": \"Adres\", \"website\": \"Web Sitesi veya Bulunamadı\" }\n  ]\n}\nSadece geçerli bir JSON döndür, kod bloğu (```json) kullanma, fazladan açıklama yazma." },
        { role: "user", content: `Veri: ${content}` }
      ],
    });
    
    // Parse LLM output
    let aiResponse = completion.choices[0].message.content;
    const match = aiResponse.match(/```json([\s\S]*?)```/i) || aiResponse.match(/```([\s\S]*?)```/i);
    if (match && match[1]) {
      aiResponse = match[1].trim();
    }
    
    let parsedData;
    try {
      parsedData = JSON.parse(aiResponse);
    } catch (e) {
      // Fallback if AI fails to return proper JSON
      parsedData = {
        summary: "Yapay zeka analiz sonucu düzgün alınamadı. Orijinal veri kullanılıyor.",
        businesses: JSON.parse(content)
      };
    }

    // Calculate Metrics
    const rawBusinesses = JSON.parse(content);
    const totalBusinesses = parsedData.businesses.length;
    const webCount = parsedData.businesses.filter(b => b.website && b.website !== 'Bulunamadı' && b.website !== '').length;
    const phonePercent = totalBusinesses > 0 ? Math.round((parsedData.businesses.filter(b => b.phone && b.phone !== 'Bulunamadı').length / totalBusinesses) * 100) + '%' : '0%';
    
    let totalRating = 0;
    let ratingCount = 0;
    for (const raw of rawBusinesses) {
      if (raw.rating) {
        totalRating += parseFloat(raw.rating);
        ratingCount++;
      }
    }
    const averageRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : 'Yok';
    
    // Remove .json, remove timestamps (_1234567890123), replace underscores with spaces, capitalize words
    const cleanName = filename.replace('.json', '').replace(/_\d{13}$/, '').replace(/[-_]/g, ' ');
    const reportTitle = cleanName.replace(/\b\w/g, c => c.toUpperCase()) || 'Genel Analiz';

    // Build Table Rows
    let tableRowsHtml = '';
    for (const b of parsedData.businesses) {
      const phoneText = b.phone && b.phone !== 'Bulunamadı' ? `<span class="text-[#00FF88] font-mono text-xs">${b.phone}</span>` : `<span class="text-gray-600 italic text-xs">Bulunamadı</span>`;
      
      const hasWeb = b.website && b.website !== 'Bulunamadı' && b.website !== '';
      const webText = hasWeb ? `<a href="${b.website}" target="_blank" class="text-[#04D9FF] hover:underline text-xs break-all">${b.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>` : `<span class="text-red-500/70 bg-red-500/10 px-2 py-1 rounded text-xs font-medium">Web Sitesi Bulunamadı</span>`;

      tableRowsHtml += `
        <tr class="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors group">
          <td class="px-6 py-4 font-bold text-gray-200 text-xs">${b.name || 'Bilinmeyen Firma'}</td>
          <td class="px-6 py-4 whitespace-nowrap">${phoneText}</td>
          <td class="px-6 py-4 text-xs text-gray-500 max-w-[200px] truncate" title="${b.address || ''}">${b.address || '-'}</td>
          <td class="px-6 py-4 max-w-[200px]">${webText}</td>
          <td class="px-6 py-4 text-right">
            <button data-action="deep-crawl" data-name="${b.name}" data-url="${b.website || ''}" class="inline-flex items-center gap-2 bg-transparent hover:bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/30 px-4 py-2 rounded text-xs font-semibold transition-all shadow-[0_0_10px_rgba(0,255,136,0.05)] hover:shadow-[0_0_15px_rgba(0,255,136,0.2)]">
              <i class="fa-solid fa-magnifying-glass"></i> Derin Tarama
            </button>
          </td>
        </tr>
      `;
    }

    const injectionScript = `
<script>
  document.addEventListener('click', function(e) {
    let btn = e.target.closest('[data-action="deep-crawl"]');
    if (btn) {
      e.preventDefault();
      const urlEl = btn.getAttribute('data-url');
      const nameEl = btn.getAttribute('data-name');
      
      window.parent.postMessage({ 
        type: 'DEEP_CRAWL', 
        url: urlEl && urlEl !== 'Bulunamadı' && urlEl !== '' ? urlEl : 'Bulunamadı', 
        company_name: nameEl 
      }, '*');
      
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Başlatıldı...';
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    }
  });
</script>
`;

    let htmlReport = `
<!DOCTYPE html>
<html lang="tr" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Genel Analiz Raporu</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { background-color: #050505; color: #e5e5e5; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
    /* Özel scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #0a0a0a; }
    ::-webkit-scrollbar-thumb { background: #222; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #333; }
  </style>
</head>
<body class="p-4 md:p-8">
  <div class="max-w-7xl mx-auto">
    
    <!-- HEADER -->
    <div class="flex flex-col items-center justify-center mb-10 mt-4">
      <div class="w-12 h-12 bg-[#00FF88]/10 rounded-full flex items-center justify-center mb-5 border border-[#00FF88]/20 shadow-[0_0_20px_rgba(0,255,136,0.15)]">
        <i class="fa-solid fa-chart-simple text-xl text-[#00FF88]"></i>
      </div>
      <h1 class="text-3xl md:text-4xl font-bold text-white mb-3 text-center tracking-tight">${reportTitle} Raporu</h1>
      <p class="text-gray-500 text-sm font-medium tracking-wide">${totalBusinesses} işletme • Güncellenme: ${new Date().getFullYear()}</p>
    </div>

    <!-- STATS -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10 border-b border-gray-800/50 pb-10">
      <div class="bg-[#0a0a0a] border border-gray-800/80 rounded-xl p-6 relative overflow-hidden transition-colors hover:border-gray-700">
        <h2 class="text-3xl font-bold text-[#00FF88] mb-2">${totalBusinesses}</h2>
        <p class="text-[10px] text-gray-500 font-bold tracking-widest uppercase">TOPLAM İŞLETME</p>
      </div>
      <div class="bg-[#0a0a0a] border border-gray-800/80 rounded-xl p-6 relative overflow-hidden transition-colors hover:border-gray-700">
        <h2 class="text-3xl font-bold text-[#00FF88] mb-2">${webCount}</h2>
        <p class="text-[10px] text-gray-500 font-bold tracking-widest uppercase">WEB SİTESİ / SOSYAL MEDYA</p>
      </div>
      <div class="bg-[#0a0a0a] border border-gray-800/80 rounded-xl p-6 relative overflow-hidden transition-colors hover:border-gray-700">
        <h2 class="text-3xl font-bold text-[#00FF88] mb-2">${phonePercent}</h2>
        <p class="text-[10px] text-gray-500 font-bold tracking-widest uppercase">TELEFON BİLGİSİ MEVCUT</p>
      </div>
      <div class="bg-[#0a0a0a] border border-gray-800/80 rounded-xl p-6 relative overflow-hidden transition-colors hover:border-gray-700">
        <h2 class="text-3xl font-bold text-[#00FF88] mb-2">${averageRating}</h2>
        <p class="text-[10px] text-gray-500 font-bold tracking-widest uppercase">ORTALAMA PUAN (GOOGLE)</p>
      </div>
    </div>

    <!-- AI SUMMARY -->
    <div class="mb-12">
      <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-3">
        <i class="fa-solid fa-chart-pie text-[#04D9FF]"></i> Pazar Analizi Raporu
      </h2>
      <div class="border-l-[3px] border-[#04D9FF] pl-5 py-2 bg-gradient-to-r from-[#04D9FF]/5 to-transparent">
        <p class="text-gray-400 text-sm leading-relaxed italic font-medium">
          ${parsedData.summary || 'Bu rapor yapay zeka analizinden geçirilerek oluşturulmuştur.'}
        </p>
      </div>
    </div>

    <!-- TABLE SECTION -->
    <div class="flex flex-col md:flex-row md:items-center gap-4 mb-4 justify-between">
      <div class="flex items-center gap-3">
        <h3 class="text-lg font-bold text-white">İşletme Listesi</h3>
        <span class="bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase">Derin Analiz Hazır</span>
      </div>
    </div>

    <div class="bg-[#0a0a0a] border border-gray-800/80 rounded-xl overflow-hidden mb-12 shadow-xl">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-gray-400">
          <thead class="text-[10px] uppercase bg-[#111] border-b border-gray-800 text-gray-500 font-bold tracking-wider">
            <tr>
              <th scope="col" class="px-6 py-4">İŞLETME ADI</th>
              <th scope="col" class="px-6 py-4">TELEFON</th>
              <th scope="col" class="px-6 py-4">ADRES</th>
              <th scope="col" class="px-6 py-4">WEBSİTE / SOSYAL</th>
              <th scope="col" class="px-6 py-4 text-right">İŞLEMLER</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800/50">
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
    </div>

  </div>
  ${injectionScript}
</body>
</html>
`;

    const reportFileName = cleanName.replace(/ /g, '_');
    const reportName = `${reportFileName}_raporu_${Date.now()}.html`;
    fs.writeFileSync(path.join(dataDir, 'reports', reportName), htmlReport);
    
    res.json({ log: `> Yapay zeka analizi (${(provider || 'lmstudio').toUpperCase()}) tamamlandı ve rapor şablonu oluşturuldu.` });
  } catch (err) {
    res.status(500).json({ log: `> Yapay zeka hatası: ${err.message}` });
  }
});

// 4. COMMAND CENTER
app.get('/api/forge/reports', (req, res) => {
  const reportsDir = path.join(dataDir, 'reports');
  const files = fs.existsSync(reportsDir) ? fs.readdirSync(reportsDir).filter(f => f.endsWith('.html')) : [];
  res.json({ reports: files });
});

app.get('/api/forge/report/:filename', (req, res) => {
  const file = path.join(dataDir, 'reports', req.params.filename + '.html');
  if (fs.existsSync(file)) {
    res.json({ exists: true, html: fs.readFileSync(file, 'utf8') });
  } else {
    res.json({ exists: false });
  }
});

app.post('/api/forge/generate-pitch', async (req, res) => {
  const { company_name, industry } = req.body;
  try {
    const completion = await openai.chat.completions.create({
      model: "local-model",
      messages: [
        { role: "system", content: "Sen yetenekli bir satış uzmanısın. Bize verilen şirket için etkili bir soğuk e-posta yaz." },
        { role: "user", content: `Şirket: ${company_name}` }
      ],
    });
    res.json({ pitch: completion.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/forge/deep-crawl-stream', async (req, res) => {
  const { url, company_name, provider } = req.body;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  
  res.write(`> [Deep Crawl] Başlatılıyor: ${company_name} - ${url}\n`);
  
  let browser;
  try {
    if (!url || url === 'Bulunamadı' || !url.startsWith('http')) {
      throw new Error("Geçerli bir web sitesi adresi yok!");
    }

    const isSocialMedia = url.includes('instagram.com') || url.includes('facebook.com') || url.includes('twitter.com') || url.includes('linkedin.com') || url.includes('x.com');
    
    let cleanedText = "";
    let systemPrompt = "";
    
    if (isSocialMedia) {
      res.write(`> [Analiz] Sosyal medya hesabı tespit edildi. (Playwright ile derin tarama atlanıyor)\n`);
      systemPrompt = `Sen bir dijital varlık analiz uzmanısın. Bize verilen firma kendi özel web sitesine sahip değil, sadece sosyal medya kullanıyor. Bu durumu analiz et ve firmanın neden acilen profesyonel bir web sitesine ihtiyacı olduğunu anlatan teknik bir analiz yap. Ayrıca bu firmaya nasıl bir satış teklifi/sunum yapılması gerektiğine dair ideal yaklaşımı belirle. Çıktıyı SADECE AŞAĞIDAKİ JSON FORMATINDA ver. Asla markdown kodu veya başka bir metin ekleme:
{
  "score": 20,
  "summary": "Firma sadece sosyal medya kullanıyor. Profesyonel bir web sitesi yok...",
  "design_ux_title": "1. Tasarım ve Kullanıcı Deneyimi",
  "design_ux_text": "Web sitesi bulunmadığı için kullanıcı deneyimi değerlendirilemiyor...",
  "content_quality_title": "2. İçerik Kalitesi ve Metinler",
  "content_quality_text": "Sosyal medyadaki içerikler sınırlı ve kurumsal bir imaj çizmekten uzak...",
  "weaknesses": ["Özel alan adı yok.", "Arama motorlarında bulunabilirlik sıfır.", "Kurumsal e-posta adresi yok."],
  "tech_trust_title": "İletişim ve Güven Unsurları",
  "tech_trust_text": "Müşteriler güvenilir bir referans noktası bulamıyor...",
  "conversion_title": "Dönüşüm Potansiyeli",
  "conversion_text": "Web sitesi olmadığı için doğrudan satış veya randevu sistemi kurulamıyor...",
  "conclusion": "Acilen profesyonel bir web sitesine ihtiyaç var...",
  "pitch_approach": "Firmaya öncelikle 'Instagram tek başına yetmez' vizyonu sunulmalı. Kendi domain'lerine sahip olmanın güvenilirliği artıracağı vurgulanarak, hızlıca dönüşüm getirecek tek sayfalık bir prestij sitesi teklif edilmeli."
}`;
      cleanedText = "Firma sadece sosyal medya kullanıyor. Özel web sitesi yok.";
    } else {
      res.write(`> [Playwright] Web sitesine sızılıyor...\n`);
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      
      await page.goto(url, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
      
      // Auto-scroll to trigger lazy loading and CSS animations
      await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 200;
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                if(totalHeight >= document.body.scrollHeight || totalHeight > 8000){
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
      }).catch(() => {});
      
      res.write(`> [Playwright] Metinler ve alt sayfalar taranıyor...\n`);
      
      let pageText = "";
      try {
        pageText = "--- ANA SAYFA ---\n" + (await page.evaluate(() => {
          document.querySelectorAll('script, style, noscript, svg').forEach(el => el.remove());
          // textContent is used to capture text even if CSS makes it invisible (e.g. opacity: 0)
          return document.body.textContent || document.body.innerText || "";
        })) + "\n\n";
        
        // Find internal subpages (max 3)
        const subLinks = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          const origin = window.location.origin;
          const uniqueLinks = new Set();
          
          links.forEach(a => {
            if (a.href && a.href.startsWith(origin) && !a.href.includes('#') && a.href !== origin + '/' && a.href !== window.location.href) {
              uniqueLinks.add(a.href);
            }
          });
          
          // Prioritize important pages like 'hakkimizda', 'iletisim', 'hizmetler'
          const sortedLinks = Array.from(uniqueLinks).sort((a, b) => {
            const aStr = a.toLowerCase();
            const bStr = b.toLowerCase();
            const keywords = ['hakkimizda', 'iletisim', 'contact', 'about', 'hizmet', 'service', 'kurumsal'];
            let aScore = keywords.some(k => aStr.includes(k)) ? 1 : 0;
            let bScore = keywords.some(k => bStr.includes(k)) ? 1 : 0;
            return bScore - aScore;
          });
          
          return sortedLinks.slice(0, 3);
        });

        for (const link of subLinks) {
          res.write(`> [Playwright] Alt sayfa taranıyor: ${link}\n`);
          await page.goto(link, { waitUntil: 'load', timeout: 8000 }).catch(() => {});
          
          await page.evaluate(async () => {
            await new Promise(r => setTimeout(r, 1000));
            document.querySelectorAll('script, style, noscript, svg').forEach(el => el.remove());
          }).catch(() => {});
          
          const subText = await page.evaluate(() => document.body ? (document.body.textContent || document.body.innerText || "") : "").catch(() => "");
          pageText += `--- ALT SAYFA (${link}) ---\n${subText}\n\n`;
        }
      } catch (e) {
        console.error("Evaluate error:", e);
      }
      
      cleanedText = pageText.replace(/\s+/g, ' ').trim().substring(0, 15000);
      
      if (cleanedText.length < 50) {
        throw new Error("Sitede yeterli içerik bulunamadı (Bot koruması veya boş sayfa).");
      }
      systemPrompt = `Sen bir dijital varlık analiz uzmanısın. Sana bir işletmenin web sitesinden kazınmış ham metinleri vereceğim. Sitedeki eksiklikleri tespit et ve bu firmaya hizmet satmak için İDEAL SUNUM VE TEKLİF YAKLAŞIMINI belirle. LÜTFEN VERİLEN METİNLERİ DİKKATLE OKU. Eğer metinlerde "Hakkımızda" veya benzeri bilgiler varsa, "sayfa boş" DEME.

SADECE AŞAĞIDAKİ JSON FORMATINDA (ve Türkçe) çıktı ver. Başka hiçbir açıklama, markdown veya text yazma. JSON içindeki metinleri KENDİ ANALİZİNE göre doldur (Aşağıdaki metinler sadece yapı örneğidir, kopyalama):
{
  "score": 60,
  "summary": "[Genel özet buraya yazılacak...]",
  "design_ux_title": "1. Tasarım ve Kullanıcı Deneyimi",
  "design_ux_text": "[Tasarım analizi buraya yazılacak...]",
  "content_quality_title": "2. İçerik Kalitesi ve Metinler",
  "content_quality_text": "[İçerik analizi buraya yazılacak...]",
  "weaknesses": ["[Sitedeki en kritik 1. eksiklik]", "[Sitedeki en kritik 2. eksiklik]", "[Sitedeki en kritik 3. eksiklik]"],
  "tech_trust_title": "İletişim ve Güven Unsurları",
  "tech_trust_text": "[Güven unsuru analizi buraya yazılacak...]",
  "conversion_title": "Dönüşüm Potansiyeli",
  "conversion_text": "[Dönüşüm analizi buraya yazılacak...]",
  "conclusion": "[Genel sonuç cümlesi buraya yazılacak...]",
  "pitch_approach": "[Bu firmaya nasıl bir satış stratejisi izlenmeli? Hangi hizmetler sunulmalı?]"
}`;
    }

    const aiProvider = provider || 'grok';
    res.write(`> [Yapay Zeka] ${aiProvider.toUpperCase()} motoruna veri gönderiliyor...\n`);

    let clientOptions = { baseURL: 'http://localhost:1234/v1', apiKey: 'lm-studio' };
    let modelName = 'local-model';

    if (aiProvider === 'grok') {
      const finalKey = process.env.GROK_API_KEY;
      if (!finalKey) throw new Error('Grok API anahtarı sunucuda kayıtlı değil!');
      clientOptions = { baseURL: 'https://api.x.ai/v1', apiKey: finalKey };
      modelName = 'grok-4.20-0309-non-reasoning';
    } else if (aiProvider === 'openai') {
      const finalKey = process.env.OPENAI_API_KEY;
      if (!finalKey) throw new Error('OpenAI API anahtarı sunucuda kayıtlı değil!');
      clientOptions = { apiKey: finalKey }; 
      modelName = 'gpt-4o-mini';
    }

    const aiClient = new OpenAI(clientOptions);
    const completion = await aiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Firma Adı: ${company_name}\nWeb Sitesi Verisi:\n${cleanedText}` }
      ],
      response_format: { type: "json_object" }
    });

    let aiResult = completion.choices[0].message.content;
    let parsedData = {};
    try {
      const jsonMatch = aiResult.match(/```json\n([\s\S]*?)\n```/) || aiResult.match(/```([\s\S]*?)```/) || [null, aiResult];
      parsedData = JSON.parse(jsonMatch[1].trim());
    } catch (e) {
      console.error("JSON parse hatası:", e);
      parsedData = {
        score: 30, summary: "Analiz oluşturulurken JSON ayrıştırma hatası oluştu.",
        design_ux_title: "1. Tasarım ve Kullanıcı Deneyimi", design_ux_text: "Hata",
        content_quality_title: "2. İçerik Kalitesi ve Metinler", content_quality_text: "Hata",
        weaknesses: ["Veri okunamadı."], tech_trust_title: "İletişim", tech_trust_text: "Hata",
        conversion_title: "Dönüşüm", conversion_text: "Hata", conclusion: "Hata."
      };
    }

    let weaknessesHtml = parsedData.weaknesses && parsedData.weaknesses.map(w => `<li class="flex items-start gap-2 mb-3"><span class="text-[#D4AF37] mt-1">•</span><span class="text-gray-400 text-sm">${w}</span></li>`).join('') || '';

    const htmlReport = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dijital Varlık Analiz Raporu - ${company_name}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #050505; color: #e5e5e5; font-family: 'Inter', system-ui, sans-serif; }
    .gold-text { color: #D4AF37; }
    .card-bg { background-color: #111; border: 1px solid rgba(255,255,255,0.05); }
    .kritik-badge { background-color: rgba(239, 68, 68, 0.15); color: #ef4444; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 8px; letter-spacing: 0.05em; }
  </style>
</head>
<body class="p-4 md:p-10 flex justify-center">
  <div class="max-w-4xl w-full">
    
    <!-- HEADER -->
    <div class="flex flex-col items-center mb-10 text-center">
      <div class="text-xs font-bold tracking-widest gold-text mb-3 uppercase flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-[#D4AF37]"></span> ANALYSE
      </div>
      <h1 class="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">DİJİTAL VARLIK ANALİZ RAPORU</h1>
      <p class="text-sm text-gray-500 uppercase tracking-[0.2em]">${company_name}</p>
    </div>

    <!-- OVERALL SCORE CARD -->
    <div class="card-bg rounded-2xl p-6 md:p-8 mb-12 flex flex-col md:flex-row items-center gap-8">
      <div class="flex-shrink-0 relative w-28 h-28 flex items-center justify-center rounded-full border-4 border-gray-800" style="border-bottom-color: #D4AF37; border-left-color: ${parsedData.score > 50 ? '#D4AF37' : 'transparent'}; border-top-color: ${parsedData.score > 80 ? '#D4AF37' : 'transparent'}; transform: rotate(-45deg);">
        <div style="transform: rotate(45deg);" class="text-center">
          <div class="text-3xl font-bold gold-text">${parsedData.score || '0'}</div>
          <div class="text-[9px] text-gray-500 font-bold tracking-wider uppercase mt-1">OVERALL</div>
        </div>
      </div>
      <div>
        <h2 class="text-xl font-bold text-white mb-3">${company_name}</h2>
        <p class="text-gray-400 text-sm leading-relaxed">${parsedData.summary}</p>
      </div>
    </div>

    <!-- SECTION 1: KRITIK BULGULAR -->
    <div class="mb-10">
      <h3 class="gold-text text-sm font-bold mb-4 flex items-center gap-2"><span class="w-1 h-1 rounded-full bg-[#D4AF37]"></span> Kritik Bulgular</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="card-bg rounded-xl p-6 border border-red-900/30">
          <h4 class="text-white font-bold mb-3 flex items-center">${parsedData.design_ux_title} <span class="kritik-badge">KRİTİK</span></h4>
          <p class="text-gray-400 text-sm leading-relaxed">${parsedData.design_ux_text}</p>
        </div>
        <div class="card-bg rounded-xl p-6 border border-red-900/30">
          <h4 class="text-white font-bold mb-3 flex items-center">${parsedData.content_quality_title} <span class="kritik-badge">KRİTİK</span></h4>
          <p class="text-gray-400 text-sm leading-relaxed">${parsedData.content_quality_text}</p>
        </div>
      </div>
    </div>

    <!-- SECTION 2: IÇERIK VE SEO -->
    <div class="mb-10">
      <h3 class="gold-text text-sm font-bold mb-4 flex items-center gap-2"><span class="w-1 h-1 rounded-full bg-[#D4AF37]"></span> İçerik & SEO Durumu</h3>
      <div class="card-bg rounded-xl p-6">
        <h4 class="text-white font-bold mb-4 text-sm">Zayıf Yönler</h4>
        <ul class="flex flex-col">
          ${weaknessesHtml}
        </ul>
      </div>
    </div>

    <!-- SECTION 3: TEKNIK VE DONUSUM -->
    <div class="mb-10">
      <h3 class="gold-text text-sm font-bold mb-4 flex items-center gap-2"><span class="w-1 h-1 rounded-full bg-[#D4AF37]"></span> Teknik & Dönüşüm Optimizasyonu</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="card-bg rounded-xl p-6">
          <h4 class="text-white font-bold mb-3 text-sm">${parsedData.tech_trust_title}</h4>
          <p class="text-gray-400 text-sm leading-relaxed">${parsedData.tech_trust_text}</p>
        </div>
        <div class="card-bg rounded-xl p-6">
          <h4 class="text-white font-bold mb-3 text-sm">${parsedData.conversion_title}</h4>
          <p class="text-gray-400 text-sm leading-relaxed">${parsedData.conversion_text}</p>
        </div>
      </div>
    </div>

    <!-- SECTION 4: GENEL DEGERLENDIRME -->
    <div class="mb-12">
      <h3 class="gold-text text-sm font-bold mb-4 flex items-center gap-2"><span class="w-1 h-1 rounded-full bg-[#D4AF37]"></span> Genel Değerlendirme</h3>
      <div class="card-bg rounded-xl p-6 border-l-2 border-l-[#D4AF37]">
        <p class="text-gray-300 text-sm leading-relaxed">${(parsedData.conclusion || '').replace('çok düşük seviyede', '<span class="gold-text font-bold">çok düşük seviyede</span>')}</p>
      </div>
    </div>

    <!-- SECTION 5: IDEAL SUNUM YAKLASIMI -->
    <div class="mb-12">
      <h3 class="gold-text text-sm font-bold mb-4 flex items-center gap-2">
        <span class="w-1 h-1 rounded-full bg-[#04D9FF]"></span> <span class="text-[#04D9FF]">İdeal Sunum ve Teklif Yaklaşımı</span>
      </h3>
      <div class="rounded-xl p-6 border border-[#04D9FF]/20 bg-[#04D9FF]/5 relative overflow-hidden">
        <div class="absolute top-0 right-0 p-4 opacity-10 text-[#04D9FF]">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <p class="text-gray-300 text-sm leading-relaxed relative z-10 italic">${parsedData.pitch_approach || 'Bu firma için özel bir sunum yaklaşımı belirlenmedi.'}</p>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="flex flex-col md:flex-row justify-between items-center text-xs text-gray-600 border-t border-gray-800/50 pt-6">
      <div>Analiz Tarihi: <span class="gold-text font-bold">${new Date().toLocaleString('tr-TR', { month: 'long', year: 'numeric' })}</span></div>
      <div>Dijital Varlık Skoru: <span class="gold-text font-bold">${parsedData.score}/100</span></div>
      <div>Rapor Türü: <span class="gold-text font-bold">Teknik + İçerik + UX Analizi</span></div>
    </div>

  </div>
</body>
</html>`;

    res.write(`> [Raporlama] Zayıf noktalar analiz edildi, Rapor şablonu oluşturuldu.\n`);
    
    const safeName = company_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${safeName}_deep_crawl_${Date.now()}.html`;
    fs.writeFileSync(path.join(dataDir, 'deep_crawl', fileName), htmlReport);
    
    res.write(`REPORT_URL:http://localhost:8000/static/deep_crawl/${fileName}\n`);
    res.write('DONE');
    
  } catch (err) {
    res.write(`> ERROR: ${err.message}\n`);
    res.write('DONE');
  } finally {
    if (browser) await browser.close();
    res.end();
  }
});

app.post('/api/forge/analyze-crawl', async (req, res) => {
  const { company_name, provider } = req.body;
  try {
    const safeName = company_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const deepCrawlDir = path.join(dataDir, 'deep_crawl');
    
    if (!fs.existsSync(deepCrawlDir)) {
      throw new Error("Henüz hiçbir derin tarama yapılmamış.");
    }
    
    // Find the latest deep crawl report for this company
    const files = fs.readdirSync(deepCrawlDir)
      .filter(f => f.startsWith(`${safeName}_deep_crawl_`))
      .sort((a, b) => fs.statSync(path.join(deepCrawlDir, b)).mtime.getTime() - fs.statSync(path.join(deepCrawlDir, a)).mtime.getTime());
      
    if (files.length === 0) {
      throw new Error("Bu firma için bir derin tarama raporu bulunamadı. Önce Derin Tarama yapın.");
    }
    
    const latestReportPath = path.join(deepCrawlDir, files[0]);
    const reportContent = fs.readFileSync(latestReportPath, 'utf8');
    
    // Temiz metin çıkartma (HTML etiketlerinden arındırma - AI'ın daha az token harcaması için)
    const textContent = reportContent.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().substring(0, 10000);

    const aiProvider = provider || 'grok';
    let clientOptions = { baseURL: 'http://localhost:1234/v1', apiKey: 'lm-studio' };
    let modelName = 'local-model';

    if (aiProvider === 'grok') {
      const finalKey = process.env.GROK_API_KEY;
      if (!finalKey) throw new Error('Grok API anahtarı sunucuda kayıtlı değil!');
      clientOptions = { baseURL: 'https://api.x.ai/v1', apiKey: finalKey };
      modelName = 'grok-4.20-0309-non-reasoning';
    } else if (aiProvider === 'openai') {
      const finalKey = process.env.OPENAI_API_KEY;
      if (!finalKey) throw new Error('OpenAI API anahtarı sunucuda kayıtlı değil!');
      clientOptions = { apiKey: finalKey }; 
      modelName = 'gpt-4o-mini';
    }

    const aiClient = new OpenAI(clientOptions);
    const completion = await aiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: "Sen acımasız, ikna edici ve profesyonel bir B2B satış uzmanısın. Sana bir firmanın dijital varlık analizini vereceğim. Bu analizdeki eksiklikleri (zayıf web sitesi, iletişim eksiği veya sadece sosyal medya kullanımı) kullanarak, firma sahibine profesyonel web tasarım ve dijital pazarlama hizmetleri satacak çok etkili, kısa ve vurucu bir SOĞUK E-POSTA (Pitch) yaz. E-postanın konu başlığını da belirle. Sadece düz metin veya markdown formatında yaz, HTML kullanma." },
        { role: "user", content: `Firma Adı: ${company_name}\n\nDijital Varlık Analizi Raporu:\n${textContent}` }
      ],
    });

    res.json({ report: completion.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(8000, () => {
  console.log('Node.js Backend (Express) running on port 8000');
});

// -- ENV MANAGEMENT --
const envPath = path.join(__dirname, '.env');

app.get('/api/forge/keys', (req, res) => {
  res.json({
    grok: !!process.env.GROK_API_KEY,
    openai: !!process.env.OPENAI_API_KEY
  });
});

app.post('/api/forge/keys', (req, res) => {
  const { provider, key } = req.body;
  if (!key) return res.status(400).json({ error: 'Anahtar boş olamaz' });
  
  const envVar = provider === 'grok' ? 'GROK_API_KEY' : 'OPENAI_API_KEY';
  process.env[envVar] = key;
  
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const regex = new RegExp(`^${envVar}=.*$`, 'm');
  
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${envVar}=${key}`);
  } else {
    envContent += `\\n${envVar}=${key}`;
  }
  
  fs.writeFileSync(envPath, envContent.trim() + '\\n');
  res.json({ success: true });
});

app.delete('/api/forge/keys/:provider', (req, res) => {
  const { provider } = req.params;
  const envVar = provider === 'grok' ? 'GROK_API_KEY' : 'OPENAI_API_KEY';
  
  delete process.env[envVar];
  
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    const regex = new RegExp(`^${envVar}=.*$\\n?`, 'gm');
    envContent = envContent.replace(regex, '');
    fs.writeFileSync(envPath, envContent.trim() + '\\n');
  }
  
  res.json({ success: true });
});
