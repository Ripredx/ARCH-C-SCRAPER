import os
import json
import glob
from fastapi import APIRouter, HTTPException
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
        filepath = os.path.join(crawl_dir, f"{safe_name}_deep_crawl.json")
        
        saved_data = {
            "company_name": req.company_name,
            "url": req.url,
            "content": content_text
        }
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(saved_data, f, ensure_ascii=False, indent=2)
            
        return {"success": True, "message": "Site başarıyla kazındı ve veriler kaydedildi.", "saved_file": filepath}
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class AnalyzeCrawlRequest(BaseModel):
    company_name: str

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
