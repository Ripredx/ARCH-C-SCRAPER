import asyncio
import json
import os
from datetime import datetime
from scrapling import StealthyFetcher

class HarvesterService:
    def __init__(self, log_queue: asyncio.Queue):
        self.log_queue = log_queue
        # Ensure outputs directory exists
        os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'outputs'), exist_ok=True)

    async def log(self, message: str):
        """Helper to send logs to the websocket queue."""
        await self.log_queue.put(message)

    async def scrape(self, source: str, keywords: str, location: str, limit: int):
        await self.log(f"> Initializing Scrapling StealthyFetcher for {source}...")
        
        # Determine the search URL based on source
        query = f"{keywords} {location}".strip().replace(" ", "+")
        
        if source == "google_maps":
            search_url = f"https://www.google.com/maps/search/{query}"
            await self.log(f"> Target generated for Maps: {search_url}")
        else:
            search_url = f"https://html.duckduckgo.com/html/?q={query}"
            await self.log(f"> Target generated for Search: {search_url}")

        await self.log(f"> Setting limit to max {limit} results to prevent over-scraping.")
        
        try:
            await self.log("> Fetching page (this might take a moment)...")
            loop = asyncio.get_running_loop()
            
            def fetch_page():
                import sys
                import asyncio
                if sys.platform == 'win32':
                    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

                def send_log(msg):
                    # Thread-safe logging to the asyncio queue
                    asyncio.run_coroutine_threadsafe(self.log(msg), loop)

                extracted_data = []

                def maps_action(page):
                    import time
                    
                    # 1. Network Logs: Track requests to show background activity
                    # Sadece onemli istekleri logla (resim/font spamini onlemek icin)
                    def log_request(request):
                        if request.resource_type in ['document', 'fetch', 'xhr']:
                            url_short = request.url[:60] + "..." if len(request.url) > 60 else request.url
                            send_log(f"> Ağ (Network): Yükleniyor [{request.resource_type}] {url_short}")
                            
                    page.on('request', log_request)
                    
                    send_log("> Checking for Google consent form...")
                    try:
                        # Attempt to click accept if standard consent dialog appears
                        consent_btn = page.locator("button:has-text('Accept all'), button:has-text('Tümünü kabul et')").first
                        if consent_btn.is_visible(timeout=3000):
                            send_log("> Found consent popup, accepting...")
                            consent_btn.click()
                            page.wait_for_timeout(2000)
                    except Exception:
                        pass # Ignore if no consent form

                    send_log("> Waiting for maps results to load...")
                    page.wait_for_timeout(5000)

                    send_log("> Results loaded. Starting auto-scroll...")
                    
                    last_count = 0
                    retries = 0
                    start_time = time.time()
                    collected_urls = []
                    
                    while len(collected_urls) < limit and retries < 3:
                        # 3. Timeout Warning
                        elapsed = int(time.time() - start_time)
                        if elapsed > 15:
                            send_log(f"> Uyarı: Google Haritalar yanıt vermekte gecikiyor, bekleniyor ({elapsed} sn)...")
                            
                        elements = page.locator('a').all()
                        
                        for el in elements:
                            try:
                                href = el.get_attribute("href")
                                if href and "/maps/place/" in href and href not in collected_urls:
                                    collected_urls.append(href)
                            except Exception:
                                pass
                        
                        current_count = len(collected_urls)
                        
                        # 2. Scrolling & Pagination Logs
                        send_log(f"> Sayfa aşağı kaydırılıyor... Şu ana kadar {current_count}/{limit} mekan linki bulundu.")
                        if current_count >= limit:
                            break
                            
                        if current_count == last_count:
                            retries += 1
                        else:
                            retries = 0
                            
                        last_count = current_count
                        
                        try:
                            # Scroll the feed role element
                            feed = page.locator('div[role="feed"]').first
                            if feed.count() > 0:
                                feed.hover()
                                page.mouse.wheel(0, 5000)
                            else:
                                page.keyboard.press('PageDown')
                        except Exception:
                            page.keyboard.press('PageDown')
                            
                        # Wait for new elements to load
                        page.wait_for_timeout(2000)
                        
                    send_log("> Auto-scroll complete. Kaydedilen linkler ziyaret edilecek...")
                    # Remove event listener to avoid memory leaks during heavy navigation
                    page.remove_listener('request', log_request)
                    
                    collected_urls = collected_urls[:limit]
                    
                    for i, url in enumerate(collected_urls):
                        send_log(f"> İşletme detayları çekiliyor ({i+1}/{len(collected_urls)})...")
                        try:
                            page.goto(url, wait_until="domcontentloaded")
                            page.wait_for_selector('h1', timeout=10000)
                            page.wait_for_timeout(1500) # Give it a moment to render buttons
                            
                            title = None
                            try:
                                loc = page.locator('h1').first
                                if loc.count() > 0: title = loc.text_content().strip()
                            except Exception: pass
                            
                            address = None
                            try:
                                loc = page.locator('button[data-item-id="address"]').first
                                if loc.count() > 0: address = loc.text_content().strip()
                            except Exception: pass
                            
                            phone = None
                            try:
                                loc = page.locator('button[data-item-id^="phone:tel:"]').first
                                if loc.count() > 0: phone = loc.text_content().strip()
                            except Exception: pass
                            
                            website = None
                            try:
                                loc = page.locator('a[data-item-id="authority"]').first
                                if loc.count() > 0: website = loc.get_attribute('href')
                            except Exception: pass
                            
                            menu = None
                            try:
                                loc = page.locator('a[data-item-id="menu"]').first
                                if loc.count() > 0:
                                    menu = loc.get_attribute('href')
                                else:
                                    loc_fb = page.locator('a:has-text("Menü"), a:has-text("Menu")').first
                                    if loc_fb.count() > 0: menu = loc_fb.get_attribute('href')
                            except Exception: pass
                            
                            extracted_data.append({
                                "title": title,
                                "url": url,
                                "address": address,
                                "phone": phone,
                                "website": website,
                                "menu_link": menu,
                                "type": "map_detail"
                            })
                            send_log(f"> ✓ Başarılı: {title}")
                        except Exception as e:
                            send_log(f"> X Hata ({url[:20]}...): {str(e)}")
                            extracted_data.append({
                                "title": None,
                                "url": url,
                                "address": None,
                                "phone": None,
                                "website": None,
                                "menu_link": None,
                                "type": "map_detail",
                                "error": "Sayfa yüklenemedi"
                            })
                            
                    return page

                # Headless stealthy fetch
                fetcher = StealthyFetcher()
                try:
                    if source == "google_maps":
                        fetcher.fetch(search_url, page_action=maps_action)
                        return extracted_data
                    else:
                        return fetcher.fetch(search_url)
                finally:
                    # Clean up the browser process to prevent memory leaks and zombie processes
                    if hasattr(fetcher, 'stop'):
                        try: fetcher.stop() 
                        except: pass
                    elif hasattr(fetcher, 'close'):
                        try: fetcher.close()
                        except: pass
                        
                    # Force delete and garbage collection as a fallback
                    del fetcher
                    import gc
                    gc.collect()

            results_or_page = await asyncio.to_thread(fetch_page)
            
            results = []
            
            if source == "google_maps":
                results = results_or_page
                await self.log(f"> Success: Extracted {len(results)} detailed map profiles.")
            else:
                page = results_or_page
                await self.log(f"> Page retrieved. Status code: {page.status}")
                # DuckDuckGo HTML parser
                results_elements = page.css(".result__body")
                for index, res in enumerate(results_elements):
                    if index >= limit:
                        break
                    title_elem = res.css_first(".result__title .result__a")
                    snippet_elem = res.css_first(".result__snippet")
                    
                    if title_elem:
                        title = title_elem.text.strip()
                        href = title_elem.attrib.get("href", "")
                        snippet = snippet_elem.text.strip() if snippet_elem else ""
                        results.append({"title": title, "url": href, "snippet": snippet})
            
            await self.log(f"> Success: Parsed {len(results)} results from the page.")
            
            # Save to JSON
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"raw_data_{source}_{timestamp}.json"
            filepath = os.path.join(os.path.dirname(__file__), '..', 'outputs', filename)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump({"query": query, "source": source, "limit": limit, "results": results}, f, ensure_ascii=False, indent=2)
                
            await self.log(f"> Saved raw data to outputs/{filename}")
            
            # Auto-refine pipeline step
            await self.log(f"> Otomatik Refiner (Veri Rafinerisi) tetikleniyor...")
            try:
                from services.refiner import generate_html_report
                raw_data = {"query": query, "source": source, "limit": limit, "results": results}
                _, refiner_msg = generate_html_report(raw_data, filename)
                for line in refiner_msg.split('\n'):
                    await self.log(line)
            except Exception as ref_err:
                await self.log(f"> Refiner error: {str(ref_err)}")
                
            await self.log("> Scraping and refining pipeline completed.")
            await self.log("[DONE]")
            
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print("Scraper error:", error_trace)
            await self.log(f"> Error during scraping: {str(e)}\n{error_trace}")
            await self.log("[DONE]")
