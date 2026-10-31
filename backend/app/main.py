import logging

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from urllib.parse import urlparse, urljoin, urlunparse
import requests
import socket
import ipaddress

from bs4 import BeautifulSoup

from app.database import engine, Base, get_db
from app import models, schemas


# Create database tables
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="Digital Dark Spot API",
    description="Shinchan's Mystery Files - AI Research Platform",
    version="1.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://shinchan-mystery-files-frontend.onrender.com",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "Shinchan's Mystery Files API is running!",
        "status": "success"
    }


@app.get("/api/health")
def health():
    return {"status": "healthy"}


# Create investigation
@app.post(
    "/api/investigations",
    response_model=schemas.InvestigationResponse
)
def create_investigation(
    data: schemas.InvestigationCreate,
    db: Session = Depends(get_db)
):
    investigation = models.Investigation(
        title=data.title,
        question=data.question
    )

    db.add(investigation)
    db.commit()
    db.refresh(investigation)

    return investigation


# Get all investigations
@app.get(
    "/api/investigations",
    response_model=list[schemas.InvestigationResponse]
)
def get_investigations(db: Session = Depends(get_db)):
    return db.query(models.Investigation).order_by(
        models.Investigation.id.desc()
    ).all()


# Delete an investigation and its associated evidence sources
@app.delete("/api/investigations/{investigation_id}")
def delete_investigation(
    investigation_id: int,
    db: Session = Depends(get_db)
):
    investigation = db.query(models.Investigation).filter(
        models.Investigation.id == investigation_id
    ).first()

    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")

    try:
        # Remove child records first so deletion works even without ORM cascade settings.
        db.query(models.EvidenceSource).filter(
            models.EvidenceSource.investigation_id == investigation_id
        ).delete(synchronize_session=False)

        db.delete(investigation)
        db.commit()
        return {
            "message": "Investigation deleted successfully",
            "investigation_id": investigation_id
        }
    except Exception:
        db.rollback()
        logger.exception("Failed to delete investigation %s", investigation_id)
        raise HTTPException(status_code=500, detail="Unable to delete investigation")


# Validate public website addresses
def validate_public_url(url):
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(400, "Only HTTP and HTTPS URLs are allowed")

    try:
        addresses = socket.getaddrinfo(
            parsed.hostname, None, type=socket.SOCK_STREAM
        )

        if not addresses:
            raise ValueError("No address found")

        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if not ip.is_global:
                raise ValueError("Private address")

    except Exception:
        raise HTTPException(
            400,
            "Website address is invalid or not publicly accessible"
        )


# Extract readable website content
def extract_website_content(url):
    current_url = url

    for attempt in range(4):
        validate_public_url(current_url)

        try:
            response = requests.get(
                current_url,
                headers={
                    "User-Agent": "ShinchansMysteryFiles/1.0"
                },
                timeout=15,
                allow_redirects=False
            )
        except requests.RequestException:
            raise HTTPException(400, "Unable to access this website")

        if response.is_redirect:
            if attempt == 3:
                raise HTTPException(400, "Too many website redirects")

            location = response.headers.get("Location")
            if not location:
                raise HTTPException(400, "Invalid website redirect")

            current_url = urljoin(current_url, location)
            continue

        if response.status_code >= 400:
            raise HTTPException(
                400,
                f"Website returned HTTP {response.status_code}"
            )

        content_type = response.headers.get("Content-Type", "")

        if "text/html" not in content_type.lower():
            raise HTTPException(
                400,
                "This URL is not an HTML webpage. PDF support will be added next."
            )

        if len(response.content) > 5_000_000:
            raise HTTPException(400, "Website is too large to process")

        soup = BeautifulSoup(response.text, "html.parser")

        for element in soup([
            "script", "style", "nav", "footer",
            "header", "noscript", "svg"
        ]):
            element.decompose()

        title = soup.title.get_text(strip=True) if soup.title else urlparse(current_url).netloc

        text = soup.get_text(separator=" ", strip=True)

        if len(text) < 50:
            raise HTTPException(
                400,
                "Not enough readable text found on this webpage"
            )

        return title, text[:50000], current_url

    raise HTTPException(400, "Unable to follow website redirects")


def normalize_source_url(url: str) -> str:
    """
    Normalize URLs for duplicate checking.
    Keeps query parameters, removes fragments, lowercases the host,
    removes default ports, and treats a trailing slash as optional.
    """
    parsed = urlparse(url.strip())
    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower()

    if not hostname:
        return url.strip()

    port = parsed.port
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        netloc = f"{hostname}:{port}"
    else:
        netloc = hostname

    path = parsed.path.rstrip("/") or "/"
    return urlunparse((
        scheme,
        netloc,
        path,
        "",
        parsed.query,
        ""
    ))


# Add evidence source
@app.post(
    "/api/investigations/{investigation_id}/sources",
    response_model=schemas.EvidenceSourceResponse
)
def add_evidence_source(
    investigation_id: int,
    data: schemas.EvidenceSourceCreate,
    db: Session = Depends(get_db)
):
    investigation = db.query(models.Investigation).filter(
        models.Investigation.id == investigation_id
    ).first()

    if not investigation:
        raise HTTPException(404, "Investigation not found")

    url = str(data.url)
    requested_normalized = normalize_source_url(url)

    # Check existing evidence before downloading the webpage again.
    existing_sources = db.query(models.EvidenceSource).filter(
        models.EvidenceSource.investigation_id == investigation_id
    ).all()

    for existing in existing_sources:
        if normalize_source_url(existing.url) == requested_normalized:
            raise HTTPException(
                status_code=409,
                detail="This website has already been added to this investigation."
            )

    title, extracted_text, final_url = extract_website_content(url)

    # Also check the final URL after redirects, because different input URLs
    # can redirect to the same canonical webpage.
    final_normalized = normalize_source_url(final_url)
    for existing in existing_sources:
        if normalize_source_url(existing.url) == final_normalized:
            raise HTTPException(
                status_code=409,
                detail="This website redirects to a source that is already in this investigation."
            )

    source = models.EvidenceSource(
        investigation_id=investigation_id,
        url=final_url,
        title=title,
        extracted_text=extracted_text,
        status="Collected"
    )

    try:
        db.add(source)
        db.commit()
        db.refresh(source)
        return source
    except Exception:
        db.rollback()
        raise HTTPException(500, "Unable to save evidence source")


