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
    
    const filename = `harvester_${Date.now()}.json`;
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
    const reportTitle = filename.replace('.json', '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

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

    const reportName = `report_${Date.now()}.html`;
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
      systemPrompt = "Sen bir dijital varlık analiz uzmanısın. Bize verilen firma kendi özel web sitesine sahip değil, sadece sosyal medya kullanıyor. Bu durumu analiz et ve firmanın neden acilen profesyonel bir web sitesine ihtiyacı olduğunu (güvenilirlik, kontrol eksikliği, arama motorlarında bulunamama) anlatan teknik bir ANALİZ RAPORU oluştur. Kesinlikle bir e-posta veya teklif yazma. Çıktıyı koyu arkaplanlı, çok şık, temiz ve minimalist bir HTML sayfası olarak ver. Kod dışı markdown yazma.";
      cleanedText = "Firma sadece sosyal medya kullanıyor. Özel web sitesi yok.";
    } else {
      res.write(`> [Playwright] Web sitesine sızılıyor...\n`);
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      
      // Wait for full load to avoid mid-navigation evaluate errors
      await page.goto(url, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
      
      // Short delay for any client-side redirects to settle
      await new Promise(r => setTimeout(r, 2000));
      
      res.write(`> [Playwright] Metinler ve iletişim verileri süpürülüyor...\n`);
      
      let pageText = "";
      try {
        pageText = await page.evaluate(() => document.body ? document.body.innerText : "");
      } catch (e) {
        if (e.message.includes('Execution context was destroyed')) {
          // Page navigated again. Wait a bit and retry.
          await new Promise(r => setTimeout(r, 3000));
          pageText = await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => "");
        } else {
          console.error("Evaluate error:", e);
        }
      }
      
      cleanedText = pageText.replace(/\s+/g, ' ').trim().substring(0, 15000); // 15.000 karaktere kırp
      
      if (cleanedText.length < 50) {
        throw new Error("Sitede yeterli içerik bulunamadı (Bot koruması veya boş sayfa).");
      }
      
      systemPrompt = "Sen bir dijital varlık analiz uzmanısın. Sana bir işletmenin web sitesinden kazınmış ham metinleri vereceğim. Şunları yap: Sitedeki eksiklikleri (iletişim zayıflığı, hizmet detaysızlığı, zayıf metinler vb.) tespit et. Sadece firmanın dijital varlık durumunu özetleyen bir ANALİZ RAPORU yaz. Kesinlikle bir e-posta, teklif veya satış metni YAZMA. Çıktıyı koyu arkaplanlı, çok şık, temiz ve minimalist bir HTML sayfası olarak ver. Kod dışı markdown yazma.";
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
    });

    let htmlReport = completion.choices[0].message.content;
    const match = htmlReport.match(/```html([\s\S]*?)```/i) || htmlReport.match(/```([\s\S]*?)```/i) || htmlReport.match(/(<!DOCTYPE[\s\S]*?<\/html>)/i) || htmlReport.match(/(<html[\s\S]*?<\/html>)/i);
    if (match && match[1]) {
      htmlReport = match[1].trim();
    }

    res.write(`> [Raporlama] Zayıf noktalar analiz edildi, Rapor oluşturuldu.\n`);
    
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
