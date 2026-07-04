import os
import uuid
import json
import datetime
import pdfplumber
from gtts import gTTS
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

app = FastAPI(
    title="PDF to Audiobook Converter",
    description="Convert PDF documents into structured, high-quality MP3 audiobooks.",
    version="4.0.0",
)

# CORS — allow all origins for demo / Vercel hosting
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory setup
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
is_vercel = os.environ.get("VERCEL") == "1"
WRITE_DIR = "/tmp" if is_vercel else BASE_DIR

UPLOAD_DIR = os.path.join(WRITE_DIR, "uploads")
AUDIO_DIR = os.path.join(WRITE_DIR, "audio")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

CATALOG_FILE = os.path.join(WRITE_DIR, "catalog.json")

# Mount static files for the frontend
STATIC_DIR = os.path.join(BASE_DIR, "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
async def read_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/api/health")
async def health_check():
    """Simple liveness probe used by monitoring and Vercel."""
    return {"status": "ok", "version": "4.0.0"}


# ---------------------------------------------------------------------------
# Catalog helpers
# ---------------------------------------------------------------------------

def get_catalog() -> list:
    if not os.path.exists(CATALOG_FILE):
        return []
    try:
        with open(CATALOG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_catalog(catalog: list) -> None:
    with open(CATALOG_FILE, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=4)


def add_to_catalog(job_id: str, original_filename: str) -> None:
    catalog = get_catalog()
    entry = {
        "job_id": job_id,
        "filename": original_filename,
        "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "audio_url": f"/api/audio/{job_id}",
    }
    catalog.insert(0, entry)
    save_catalog(catalog)


# ---------------------------------------------------------------------------
# Catalog endpoints
# ---------------------------------------------------------------------------

@app.get("/api/catalog")
async def fetch_catalog():
    return get_catalog()


class RenameRequest(BaseModel):
    new_name: str


@app.put("/api/catalog/{job_id}")
async def rename_catalog_item(job_id: str, req: RenameRequest):
    new_name = req.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty.")
    catalog = get_catalog()
    for item in catalog:
        if item["job_id"] == job_id:
            item["filename"] = new_name
            save_catalog(catalog)
            return {"message": "Renamed successfully"}
    raise HTTPException(status_code=404, detail="Item not found in catalog.")


@app.delete("/api/catalog/{job_id}")
async def delete_catalog_item(job_id: str):
    catalog = get_catalog()
    new_catalog = [item for item in catalog if item["job_id"] != job_id]

    if len(catalog) == len(new_catalog):
        raise HTTPException(status_code=404, detail="Item not found in catalog.")

    save_catalog(new_catalog)

    # Try to delete the associated audio file
    audio_path = os.path.join(AUDIO_DIR, f"{job_id}.mp3")
    if os.path.exists(audio_path):
        try:
            os.remove(audio_path)
        except Exception as e:
            print(f"Warning: could not delete audio file {audio_path}: {e}")

    return {"message": "Deleted successfully"}


# ---------------------------------------------------------------------------
# Text extraction & TTS helpers
# ---------------------------------------------------------------------------

def is_eligible_text(text: str) -> bool:
    """Return True only if the text has enough alphabetic content to be spoken."""
    if not text.strip():
        return False
    text_no_spaces = text.replace(" ", "").replace("\n", "")
    if not text_no_spaces:
        return False
    alpha_ratio = sum(1 for c in text_no_spaces if c.isalpha()) / len(text_no_spaces)
    return alpha_ratio >= 0.40


def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract readable body text from a PDF using pdfplumber.

    Strategy: use word-level font-size analysis to exclude tiny footnote/header
    text and inject sentence breaks before large headings.
    """
    extracted_pages = []

    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                words = page.extract_words(extra_attrs=["size"])
                if not words:
                    continue

                sizes = sorted(w["size"] for w in words)
                body_size = sizes[len(sizes) // 2]  # median font size

                valid_words = []
                for w in words:
                    if w["size"] < body_size * 0.8:
                        continue  # skip tiny text (page numbers, footnotes)
                    # Insert a period before headings to create a natural pause
                    if (
                        w["size"] >= body_size * 1.5
                        and valid_words
                        and not valid_words[-1].endswith(".")
                    ):
                        valid_words.append(".")
                    valid_words.append(w["text"])

                page_text = " ".join(valid_words)
                if page_text:
                    extracted_pages.append(page_text)

    except Exception as e:
        print(f"Error reading PDF: {e}")
        raise ValueError("Failed to extract text from the PDF. The file may be corrupted or password-protected.")

    final_text = "\n\n".join(extracted_pages).replace("\n", " ").strip()
    return final_text


async def text_to_speech(text: str, output_path: str) -> None:
    """Convert text to MP3 using gTTS (runs in a thread to avoid blocking)."""
    try:
        def _generate():
            tts = gTTS(text=text, lang="en", slow=False)
            tts.save(output_path)

        await asyncio.to_thread(_generate)
    except Exception as e:
        print(f"TTS error: {e}")
        raise ValueError(f"Text-to-speech conversion failed: {e}")


# ---------------------------------------------------------------------------
# Convert endpoint
# ---------------------------------------------------------------------------

@app.post("/api/convert")
async def convert_pdf_to_audio(file: UploadFile = File(...)):
    # Validate file type
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Read and validate file size
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

    job_id = str(uuid.uuid4())
    pdf_path = os.path.join(UPLOAD_DIR, f"{job_id}.pdf")
    audio_path = os.path.join(AUDIO_DIR, f"{job_id}.mp3")

    # Save PDF
    try:
        with open(pdf_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")

    # Extract text
    try:
        text = extract_text_from_pdf(pdf_path)
    except ValueError as e:
        _safe_remove(pdf_path)
        raise HTTPException(status_code=500, detail=str(e))

    if not text:
        _safe_remove(pdf_path)
        raise HTTPException(status_code=400, detail="No extractable text found in this PDF.")

    if not is_eligible_text(text):
        _safe_remove(pdf_path)
        raise HTTPException(
            status_code=400,
            detail=(
                "This PDF contains too much math, code, or non-readable content "
                "to be properly converted to speech."
            ),
        )

    # Convert to speech
    try:
        await text_to_speech(text, audio_path)
    except ValueError as e:
        _safe_remove(pdf_path)
        raise HTTPException(status_code=500, detail=str(e))

    # Catalog entry
    add_to_catalog(job_id, file.filename or "Untitled.pdf")

    # Clean up PDF
    _safe_remove(pdf_path)

    return {
        "job_id": job_id,
        "audio_url": f"/api/audio/{job_id}",
        "message": "Conversion successful",
    }


@app.get("/api/audio/{job_id}")
async def get_audio(job_id: str):
    # Basic sanitation — job_id should be a UUID
    if not all(c in "0123456789abcdef-" for c in job_id.lower()):
        raise HTTPException(status_code=400, detail="Invalid job ID.")
    audio_path = os.path.join(AUDIO_DIR, f"{job_id}.mp3")
    if not os.path.exists(audio_path):
        raise HTTPException(
            status_code=404,
            detail="Audio file not found. It may have expired or been deleted.",
        )
    return FileResponse(audio_path, media_type="audio/mpeg", filename=f"{job_id}.mp3")


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _safe_remove(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"Warning: could not remove temp file {path}: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
