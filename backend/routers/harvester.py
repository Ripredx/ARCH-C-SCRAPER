import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, BackgroundTasks
from pydantic import BaseModel
from services.scraper import HarvesterService

router = APIRouter(prefix="/api/harvester", tags=["harvester"])

# Global log queue to pass messages from background task to websocket
log_queue = asyncio.Queue()

class ScrapeRequest(BaseModel):
    keywords: str
    location: str
    source: str = "google_maps"
    limit: int = 10

@router.post("/start")
async def start_scraping(request: ScrapeRequest, background_tasks: BackgroundTasks):
    # Clear the queue from previous runs (simple MVP approach)
    while not log_queue.empty():
        try:
            log_queue.get_nowait()
        except asyncio.QueueEmpty:
            break
            
    # Initialize the service with the queue
    service = HarvesterService(log_queue)
    
    # Run the scrape in the background
    background_tasks.add_task(
        service.scrape, 
        source=request.source, 
        keywords=request.keywords, 
        location=request.location, 
        limit=request.limit
    )
    
    return {"status": "accepted", "message": "Scraping process started in background."}

@router.websocket("/logs")
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Wait for a new log message
            message = await log_queue.get()
            if message == "[DONE]":
                await websocket.close()
                break
            await websocket.send_text(message)
    except WebSocketDisconnect:
        print("Client disconnected from logs.")
    except Exception as e:
        print(f"WebSocket error: {e}")
