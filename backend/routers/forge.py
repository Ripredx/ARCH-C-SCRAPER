import os
import json
import glob
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import traceback
from openai import OpenAI
from scrapling import Fetcher
from services.refiner import generate_html_report

llm_client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")

router = APIRouter(prefix="/api/forge", tags=["forge"])

class AnalyzeRequest(BaseModel):
    filename: str
    model: str = "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF" # LM Studio usually ignores this and uses the loaded model

class DeepCrawlRequest(BaseModel):
    url: str
    company_name: str
    
class GeneratePitchRequest(BaseModel):
    company_name: str
    industry: str = "Genel"

@router.get("/files")
async def list_files():
    try:
        outputs_dir = os.path.join(os.path.dirname(__file__), '..', 'outputs')
        if not os.path.exists(outputs_dir):
            return {"files": []}
        
        search_pattern = os.path.join(outputs_dir, "*.json")
        files = glob.glob(search_pattern)
        
        # Sadece dosya adlarını al ve yeniden eskiye sırala
        files = [os.path.basename(f) for f in files]
        files.sort(reverse=True)
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reports")
async def list_reports():
    try:
        outputs_dir = os.path.join(os.path.dirname(__file__), '..', 'outputs')
        if not os.path.exists(outputs_dir):
            return {"reports": []}
        
        search_pattern = os.path.join(outputs_dir, "report_*.html")
        files = glob.glob(search_pattern)
        
        # Sadece dosya adlarını al ve yeniden eskiye sırala
        files = [os.path.basename(f) for f in files]
        files.sort(reverse=True)
        return {"reports": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/files/{filename}")
async def get_file(filename: str):
    try:
        filepath = os.path.join(os.path.dirname(__file__), '..', 'outputs', filename)
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="File not found")
            
        with open(filepath, 'r', encoding='utf-8') as f:
            content = json.load(f)
        return content
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/report/{filename}")
async def get_report(filename: str):
    try:
        report_filename = f"report_{filename}.html"
        filepath = os.path.join(os.path.dirname(__file__), '..', 'outputs', report_filename)
        if not os.path.exists(filepath):
            return {"exists": False}
            
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"exists": True, "html": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze")
async def analyze_file(request: AnalyzeRequest):
    try:
        filepath = os.path.join(os.path.dirname(__file__), '..', 'outputs', request.filename)
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="File not found")
            
        with open(filepath, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)

        html_content, log_message = generate_html_report(raw_data, request.filename)

        return {"html": html_content, "log": log_message}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/deep-crawl")
