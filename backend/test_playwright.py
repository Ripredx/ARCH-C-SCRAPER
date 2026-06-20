import sys
import asyncio
from scrapling import StealthyFetcher

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

def action(page):
    page.wait_for_timeout(5000)
    links = page.locator('a').all()
    print(f"Total A tags: {len(links)}")
    found = 0
    for link in links:
        try:
            href = link.get_attribute("href")
            if href and ("place" in href or "maps" in href or "dir" in href):
                print(f"URL: {href[:100]}")
                found += 1
        except: pass
    print(f"Found {found} potential map links")
    return page

fetcher = StealthyFetcher()
try:
    page = fetcher.fetch("https://www.google.com/maps/search/kafe+antalya+manavgat", page_action=action)
finally:
    fetcher.close()
