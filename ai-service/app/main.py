from fastapi import FastAPI

from app.routers import helmet

app = FastAPI(title="KavachAI AI Service", version="1.0.0")
app.include_router(helmet.router)


@app.get("/health")
def health():
    return {"status": "ok"}