# Get sources for an investigation
@app.get(
    "/api/investigations/{investigation_id}/sources",
    response_model=list[schemas.EvidenceSourceResponse]
)
def get_evidence_sources(
    investigation_id: int,
    db: Session = Depends(get_db)
):
    investigation = db.query(models.Investigation).filter(
        models.Investigation.id == investigation_id
    ).first()

    if not investigation:
        raise HTTPException(404, "Investigation not found")

    return db.query(models.EvidenceSource).filter(
        models.EvidenceSource.investigation_id == investigation_id
    ).all()


# Gemini AI configuration
import json
import os

from dotenv import load_dotenv
from google import genai
from google.genai import types

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load variables from backend/.env
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


@app.post("/api/investigations/{investigation_id}/analyze")
def analyze_investigation(
    investigation_id: int,
    db: Session = Depends(get_db)
):
    """
    Analyse the collected evidence sources using Gemini.
    Returns research gaps, conflicting claims, potentially outdated details,
    and a verification checklist.
    """
    investigation = db.query(models.Investigation).filter(
        models.Investigation.id == investigation_id
    ).first()

    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")

    sources = db.query(models.EvidenceSource).filter(
        models.EvidenceSource.investigation_id == investigation_id
    ).all()

    if not sources:
        raise HTTPException(
            status_code=400,
            detail="Add at least one evidence source before running analysis."
        )

    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Gemini API key is missing. Add GEMINI_API_KEY to your backend .env file and restart the server."
        )

    # Keep the request within a reasonable size while including multiple sources.
    source_sections = []
    remaining_chars = 100000

    for source in sources:
        if remaining_chars <= 0:
            break

        content = (source.extracted_text or "")[:remaining_chars]
        remaining_chars -= len(content)

        source_sections.append(
            f"SOURCE ID: {source.id}\n"
            f"TITLE: {source.title or 'Untitled'}\n"
            f"URL: {source.url}\n"
            f"EXTRACTED CONTENT:\n{content}"
        )

    evidence_text = "\n\n--- NEXT SOURCE ---\n\n".join(source_sections)

    prompt = f"""
You are a careful research evidence analyst for Shinchan's Mystery Files.

INVESTIGATION TITLE:
{investigation.title}

RESEARCH QUESTION:
{investigation.question}

COLLECTED SOURCES:
{evidence_text}

Analyse ONLY the supplied source content in relation to the research question.
Do not invent facts, dates, quotations, sources, or citations.
Distinguish clearly between a confirmed finding and something that needs checking.
If the sources do not provide enough evidence, say so.

Return valid JSON only, with exactly these top-level keys:
{{
  "summary": "A short overview of what the sources establish and what remains uncertain.",
  "missing_information": [
    {{
      "gap": "What information is missing",
      "why_it_matters": "Why it matters to the research question",
      "source_ids": [1],
      "suggested_check": "What evidence should be collected next"
    }}
  ],
  "conflicting_claims": [
    {{
      "claim_a": "First claim, accurately paraphrased",
      "claim_b": "Second claim, accurately paraphrased",
      "source_ids": [1, 2],
      "explanation": "How the claims differ and what needs verification"
    }}
  ],
  "potentially_outdated": [
    {{
      "information": "The specific information that may be outdated",
      "source_ids": [1],
      "reason": "Evidence in the supplied text that makes it potentially outdated",
      "verification_needed": "What current information should be checked"
    }}
  ],
  "verification_checklist": [
    {{
      "task": "A concrete verification task",
      "reason": "Why this task is needed",
      "source_ids": [1]
    }}
  ]
}}

Use empty arrays when no supported items are found. Do not label information outdated
only because a page has no visible date. If publication/update dates are absent, state
that the date could not be confirmed. Every source_ids value must refer to an ID listed
in the supplied source material. Do not add markdown fences around the JSON.
"""

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2
            )
        )

        if not response.text:
            raise ValueError("Gemini returned an empty response")

        analysis_result = json.loads(response.text)

        expected_keys = [
            "summary",
            "missing_information",
            "conflicting_claims",
            "potentially_outdated",
            "verification_checklist"
        ]

        for key in expected_keys:
            if key not in analysis_result:
                analysis_result[key] = [] if key != "summary" else ""

        return {
            "investigation_id": investigation_id,
            "investigation_title": investigation.title,
            "model": GEMINI_MODEL,
            "sources_analysed": len(source_sections),
            "analysis": analysis_result
        }

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="Gemini returned an invalid analysis format. Please try again."
        )
    except Exception as exc:
        # Print the full traceback in the backend terminal for debugging.
        # Do not log the API key or request headers.
        logger.exception("Gemini analysis failed (%s): %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Gemini analysis failed: {type(exc).__name__}. Check the backend terminal for details."
        )