async def deep_crawl_and_analyze(req: DeepCrawlRequest):
    try:
        # 1. Scrape with Scrapling
        fetcher = Fetcher()
        page = fetcher.get(req.url)
        content_text = page.text
        
        # Limit text to ~20000 characters to avoid huge context usage
        if len(content_text) > 20000:
            content_text = content_text[:20000]
            
        # 2. Save JSON to outputs/deep_crawl/
        crawl_dir = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'deep_crawl')
        os.makedirs(crawl_dir, exist_ok=True)
        
        safe_name = "".join([c if c.isalnum() else "_" for c in req.company_name]).strip("_")
        json_filepath = os.path.join(crawl_dir, f"{safe_name}_deep_crawl.json")
        
        saved_data = {
            "company_name": req.company_name,
            "url": req.url,
            "content": content_text
        }
        
        with open(json_filepath, 'w', encoding='utf-8') as f:
            json.dump(saved_data, f, ensure_ascii=False, indent=2)
            
        # 3. Generate HTML output for clear visualization
        safe_content = content_text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        html_content = f"""<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{req.company_name} - Deep Crawl Raporu</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {{ background-color: #050505; color: #fff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }}
        .glass-panel {{ background: rgba(20, 20, 20, 0.6); backdrop-filter: blur(10px); border: 1px solid rgba(255, 0, 127, 0.2); }}
        /* Custom scrollbar */
        ::-webkit-scrollbar {{ width: 8px; height: 8px; }}
        ::-webkit-scrollbar-track {{ background: #111; border-radius: 4px; }}
        ::-webkit-scrollbar-thumb {{ background: #FF007F; border-radius: 4px; }}
        ::-webkit-scrollbar-thumb:hover {{ background: #ff3399; }}
    </style>
</head>
<body class="p-4 md:p-8">
    <div class="max-w-6xl mx-auto space-y-8">
        <div class="glass-panel rounded-2xl p-6 md:p-10 shadow-[0_0_30px_rgba(255,0,127,0.1)] relative overflow-hidden">
            <div class="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-[#FF007F] to-[#00FFFF]"></div>
            
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 class="text-3xl md:text-4xl font-bold text-white mb-2">{req.company_name}</h1>
                    <p class="text-gray-400 flex items-center gap-2">
                        <span>🔗</span> <a href="{req.url}" target="_blank" class="text-[#00FFFF] hover:underline transition-colors">{req.url}</a>
                    </p>
                </div>
                <div class="flex gap-4">
                    <div class="bg-black/50 rounded-xl p-4 border border-gray-800 text-center min-w-[120px]">
                        <div class="text-gray-500 text-xs uppercase tracking-wider mb-1">Karakter</div>
                        <div class="text-2xl font-mono text-[#00FFFF]">{len(content_text)}</div>
                    </div>
                </div>
            </div>

            <h2 class="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span class="text-[#FF007F]">📄</span> Kazınan Ham İçerik
            </h2>
            
            <div class="bg-[#0a0a0a] rounded-xl border border-gray-800 p-6 overflow-y-auto max-h-[600px] shadow-inner">
                <pre class="text-gray-300 font-mono text-sm whitespace-pre-wrap leading-relaxed">{safe_content}</pre>
            </div>
            
            <div class="mt-6 flex justify-end">
                <button onclick="window.print()" class="bg-[#FF007F]/20 text-[#FF007F] border border-[#FF007F]/50 px-6 py-2 rounded-lg font-medium hover:bg-[#FF007F] hover:text-white transition-all shadow-[0_0_15px_rgba(255,0,127,0.2)] hover:shadow-[0_0_25px_rgba(255,0,127,0.4)] flex items-center gap-2">
                    🖨️ Raporu Yazdır / PDF Kaydet
                </button>
            </div>
        </div>
    </div>
</body>
</html>"""
        html_filepath = os.path.join(crawl_dir, f"{safe_name}_deep_crawl.html")
        with open(html_filepath, 'w', encoding='utf-8') as f:
            f.write(html_content)
            
        return {"success": True, "message": "Site başarıyla kazındı ve veriler HTML/JSON formatında kaydedildi.", "saved_file": json_filepath, "html_file": html_filepath}
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class AnalyzeCrawlRequest(BaseModel):
    company_name: str

