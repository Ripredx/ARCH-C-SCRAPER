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
    
    sendLog('> Veriler kazınıyor...');
    // Demo logic: wait a bit and mock some data for now, then we'll refine
    await page.waitForTimeout(3000);
    
    const results = [
      { name: `Örnek ${keywords} 1`, phone: '0555 555 5555', address: location, website: 'https://ornek.com' },
      { name: `Örnek ${keywords} 2`, phone: '0532 323 3232', address: location, website: 'https://ornek2.com' }
    ];
    
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

// 3. AI ANALYZE
app.post('/api/forge/analyze', async (req, res) => {
  const { filename } = req.body;
  try {
    const content = fs.readFileSync(path.join(dataDir, 'google_maps', filename), 'utf8');
    const completion = await openai.chat.completions.create({
      model: "local-model", // LM Studio ignores this anyway
      messages: [
        { role: "system", content: "Sen bir veri analiz uzmanısın. Aşağıdaki JSON verisini incele ve HTML formatında güzel bir rapor oluştur. Butonlara data-action='deep-crawl' özelliklerini eklemeyi unutma." },
        { role: "user", content: `Veri: ${content}` }
      ],
    });
    
    const htmlReport = completion.choices[0].message.content;
    const reportName = `report_${Date.now()}.html`;
    fs.writeFileSync(path.join(dataDir, 'reports', reportName), htmlReport);
    
    res.json({ log: '> Yapay zeka analizi tamamlandı ve rapor oluşturuldu.' });
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

app.post('/api/forge/deep-crawl-stream', (req, res) => {
  const { url, company_name } = req.body;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  
  res.write(`> [Deep Crawl] Başlatılıyor: ${company_name} - ${url}\n`);
  
  setTimeout(() => {
    // Demo crawl success
    const fakeHtml = `<html><body><h1>${company_name} Raporu</h1><p>Derin kazıma tamamlandı.</p></body></html>`;
    const safeName = company_name.replace(/\\s+/g, '_');
    fs.writeFileSync(path.join(dataDir, 'deep_crawl', `${safeName}_deep_crawl.html`), fakeHtml);
    
    res.write(`REPORT_URL:http://localhost:8000/static/deep_crawl/${safeName}_deep_crawl.html\n`);
    res.write('DONE');
    res.end();
  }, 3000);
});

app.listen(8000, () => {
  console.log('Node.js Backend (Express) running on port 8000');
});
