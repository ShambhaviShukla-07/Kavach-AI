
import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

def csv_env(name, default=""):
    return [v.strip() for v in os.getenv(name, default).split(",") if v.strip()]

@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./kavachai.db")
    cors_origins: list[str] = None
    bootstrap_admin_key: str = os.getenv("BOOTSTRAP_ADMIN_KEY", "")

settings = Settings(
    cors_origins=csv_env(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173"
    )
)
