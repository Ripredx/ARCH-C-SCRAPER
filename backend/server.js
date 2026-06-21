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

    // Build static HTML template
    let cardsHtml = '';
    for (const b of parsedData.businesses) {
      cardsHtml += `
        <div class="bg-[#111] border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition-colors">
          <h3 class="text-lg font-semibold text-white mb-3">${b.name || 'Bilinmeyen Firma'}</h3>
          <div class="space-y-2 mb-6">
            <div class="flex items-start gap-3 text-sm text-gray-400">
              <i class="fa-solid fa-phone mt-1 text-gray-500"></i>
              <span>${b.phone || 'Bulunamadı'}</span>
            </div>
            <div class="flex items-start gap-3 text-sm text-gray-400">
              <i class="fa-solid fa-location-dot mt-1 text-gray-500"></i>
              <span>${b.address || 'Bulunamadı'}</span>
            </div>
            <div class="flex items-start gap-3 text-sm text-gray-400">
              <i class="fa-solid fa-globe mt-1 text-gray-500"></i>
              <a href="${b.website && b.website !== 'Bulunamadı' ? b.website : '#'}" target="_blank" class="text-[#04D9FF] hover:underline break-all">${b.website || 'Bulunamadı'}</a>
            </div>
          </div>
          <div class="flex gap-2">
            <button data-action="deep-crawl" data-name="${b.name}" data-url="${b.website || ''}" class="w-full bg-[#04D9FF]/10 text-[#04D9FF] hover:bg-[#04D9FF] hover:text-black border border-[#04D9FF]/30 transition-all font-medium py-2 rounded-lg text-sm flex items-center justify-center gap-2">
              <i class="fa-solid fa-spider"></i> Derin Tarama
            </button>
          </div>
        </div>
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
        url: urlEl && urlEl !== 'Bulunamadı' ? urlEl : 'Bulunamadı', 
        company_name: nameEl 
      }, '*');
      
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tarama Başlatıldı...';
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    }
  });
</script>
`;

    let htmlReport = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Veri Analizi Raporu</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { background-color: #0a0a0a; color: #e5e5e5; font-family: ui-sans-serif, system-ui, sans-serif; }
  </style>
</head>
<body class="p-8">
  <div class="max-w-6xl mx-auto">
    <h1 class="text-3xl font-bold mb-2 text-white"><i class="fa-solid fa-chart-pie mr-3 text-[#04D9FF]"></i> Pazar Analizi Raporu</h1>
    <p class="text-gray-400 mb-8 border-l-2 border-[#04D9FF] pl-4 italic">${parsedData.summary || 'Bu rapor yapay zeka analizinden geçirilerek oluşturulmuştur.'}</p>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${cardsHtml}
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
      systemPrompt = "Sen acımasız ve ikna edici bir dijital pazarlama stratejistisin. Bize verilen firma kendi özel web sitesine sahip değil, sadece sosyal medya kullanıyor. Şunları yap: 1) Sosyal medyaya bağımlı kalmanın dezavantajlarını (hesabın kapanma riski, kurumsallıktan uzak olma vb.) vurucu bir dille anlat. 2) Onlara profesyonel bir web sitesi satacak etkili bir SOĞUK E-POSTA (Pitch) yaz. Çıktıyı koyu arkaplanlı, çok şık, temiz ve minimalist bir HTML sayfası olarak ver (neon renkler veya abartılı CSS kullanma, sade ve profesyonel olsun). Kod dışı markdown yazma.";
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
      
      systemPrompt = "Sen acımasız ve ikna edici bir dijital pazarlama stratejistisin. Sana bir işletmenin web sitesinden kazınmış ham metinleri vereceğim. Şunları yap: 1) Sitedeki eksiklikleri (iletişim zayıflığı, hizmet detaysızlığı vb.) bul. 2) Onlara web tasarım/pazarlama satacak profesyonel bir SOĞUK E-POSTA (Pitch) yaz. Çıktıyı koyu arkaplanlı, çok şık, temiz ve minimalist bir HTML sayfası olarak ver (neon renkler veya abartılı CSS kullanma, sade ve profesyonel olsun). Kod dışı markdown yazma.";
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
