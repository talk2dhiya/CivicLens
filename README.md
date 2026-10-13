# CivicLens
AI-powered civic issue reporting, prioritisation, and resolution platform.

CivicLens helps residents report local civic infrastructure issues (potholes, water leaks, garbage overflow, broken streetlights) and assists municipal departments in prioritizing, routing, and verifying resolutions.

---

## Project Structure

```text
CivicLens/
├── frontend/             # React web application (Vite)
├── backend/              # FastAPI backend API
├── models/               # Model weights and artifacts
│   ├── vision/           # Computer vision models (e.g. damage detection)
│   ├── text/             # NLP models (e.g. duplicate detection)
│   └── prediction/       # Hotspot & predictive analytics models
├── datasets/             # Dataset documentation and raw data
│   └── README.md
├── notebooks/            # Jupyter notebooks for experimentation
├── results/              # Evaluation outputs, metrics, and logs
├── requirements.txt      # Root Python dependencies
└── README.md
```

---

## Getting Started

### 1. Backend (FastAPI)

1. Set up and activate a Python virtual environment:
   ```bash
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the development server:
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```
4. Check the API at `http://127.0.0.1:8000` (Docs available at `http://127.0.0.1:8000/docs`).

---

### 2. Frontend (React + Vite)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Access the web app at `http://localhost:5173`.
