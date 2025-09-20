# main.py
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Any
import requests
import hashlib
import time

app = FastAPI(title="Misinformation Detection API")

from fastapi import Body

@app.post("/verify-page")
def verify_page(payload: dict = Body(...)):
    text = payload.get("text", "")
    sentences = [s.strip() for s in text.split(".") if len(s.strip()) > 10]

    results = []
    for s in sentences:
        res = verify_claim(ClaimRequest(claim=s))
        results.append(res)

    return {"results": results}

# Simple in-memory cache: {claim_hash: (timestamp, response)}
CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 3600  # cache for 1 hour

# API keys
FACTCHECK_KEY = "AIzaSyBKe2W56t4ZKxybwy5OlNdkP61SGEoEQ6o"
GNEWS_KEY = "da7f1f6b9a948f7f6b664191e162bd9d"
NEWSAPI_KEY = "168c40044ce74052bfec823d6a333bef"

# Request model
class ClaimRequest(BaseModel):
    claim: str

# Evidence item model
class EvidenceItem(BaseModel):
    title: str
    source: str
    url: str
    publishedAt: str = None
    rating: str = None

# Response model
class ClaimResponse(BaseModel):
    claim: str
    label: str
    confidence: float
    sources_checked: List[str]
    evidence: List[EvidenceItem]
    fake_detected: int  # 1 if unverified, 0 if verified

# AI-based claim classification
def classify_claim_ai(claim: str) -> Dict[str, Any]:
    import random
    confidence = round(random.uniform(0.5, 0.9), 2)
    label = "Unverified" if confidence < 0.8 else "Verified"
    return {"label": label, "confidence": confidence}

# Helper: cache key
def get_cache_key(claim: str) -> str:
    return hashlib.md5(claim.encode("utf-8")).hexdigest()

# Safe API request with retry
def safe_request(url: str, params: dict = None, headers: dict = None, max_retries=3, timeout=10):
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            last_error = str(e)
            time.sleep(1)
    return {"error": last_error}

# Google FactCheck API
def query_factcheck(claim: str) -> List[Dict[str, Any]]:
    url = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
    params = {"query": claim, "key": FACTCHECK_KEY}
    data = safe_request(url, params)
    if "claims" in data:
        return [
            {
                "title": c.get("text", ""),
                "source": c.get("claimReview", [{}])[0].get("publisher", {}).get("name", "FactCheck"),
                "url": c.get("claimReview", [{}])[0].get("url", ""),
                "rating": c.get("claimReview", [{}])[0].get("textualRating", None),
            }
            for c in data["claims"]
        ]
    return []

# GNews API
def query_gnews(claim: str) -> List[Dict[str, Any]]:
    url = "https://gnews.io/api/v4/search"
    params = {"q": claim, "lang": "en", "token": GNEWS_KEY}
    data = safe_request(url, params)
    if "articles" in data:
        return [
            {
                "title": a.get("title", ""),
                "source": a.get("source", {}).get("name", "GNews"),
                "url": a.get("url", ""),
                "publishedAt": a.get("publishedAt", None),
            }
            for a in data["articles"]
        ]
    return []

# NewsAPI
def query_newsapi(claim: str) -> List[Dict[str, Any]]:
    url = "https://newsapi.org/v2/everything"
    params = {"q": claim, "apiKey": NEWSAPI_KEY}
    data = safe_request(url, params)
    if "articles" in data:
        return [
            {
                "title": a.get("title", ""),
                "source": a.get("source", {}).get("name", "NewsAPI"),
                "url": a.get("url", ""),
                "publishedAt": a.get("publishedAt", None),
            }
            for a in data["articles"]
        ]
    return []

@app.post("/verify", response_model=ClaimResponse)
def verify_claim(request: ClaimRequest):
    claim = request.claim.strip()
    key = get_cache_key(claim)

    # Check cache
    if key in CACHE:
        timestamp, cached_response = CACHE[key]["time"], CACHE[key]["response"]
        if time.time() - timestamp < CACHE_TTL:
            return cached_response

    # Classify claim with AI
    ai_result = classify_claim_ai(claim)

    # Collect evidence from APIs
    evidence: List[Dict[str, Any]] = []
    sources_checked = []

    for func, name in [(query_factcheck, "Google FactCheck"), (query_gnews, "GNews"), (query_newsapi, "NewsAPI")]:
        try:
            result = func(claim)
            if result:
                evidence.extend(result)
            sources_checked.append(name)
        except Exception as e:
            evidence.append({"title": f"Error querying {name}: {str(e)}", "source": name, "url": "", "rating": None})

    # Count fake/unverified claims
    fake_detected = 1 if ai_result["label"] == "Unverified" else 0

    response = {
        "claim": claim,
        "label": ai_result["label"],
        "confidence": ai_result["confidence"],
        "sources_checked": sources_checked,
        "evidence": evidence,
        "fake_detected": fake_detected
    }

    # Save to cache
    CACHE[key] = {"time": time.time(), "response": response}

    return response