@router.post("/deep-crawl-stream")
async def deep_crawl_stream(req: DeepCrawlRequest):
    async def generate():
        yield f"> Deep Crawl başlatılıyor: {req.company_name}\n"
        yield f"> Hedef Adres: {req.url}\n"
        await asyncio.sleep(0.5)
        yield "> Tarayıcı motoru başlatılıyor (Scrapling)...\n"
        
        try:
            def fetch_url():
                import sys
                import asyncio
                if sys.platform == 'win32':
                    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
                    
                import re
                from camoufox.sync_api import Camoufox
                
                with Camoufox(headless=True, block_images=True) as browser:
                    context = browser.new_context(ignore_https_errors=True)
                    page = context.new_page()
                    page.goto(req.url, referer="https://www.google.com/")
                    page.wait_for_load_state("domcontentloaded")
                    page.wait_for_timeout(2000)
                    
                    body_text = page.content()
                    
                if isinstance(body_text, bytes):
                    body_text = body_text.decode('utf-8', errors='replace')
                    
                # Clean HTML tags
                text = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', body_text, flags=re.IGNORECASE|re.DOTALL)
                text = re.sub(r'<[^>]+>', ' ', text)
                return re.sub(r'\s+', ' ', text).strip()
                
            yield "> Sayfaya bağlanılıyor ve içerik çekiliyor (Bu işlem birkaç saniye sürebilir)...\n"
            content_text = await asyncio.to_thread(fetch_url)
            
            yield f"> İçerik başarıyla çekildi. (Ham Karakter Sayısı: {len(content_text)})\n"
            
            if len(content_text) > 20000:
                yield "> Uyarı: İçerik çok uzun, 20.000 karakter ile sınırlandırılıyor...\n"
                content_text = content_text[:20000]
                
            yield "> JSON dosyası oluşturuluyor...\n"
            await asyncio.sleep(0.2)
            crawl_dir = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'deep_crawl')
            os.makedirs(crawl_dir, exist_ok=True)
            
            safe_name = "".join([c if c.isalnum() else "_" for c in req.company_name]).strip("_")
            json_filepath = os.path.join(crawl_dir, f"{safe_name}_deep_crawl.json")
            
            saved_data = {
                "company_name": req.company_name,
                "url": req.url,
                "content": content_text
            }
            
            with open(json_filepath, 'w', encoding='utf-8') as f:
                json.dump(saved_data, f, ensure_ascii=False, indent=2)
                
            yield "> Görsel rapor için HTML dosyası oluşturuluyor...\n"
            await asyncio.sleep(0.2)
            
            safe_content = content_text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            html_content = f"""<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{req.company_name} - Deep Crawl Raporu</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {{ background-color: #050505; color: #fff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }}
        .glass-panel {{ background: rgba(20, 20, 20, 0.6); backdrop-filter: blur(10px); border: 1px solid rgba(255, 0, 127, 0.2); }}
        /* Custom scrollbar */
        ::-webkit-scrollbar {{ width: 8px; height: 8px; }}
        ::-webkit-scrollbar-track {{ background: #111; border-radius: 4px; }}
        ::-webkit-scrollbar-thumb {{ background: #FF007F; border-radius: 4px; }}
        ::-webkit-scrollbar-thumb:hover {{ background: #ff3399; }}
    </style>
</head>
<body class="p-4 md:p-8">
    <div class="max-w-6xl mx-auto space-y-8">
        <div class="glass-panel rounded-2xl p-6 md:p-10 shadow-[0_0_30px_rgba(255,0,127,0.1)] relative overflow-hidden">
            <div class="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-[#FF007F] to-[#00FFFF]"></div>
            
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 class="text-3xl md:text-4xl font-bold text-white mb-2">{req.company_name}</h1>
                    <p class="text-gray-400 flex items-center gap-2">
                        <span>🔗</span> <a href="{req.url}" target="_blank" class="text-[#00FFFF] hover:underline transition-colors">{req.url}</a>
                    </p>
                </div>
                <div class="flex gap-4">
                    <div class="bg-black/50 rounded-xl p-4 border border-gray-800 text-center min-w-[120px]">
                        <div class="text-gray-500 text-xs uppercase tracking-wider mb-1">Karakter</div>
                        <div class="text-2xl font-mono text-[#00FFFF]">{len(content_text)}</div>
                    </div>
                </div>
            </div>

            <h2 class="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span class="text-[#FF007F]">📄</span> Kazınan Ham İçerik
            </h2>
            
            <div class="bg-[#0a0a0a] rounded-xl border border-gray-800 p-6 overflow-y-auto max-h-[600px] shadow-inner">
                <pre class="text-gray-300 font-mono text-sm whitespace-pre-wrap leading-relaxed">{safe_content}</pre>
            </div>
            
            <div class="mt-6 flex justify-end">
                <button onclick="window.print()" class="bg-[#FF007F]/20 text-[#FF007F] border border-[#FF007F]/50 px-6 py-2 rounded-lg font-medium hover:bg-[#FF007F] hover:text-white transition-all shadow-[0_0_15px_rgba(255,0,127,0.2)] hover:shadow-[0_0_25px_rgba(255,0,127,0.4)] flex items-center gap-2">
                    🖨️ Raporu Yazdır / PDF Kaydet
                </button>
            </div>
        </div>
    </div>
</body>
</html>"""
            html_filepath = os.path.join(crawl_dir, f"{safe_name}_deep_crawl.html")
            with open(html_filepath, 'w', encoding='utf-8') as f:
                f.write(html_content)
                
            yield f"> İşlem Tamamlandı. Veriler kaydedildi.\n"
            yield f"REPORT_URL:http://localhost:8080/static/deep_crawl/{safe_name}_deep_crawl.html\n"
            yield "DONE"
            
        except Exception as e:
            traceback.print_exc()
            yield f"\n> HATA OLUŞTU: {str(e)}\n"
            yield "DONE"

    return StreamingResponse(generate(), media_type="text/plain")

