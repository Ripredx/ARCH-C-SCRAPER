from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import harvester, forge

app = FastAPI(title="Arch/C Scraping Engine API", description="Backend API for Arch/C Scraping and LLM Processing")

# CORS Settings
origins = [
    "http://localhost:5173", # Vite React default
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
import os

app.include_router(harvester.router)
app.include_router(forge.router)

outputs_dir = os.path.join(os.path.dirname(__file__), 'outputs')
if not os.path.exists(outputs_dir):
    os.makedirs(outputs_dir)
app.mount("/static", StaticFiles(directory=outputs_dir), name="static")

@app.get("/")
async def root():
    return {"message": "Arch/C Scraping Engine API is running. Go to /docs for Swagger UI."}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
