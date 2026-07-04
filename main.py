import os
import uuid
import json
import datetime
import pdfplumber
from gtts import gTTS
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
import asyncio

app = FastAPI(title="PDF to Audiobook Converter V4")

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

@app.get("/")
async def read_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

def get_catalog():
    if not os.path.exists(CATALOG_FILE):
        return []
    try:
        with open(CATALOG_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_catalog(catalog):
    with open(CATALOG_FILE, "w") as f:
        json.dump(catalog, f, indent=4)

def add_to_catalog(job_id, original_filename):
    catalog = get_catalog()
    entry = {
        "job_id": job_id,
        "filename": original_filename,
        "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "audio_url": f"/api/audio/{job_id}"
    }
    catalog.insert(0, entry)
    save_catalog(catalog)

@app.get("/api/catalog")
async def fetch_catalog():
    return get_catalog()

class RenameRequest(BaseModel):
    new_name: str

@app.put("/api/catalog/{job_id}")
async def rename_catalog_item(job_id: str, req: RenameRequest):
    catalog = get_catalog()
    for item in catalog:
        if item["job_id"] == job_id:
            item["filename"] = req.new_name
            save_catalog(catalog)
            return {"message": "Renamed successfully"}
    raise HTTPException(status_code=404, detail="Item not found in catalog")

@app.delete("/api/catalog/{job_id}")
async def delete_catalog_item(job_id: str):
    catalog = get_catalog()
    new_catalog = [item for item in catalog if item["job_id"] != job_id]
    
    if len(catalog) == len(new_catalog):
        raise HTTPException(status_code=404, detail="Item not found in catalog")
        
    save_catalog(new_catalog)
    
    # Try to delete the actual audio file
    audio_path = os.path.join(AUDIO_DIR, f"{job_id}.mp3")
    if os.path.exists(audio_path):
        try:
            os.remove(audio_path)
        except Exception as e:
            print(f"Failed to delete audio file: {e}")
            
    return {"message": "Deleted successfully"}


def is_eligible_text(text: str) -> bool:
    if not text.strip():
        return False
        
    text_no_spaces = text.replace(" ", "").replace("\n", "")
    if len(text_no_spaces) == 0:
        return False

    alpha_count = sum(1 for char in text_no_spaces if char.isalpha())
    alpha_ratio = alpha_count / len(text_no_spaces)
    
    if alpha_ratio < 0.40:
        return False
        
    return True

def extract_text_from_pdf(file_path: str) -> str:
    extracted_text = []
    
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                words = page.extract_words(extra_attrs=["size"])
                if not words:
                    continue
                
                sizes = [w["size"] for w in words]
                if not sizes:
                    continue
                
                sizes.sort()
                body_size = sizes[len(sizes) // 2]
                
                valid_words = []
                for w in words:
                    if w["size"] >= body_size * 0.8:
                        if w["size"] >= body_size * 1.5 and len(valid_words) > 0 and not valid_words[-1].endswith("."):
                            valid_words.append(".") 
                        valid_words.append(w["text"])
                
                page_text = " ".join(valid_words)
                if page_text:
                    extracted_text.append(page_text)
                    
    except Exception as e:
        print(f"Error reading PDF: {e}")
        raise ValueError("Failed to extract text from PDF")
    
    final_text = "\n\n".join(extracted_text)
    final_text = final_text.replace("\n", " ").strip()
    return final_text

async def text_to_speech(text: str, output_path: str):
    try:
        def _generate():
            tts = gTTS(text=text, lang="en", slow=False)
            tts.save(output_path)
            
        await asyncio.to_thread(_generate)
    except Exception as e:
        print(f"Error during TTS conversion: {e}")
        raise ValueError(f"TTS Conversion failed: {e}")

@app.post("/api/convert")
async def convert_pdf_to_audio(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    job_id = str(uuid.uuid4())
    pdf_path = os.path.join(UPLOAD_DIR, f"{job_id}.pdf")
    audio_path = os.path.join(AUDIO_DIR, f"{job_id}.mp3")

    try:
        content = await file.read()
        with open(pdf_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    try:
        text = extract_text_from_pdf(pdf_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not text:
        raise HTTPException(status_code=400, detail="No extractable text found in the PDF.")
        
    if not is_eligible_text(text):
        try:
            os.remove(pdf_path)
        except:
            pass
        raise HTTPException(status_code=400, detail="Not eligible: This PDF contains too much math, code, or unreadable content to be properly converted to speech.")
    
    try:
        await text_to_speech(text, audio_path)
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

    # Add to catalog
    add_to_catalog(job_id, file.filename)

    # Clean up the PDF
    try:
        os.remove(pdf_path)
    except:
        pass

    return {"job_id": job_id, "audio_url": f"/api/audio/{job_id}", "message": "Conversion successful"}

@app.get("/api/audio/{job_id}")
async def get_audio(job_id: str):
    audio_path = os.path.join(AUDIO_DIR, f"{job_id}.mp3")
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found or still processing.")
    return FileResponse(audio_path, media_type="audio/mpeg", filename=f"{job_id}.mp3")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
