"""
Sahayak.AI Backend Agent Bridge & Supabase Gateway Server
Securely reads Supabase & Ollama configuration from .env file.
Run with:
    pip install fastapi uvicorn httpx pydantic python-dotenv supabase
    python sahayak_server.py
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import httpx
import json
from dotenv import load_dotenv

# Load credentials securely from .env
load_dotenv()

app = FastAPI(title="Sahayak.AI Backend API & Agent Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

class WhatsAppRequest(BaseModel):
    user_text: str
    inventory: list
    store_settings: Optional[dict] = {}

class BillOCRRequest(BaseModel):
    ocr_text: str

class AnalyticsRequest(BaseModel):
    bills: list
    products: list

async def call_ollama(prompt: str, system_prompt: str = "", json_format: bool = True):
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
    }
    if json_format:
        payload["format"] = "json"

    endpoint = f"{OLLAMA_HOST}/api/chat"
    async with httpx.AsyncClient(timeout=90.0) as client:
        try:
            res = await client.post(endpoint, json=payload)
            res.raise_for_status()
            data = res.json()
            return data["message"]["content"]
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Ollama server error at {endpoint}: {str(e)}")

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "ollama_host": OLLAMA_HOST,
        "ollama_model": OLLAMA_MODEL,
        "supabase_connected": bool(SUPABASE_URL and "supabase" in SUPABASE_URL)
    }

# Agent 1: WhatsApp Customer Sales & Order Ingestion Agent
@app.post("/api/agent/whatsapp")
async def whatsapp_agent(req: WhatsAppRequest):
    settings = req.store_settings or {}
    is_open = settings.get("is_shop_open", True)
    open_time = settings.get("opening_time", "07:00 AM")
    close_time = settings.get("closing_time", "10:30 PM")

    if not is_open:
        closed_msg = settings.get("closed_message", "Dukan abhi band hai. Subah khulegi.")
        return {
            "intent": "general",
            "replyMessage": f"Namaste! 🙏 Dukan abhi band hai. Timings: {open_time} se {close_time}. {closed_msg}",
            "items": [],
            "requiresPaymentChoice": False
        }

    system = f"""
You are the automated WhatsApp Kirana Sales Agent for {settings.get('shop_name', 'Kirana Store')}.
Shop Timings: {open_time} to {close_time}.
Inventory items available: {json.dumps(req.inventory)}

Extract customer items or answer price queries in friendly Hinglish.
Output ONLY JSON matching:
{{
  "intent": "order" | "price_query" | "general",
  "replyMessage": "Polite friendly message in Hinglish",
  "items": [
    {{"matchedProductId": "id", "matchedProductName": "name", "requestedQuantity": 5, "unit": "kg"}}
  ]
}}
"""
    raw_response = await call_ollama(f"Customer message: {req.user_text}", system_prompt=system)
    return json.loads(raw_response)

# Agent 2: Wholesale Bill Parser
@app.post("/api/agent/parse-bill")
async def invoice_agent(req: BillOCRRequest):
    system = """
You are an Indian Kirana Wholesale Distributor Invoice Extraction Agent.
Extract item name, wholesale price, quantity, and unit into valid JSON:
{
  "vendor": "Name of distributor",
  "items": [
    {"itemName": "Atta 10kg", "wholesalePrice": 360, "quantity": 10, "unit": "packet"}
  ]
}
"""
    raw_response = await call_ollama(f"Invoice text:\n{req.ocr_text}", system_prompt=system)
    return json.loads(raw_response)

# Agent 3: Restock & Stock Velocity Forecasting
@app.post("/api/agent/analytics")
async def analytics_agent(req: AnalyticsRequest):
    system = """
You are the Inventory Intelligence Agent for a Kirana shopkeeper.
Analyze bills and current stock to identify:
1. Fast-moving items requiring immediate purchase.
2. Slow-moving items.
3. 2 actionable business tips.
Output ONLY JSON:
{
  "highVelocity": [{"itemName": "Atta", "reason": "Low buffer"}],
  "slowMoving": [{"itemName": "Soap", "reason": "Low sales"}],
  "actionableTips": ["Tip 1", "Tip 2"]
}
"""
    prompt = f"Stock: {json.dumps(req.products)}\nBills: {json.dumps(req.bills)}"
    raw_response = await call_ollama(prompt, system_prompt=system)
    return json.loads(raw_response)

# Supabase Server-side proxy for Products
@app.get("/api/db/products")
async def get_products():
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"data": [], "source": "local"}
    async with httpx.AsyncClient() as client:
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        res = await client.get(f"{SUPABASE_URL}/rest/v1/products?select=*", headers=headers)
        return {"data": res.json() if res.status_code == 200 else [], "source": "supabase"}

# Supabase Server-side proxy for Invoices
@app.post("/api/db/bills")
async def save_bill(bill_payload: dict):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"success": True, "saved_locally": True}
    async with httpx.AsyncClient() as client:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        res = await client.post(f"{SUPABASE_URL}/rest/v1/bills", json=bill_payload, headers=headers)
        return {"success": res.status_code in [200, 201]}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"Sahayak.AI Backend Server started on http://localhost:{port} (Configured from .env)")
    uvicorn.run(app, host=host, port=port)
