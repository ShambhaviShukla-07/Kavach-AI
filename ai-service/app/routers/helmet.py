from fastapi import APIRouter

from app.schemas import HelmetPredictRequest, HelmetPredictResponse
from app.services.helmet_model import predict

router = APIRouter(prefix="/helmet", tags=["helmet"])


@router.post("/predict", response_model=HelmetPredictResponse)
def predict_helmet(payload: HelmetPredictRequest):
    return predict(payload.features.model_dump())