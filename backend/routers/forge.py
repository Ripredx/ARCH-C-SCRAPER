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
        outputs_dir = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'harvester_raw')
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
        outputs_dir = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'llm_reports')
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
        filepath = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'harvester_raw', filename)
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
        filepath = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'llm_reports', report_filename)
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
        filepath = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'harvester_raw', request.filename)
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

@router.get("/all-files")
async def list_all_files():
    try:
        base_dir = os.path.join(os.path.dirname(__file__), '..', 'outputs')
        
        harvester_raw_dir = os.path.join(base_dir, 'harvester_raw')
        llm_reports_dir = os.path.join(base_dir, 'llm_reports')
        deep_crawl_dir = os.path.join(base_dir, 'deep_crawl')
        
        def get_sorted_files(directory, pattern):
            if not os.path.exists(directory):
                return []
            files = glob.glob(os.path.join(directory, pattern))
            files = [os.path.basename(f) for f in files]
            files.sort(reverse=True)
            return files
            
        return {
            "harvester_raw": get_sorted_files(harvester_raw_dir, "*.json"),
            "llm_reports": get_sorted_files(llm_reports_dir, "*.html"),
            "deep_crawl_reports": get_sorted_files(deep_crawl_dir, "*.html")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/content/{category}/{filename}")
async def get_content(category: str, filename: str):
    valid_categories = ["harvester_raw", "llm_reports", "deep_crawl_reports"]
    if category not in valid_categories:
        raise HTTPException(status_code=400, detail="Invalid category")
        
    actual_dir = "deep_crawl" if category.startswith("deep_crawl") else category
        
    try:
        filepath = os.path.join(os.path.dirname(__file__), '..', 'outputs', actual_dir, filename)
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="File not found")
            
        if filepath.endswith('.json'):
            with open(filepath, 'r', encoding='utf-8') as f:
                return {"type": "json", "content": json.dumps(json.load(f), indent=2, ensure_ascii=False)}
        else:
            with open(filepath, 'r', encoding='utf-8') as f:
                return {"type": "html", "content": f.read()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/deep-crawl")
async def deep_crawl_and_analyze(req: DeepCrawlRequest):
    try:
        from bs4 import BeautifulSoup
        from scrapling import Fetcher
        
        fetcher = Fetcher()
        page = fetcher.get(req.url)
        body_text = page.text
        
        soup = BeautifulSoup(body_text, 'html.parser')
        
        title = soup.title.string if soup.title else "Başlık Bulunamadı"
        meta_desc = ""
        desc_tag = soup.find('meta', attrs={'name': 'description'})
        if desc_tag and desc_tag.get('content'):
            meta_desc = desc_tag['content']
            
        sections = []
        for tag in soup.find_all(['h1', 'h2', 'h3', 'p', 'li']):
            text = tag.get_text(strip=True)
            if not text or len(text) < 3: continue
            if tag.name in ['h1', 'h2', 'h3']:
                sections.append({"type": "heading", "level": tag.name, "text": text})
            elif tag.name == 'p':
                sections.append({"type": "paragraph", "text": text})
            elif tag.name == 'li':
                sections.append({"type": "list_item", "text": text})
                
        crawl_dir = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'deep_crawl')
        os.makedirs(crawl_dir, exist_ok=True)
        safe_name = "".join([c if c.isalnum() else "_" for c in req.company_name]).strip("_")
        html_filepath = os.path.join(crawl_dir, f"{safe_name}_deep_crawl.html")
        
        sections_html = ""
        for sec in sections:
            if sec['type'] == 'heading':
                size = "text-2xl" if sec['level'] == 'h1' else "text-xl" if sec['level'] == 'h2' else "text-lg"
                color = "text-[#FF007F]" if sec['level'] == 'h1' else "text-[#00FFFF]" if sec['level'] == 'h2' else "text-white"
                sections_html += f"<div class='mt-6 mb-3 font-bold {size} {color}'>{sec['text']}</div>\n"
            elif sec['type'] == 'paragraph':
                sections_html += f"<p class='text-gray-300 text-sm mb-4 leading-relaxed'>{sec['text']}</p>\n"
            elif sec['type'] == 'list_item':
                sections_html += f"<li class='text-gray-400 text-sm ml-4 mb-2 list-disc'>{sec['text']}</li>\n"

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
            </div>
            
            <div class="bg-[#111] border border-gray-800 rounded-lg p-5 mb-8">
                <h3 class="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Sayfa Meta Bilgileri</h3>
                <div class="mb-2"><span class="text-[#00FFFF] font-semibold">Title:</span> <span class="text-gray-300">{title}</span></div>
                <div><span class="text-[#FF007F] font-semibold">Description:</span> <span class="text-gray-300">{meta_desc or "Belirtilmemiş"}</span></div>
            </div>

            <h2 class="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span class="text-[#FF007F]">📄</span> Ayıklanan İçerik
            </h2>
            
            <div class="bg-[#0a0a0a] rounded-xl border border-gray-800 p-6 overflow-y-auto max-h-[600px] shadow-inner">
                {sections_html}
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
        with open(html_filepath, 'w', encoding='utf-8') as f:
            f.write(html_content)
            
        return {"success": True, "message": "Site başarıyla kazındı ve veriler HTML formatında kaydedildi.", "html_file": html_filepath}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class AnalyzeCrawlRequest(BaseModel):
    company_name: str

@router.post("/deep-crawl-stream")
async def deep_crawl_stream(req: DeepCrawlRequest):
    async def generate():
        yield f"> Deep Crawl başlatılıyor: {req.company_name}\n"
        yield f"> Hedef Adres: {req.url}\n"
        import asyncio
        await asyncio.sleep(0.5)
        yield "> Tarayıcı motoru başlatılıyor (Camoufox)...\n"
        
        try:
            def fetch_url():
                import sys
                import asyncio
                if sys.platform == 'win32':
                    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
                    
                from bs4 import BeautifulSoup
                from camoufox.sync_api import Camoufox
                
                with Camoufox(headless=True, block_images=True, i_know_what_im_doing=True) as browser:
                    context = browser.new_context(ignore_https_errors=True)
                    page = context.new_page()
                    page.goto(req.url, referer="https://www.google.com/")
                    page.wait_for_load_state("domcontentloaded")
                    page.wait_for_timeout(2000)
                    body_text = page.content()
                    
                if isinstance(body_text, bytes):
                    body_text = body_text.decode('utf-8', errors='replace')
                    
                soup = BeautifulSoup(body_text, 'html.parser')
                title = soup.title.string if soup.title else "Başlık Bulunamadı"
                meta_desc = ""
                desc_tag = soup.find('meta', attrs={'name': 'description'})
                if desc_tag and desc_tag.get('content'):
                    meta_desc = desc_tag['content']
                    
                sections = []
                for tag in soup.find_all(['h1', 'h2', 'h3', 'p', 'li']):
                    text = tag.get_text(strip=True)
                    if not text or len(text) < 3: continue
                    if tag.name in ['h1', 'h2', 'h3']:
                        sections.append({"type": "heading", "level": tag.name, "text": text})
                    elif tag.name == 'p':
                        sections.append({"type": "paragraph", "text": text})
                    elif tag.name == 'li':
                        sections.append({"type": "list_item", "text": text})
                        
                return {"title": title, "meta_desc": meta_desc, "sections": sections}
                
            yield "> Sayfaya bağlanılıyor ve içerik yapısal olarak çekiliyor...\n"
            extracted_data = await asyncio.to_thread(fetch_url)
            
            yield f"> İçerik başarıyla çekildi ve arşivlendi.\n"
            yield "> Görsel rapor için HTML dosyası oluşturuluyor...\n"
            await asyncio.sleep(0.2)
            
            import os
            crawl_dir = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'deep_crawl')
            os.makedirs(crawl_dir, exist_ok=True)
            safe_name = "".join([c if c.isalnum() else "_" for c in req.company_name]).strip("_")
            html_filepath = os.path.join(crawl_dir, f"{safe_name}_deep_crawl.html")
            
            sections_html = ""
            for sec in extracted_data['sections']:
                if sec['type'] == 'heading':
                    size = "text-2xl" if sec['level'] == 'h1' else "text-xl" if sec['level'] == 'h2' else "text-lg"
                    color = "text-[#FF007F]" if sec['level'] == 'h1' else "text-[#00FFFF]" if sec['level'] == 'h2' else "text-white"
                    sections_html += f"<div class='mt-6 mb-3 font-bold {size} {color}'>{sec['text']}</div>\n"
                elif sec['type'] == 'paragraph':
                    sections_html += f"<p class='text-gray-300 text-sm mb-4 leading-relaxed'>{sec['text']}</p>\n"
                elif sec['type'] == 'list_item':
                    sections_html += f"<li class='text-gray-400 text-sm ml-4 mb-2 list-disc'>{sec['text']}</li>\n"

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
            </div>
            
            <div class="bg-[#111] border border-gray-800 rounded-lg p-5 mb-8">
                <h3 class="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Sayfa Meta Bilgileri</h3>
                <div class="mb-2"><span class="text-[#00FFFF] font-semibold">Title:</span> <span class="text-gray-300">{extracted_data['title']}</span></div>
                <div><span class="text-[#FF007F] font-semibold">Description:</span> <span class="text-gray-300">{extracted_data['meta_desc'] or "Belirtilmemiş"}</span></div>
            </div>

            <h2 class="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span class="text-[#FF007F]">📄</span> Ayıklanan İçerik
            </h2>
            
            <div class="bg-[#0a0a0a] rounded-xl border border-gray-800 p-6 overflow-y-auto max-h-[600px] shadow-inner">
                {sections_html}
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
            with open(html_filepath, 'w', encoding='utf-8') as f:
                f.write(html_content)
                
            yield f"> İşlem Tamamlandı. Veriler kaydedildi.\n"
            yield f"REPORT_URL:http://localhost:8080/static/deep_crawl/{safe_name}_deep_crawl.html\n"
            yield "DONE"
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            error_str = str(e)
            if "NS_ERROR_UNKNOWN_HOST" in error_str:
                yield f"\n> HATA OLUŞTU: Web sitesine ulaşılamıyor (NS_ERROR_UNKNOWN_HOST). Site kapalı veya adres yanlış olabilir.\n"
            elif "Timeout" in error_str:
                yield f"\n> HATA OLUŞTU: Sayfanın yüklenmesi çok uzun sürdü (Zaman aşımı).\n"
            else:
                yield f"\n> HATA OLUŞTU: {error_str}\n"
            yield "DONE"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(generate(), media_type="text/plain")

@router.post("/analyze-crawl")
async def analyze_crawl(req: AnalyzeCrawlRequest):
    try:
        crawl_dir = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'deep_crawl')
        safe_name = "".join([c if c.isalnum() else "_" for c in req.company_name]).strip("_")
        filepath = os.path.join(crawl_dir, f"{safe_name}_deep_crawl.html")
        
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Bu firma için HTML raporu bulunamadı. Önce Deep Crawl yapın.")
            
        with open(filepath, 'r', encoding='utf-8') as f:
            html_data = f.read()
            
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html_data, 'html.parser')
        
        # Remove head and style tags before extracting text
        for s in soup(["script", "style", "head", "title", "meta"]):
            s.extract()
            
        content_text = soup.get_text(separator=' ', strip=True)
        
        if len(content_text) > 20000:
            content_text = content_text[:20000]
        
        prompt = f"""Lütfen aşağıdaki firmanın web sitesi içeriklerini analiz et.
Firma Adı: {req.company_name}

Web Sitesi İçeriği:
{content_text}

Senden Beklenen:
1. Bu işletme ne iş yapıyor? (Kısa özet)
2. Web sitesinin gördüğün eksikleri neler? (Örn: İletişim bilgisi eksik, hizmetler tam anlatılmamış vs.)
3. Biz bu firmaya ne gibi dijital pazarlama/web tasarım hizmetleri satabiliriz? Satış için nasıl bir açılış cümlesi kuralım?

Lütfen Markdown formatında, net ve profesyonel bir rapor çıkar."""

        response = llm_client.chat.completions.create(
            model="local-model",
            messages=[
                {"role": "system", "content": "Sen profesyonel bir dijital pazarlama ve SEO analistisin."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
        )
        
        ai_response = response.choices[0].message.content
        return {"success": True, "report": ai_response}
        
    except Exception as e:
        import traceback
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
