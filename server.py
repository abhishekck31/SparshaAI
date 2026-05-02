from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
import time

app = FastAPI()

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "gemma:2b"

class InferRequest(BaseModel):
    prompt: str

@app.get("/")
def root():
    return {"status": "running"}

@app.post("/infer")
async def infer(req: InferRequest):
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(
                OLLAMA_URL,
                json={"model": MODEL, "prompt": req.prompt, "stream": False},
            )
        res.raise_for_status()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Ollama is not running on localhost:11434")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Ollama error: {e.response.text}")

    output = res.json().get("response", "")
    return {
        "response": output,
        "latency_ms": int((time.time() - start) * 1000)
    }