@router.post("/analyze-crawl")
async def analyze_crawl(req: AnalyzeCrawlRequest):
    try:
        crawl_dir = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'deep_crawl')
        safe_name = "".join([c if c.isalnum() else "_" for c in req.company_name]).strip("_")
        filepath = os.path.join(crawl_dir, f"{safe_name}_deep_crawl.json")
        
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Bu firma için kazınmış veri bulunamadı. Önce Deep Crawl yapın.")
            
        with open(filepath, 'r', encoding='utf-8') as f:
            saved_data = json.load(f)
            
        content_text = saved_data.get("content", "")
        url = saved_data.get("url", "")
        
        prompt = f"""Lütfen aşağıdaki firmanın web sitesi içeriklerini analiz et.
Firma Adı: {req.company_name}
Web Sitesi URL'si: {url}

Web Sitesi İçeriği:
{content_text}

Senden Beklenen:
1. Bu işletme ne iş yapıyor? (Kısa özet)
2. Web sitesinin gördüğün eksikleri neler? (Örn: İletişim bilgisi eksik, hizmetler tam anlatılmamış vs.)
3. Biz bu firmaya ne gibi dijital pazarlama/web tasarım hizmetleri satabiliriz? Satış için nasıl bir açılış cümlesi kuralım?

Lütfen Markdown formatında, net ve profesyonel bir rapor çıkar."""

        response = llm_client.chat.completions.create(
            model="local-model", # LM studio defaults to loaded model
            messages=[
                {"role": "system", "content": "Sen profesyonel bir dijital pazarlama ve SEO analistisin."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
        )
        
        ai_response = response.choices[0].message.content
        return {"success": True, "report": ai_response}
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-pitch")
async def generate_pitch(req: GeneratePitchRequest):
    try:
        prompt = f"""Aşağıdaki firmanın şu an bir web sitesi bulunmuyor. Bu işletmeye dijital dünyada var olmalarının önemini anlatan, onlara web sitesi ve dijital pazarlama hizmetleri satmayı hedefleyen kısa, samimi ve ikna edici bir "Soğuk Satış Mesajı" (Cold Outreach) yaz.
        
Firma Adı: {req.company_name}
Sektör/Arama Kelimesi: {req.industry}

Mesajı e-posta veya WhatsApp üzerinden gönderebilecek şekilde hazırla. Müşteriyi sıkma, fayda odaklı ol. Konuyu çok uzatma."""

        response = llm_client.chat.completions.create(
            model="local-model",
            messages=[
                {"role": "system", "content": "Sen usta bir dijital satış uzmanısın. Soğuk mesajlarda yüksek dönüşüm oranları elde ediyorsun."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
        )
        
        ai_response = response.choices[0].message.content
        return {"success": True, "pitch": ai_response}
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
