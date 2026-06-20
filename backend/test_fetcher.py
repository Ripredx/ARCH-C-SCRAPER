import asyncio
import re
from scrapling import StealthyFetcher

def fetch_url():
    fetcher = StealthyFetcher()
    def action(page):
        page.wait_for_timeout(2000)
        return page
    response = fetcher.fetch('https://ekremorhan.com.tr/', page_action=action)
    body_text = response.body
    if isinstance(body_text, bytes):
        body_text = body_text.decode('utf-8', errors='replace')
    text = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', body_text, flags=re.IGNORECASE|re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()

async def main():
    text = await asyncio.to_thread(fetch_url)
    print('Len:', len(text))

if __name__ == "__main__":
    import sys
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())
