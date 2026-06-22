const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log("[*] Arch/C Scraper - Node.js Başlatıcı\n");

const backendPath = path.join(__dirname, 'backend');
const frontendPath = path.join(__dirname, 'frontend');

// 1. Kurulum Kontrolü ve Otomatik Yükleme
function ensureDependencies() {
  // Backend bağımlılıkları kontrolü
  if (!fs.existsSync(path.join(backendPath, 'node_modules'))) {
    console.log("[!] Backend kurulumu eksik. İndiriliyor...");
    execSync('npm install', { cwd: backendPath, stdio: 'inherit' });
    console.log("[!] Playwright Tarayıcıları indiriliyor...");
    execSync('npx playwright install chromium', { cwd: backendPath, stdio: 'inherit' });
  }

  // Frontend bağımlılıkları kontrolü
  if (!fs.existsSync(path.join(frontendPath, 'node_modules'))) {
    console.log("[!] Frontend kurulumu eksik. İndiriliyor...");
    execSync('npm install', { cwd: frontendPath, stdio: 'inherit' });
  }
}

// Kurulumları kontrol et ve gerekirse yap
ensureDependencies();

// 2. Sunucuları Başlat
console.log("\n[*] Sunucular başlatılıyor...");

const backendProcess = spawn('node', ['server.js'], {
  cwd: backendPath,
  stdio: 'inherit',
  shell: true
});

const frontendProcess = spawn('npm', ['run', 'dev'], {
  cwd: frontendPath,
  stdio: 'inherit',
  shell: true
});

console.log("[+] Frontend (5173) ve Backend (8000) Başlatıldı!");
console.log("[!] Kapatmak için bu pencerede CTRL+C yapmanız yeterlidir.\n");

// Çıkış yakalama ve temizleme
process.on('SIGINT', () => {
  console.log("\n[*] Sunucular durduruluyor...");
  backendProcess.kill();
  frontendProcess.kill();
  process.exit();
});
