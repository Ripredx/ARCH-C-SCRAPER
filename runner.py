import os
import sys
import subprocess
import platform

def run_command(cmd, cwd=None, new_console=False):
    if new_console and platform.system() == "Windows":
        return subprocess.Popen(cmd, cwd=cwd, shell=True, creationflags=subprocess.CREATE_NEW_CONSOLE)
    return subprocess.run(cmd, cwd=cwd, shell=True)

def install():
    print("[*] Adim 1: Backend sanal ortami (venv) kuruluyor...")
    run_command(f"{sys.executable} -m venv venv", cwd="backend")
    
    print("[*] Adim 2: Backend bagimliliklari ve Playwright indiriliyor (Bu islem surebilir)...")
    activate_cmd = ".\\venv\\Scripts\\activate && " if platform.system() == "Windows" else "source venv/bin/activate && "
    run_command(f"{activate_cmd}pip install -r requirements.txt && playwright install", cwd="backend")
    
    print("[*] Adim 3: Frontend (Node.js) bagimliliklari kuruluyor...")
    run_command("npm install", cwd="frontend")
    print("[+] Tum kurulumlar basariyla tamamlandi!")

def start():
    print("[*] Sunucular baslatiliyor...")
    activate_cmd = ".\\venv\\Scripts\\activate && " if platform.system() == "Windows" else "source venv/bin/activate && "
    
    # Windows'ta yeni sekmede ac, Linux/Mac'te arka planda (nohup)
    if platform.system() == "Windows":
        run_command(f"{activate_cmd}uvicorn main:app --reload --port 8000", cwd="backend", new_console=True)
        run_command("npm run dev", cwd="frontend", new_console=True)
    else:
        subprocess.Popen(f"{activate_cmd}uvicorn main:app --reload --port 8000", cwd="backend", shell=True)
        subprocess.Popen("npm run dev", cwd="frontend", shell=True)
        
    print("[+] Frontend (5173) ve Backend (8000) calisiyor.")

def stop():
    print("[*] Acik olan portlar (5173, 8000) temizleniyor...")
    if platform.system() == "Windows":
        for port in [5173, 8000]:
            try:
                out = subprocess.check_output(f'netstat -aon | find ":{port}" | find "LISTENING"', shell=True).decode()
                for line in out.strip().split('\n'):
                    if line:
                        pid = line.strip().split()[-1]
                        if pid != "0":
                            subprocess.run(f"taskkill /F /PID {pid}", shell=True, stderr=subprocess.DEVNULL)
            except: pass
    else:
        for port in [5173, 8000]:
            subprocess.run(f"lsof -ti:{port} | xargs kill -9", shell=True, stderr=subprocess.DEVNULL)
    print("[+] Sunucular basariyla durduruldu.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanim: python runner.py [install | start | stop | auto]")
        sys.exit(1)
        
    cmd = sys.argv[1].lower()
    
    if cmd == "install":
        install()
    elif cmd == "start":
        start()
    elif cmd == "stop":
        stop()
    elif cmd == "auto":
        # Eger kurulum yapilmamissa once kur, sonra baslat.
        if not os.path.exists(os.path.join("backend", "venv")):
            print("[!] Kurulum bulunamadi. Otomatik kurulum baslatiliyor...")
            install()
        start()
    else:
        print("Gecersiz komut! Lutfen: 'install', 'start', 'stop' veya 'auto' kullanin.")
