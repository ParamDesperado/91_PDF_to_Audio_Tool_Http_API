# 🎧 PDF to Audiobook Converter

> Convert any PDF document into a structured, high-quality MP3 audiobook — right in your browser.

[![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel&logoColor=white)](https://vercel.com)

---

## ✨ Features

- **Smart PDF Extraction** — Uses `pdfplumber` with font-size analysis to intelligently skip page numbers, headers, and footnotes, while inserting natural pauses before headings.
- **Math & Gibberish Detection** — Rejects PDFs that are dominated by equations, code, or unreadable characters before wasting time on conversion.
- **Premium Audio Player** — Glassmorphic UI with Play/Pause, Reset, ±10s Skip, and variable Playback Speed (0.75×–2×).
- **Persistent Library** — Auto-saves every generated audiobook. Rename, delete, or replay from your in-browser Library.
- **Download MP3** — Download any generated audiobook directly to your device.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI |
| PDF Parsing | pdfplumber |
| Text-to-Speech | gTTS (Google Text-to-Speech) |
| Frontend | Vanilla HTML5, CSS3, JavaScript |
| Hosting | Vercel (Serverless) |

---

## 🚀 Local Development

### Prerequisites
- Python 3.11+
- pip

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME

# 2. Create and activate a virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the development server
python main.py
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## ☁️ Deploy to Vercel

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/YOUR_REPO_NAME)

### Manual deploy

```bash
# Install the Vercel CLI
npm i -g vercel

# Deploy
vercel
```

> **Note**: Vercel Serverless Functions have a 60-second timeout. Very large PDFs (100+ pages) may exceed this. For unrestricted processing, consider deploying to [Railway](https://railway.app) or [Render](https://render.com).

---

## 📁 Project Structure

```
.
├── main.py              # FastAPI application
├── requirements.txt     # Python dependencies
├── vercel.json          # Vercel deployment config
└── static/
    ├── index.html       # Frontend SPA
    ├── style.css        # Styles (glassmorphism, animations)
    └── script.js        # Client-side logic
```

---

## ⚠️ License & Usage Terms

**Created by Param Sangani**

This project is the exclusive intellectual property of Param Sangani.
- **DO NOT** clone, replicate, distribute, or host this project without explicit written permission.
- **DO NOT** use the source code for your own commercial projects.
- Personal, educational, and portfolio review is permitted.

---

*Built with ❤️ using Python, FastAPI, pdfplumber, gTTS, and Vanilla HTML/CSS/JS.*
