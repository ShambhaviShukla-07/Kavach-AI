from pydantic import BaseModel, ConfigDict, Field


class HelmetFeatures(BaseModel):
    peak_accel_g: float = Field(ge=0, le=50)
    mean_accel_g: float = Field(ge=0, le=50)
    std_accel_g: float = Field(ge=0, le=50)
    peak_gyro_dps: float = Field(ge=0, le=5000)
    mean_gyro_dps: float = Field(ge=0, le=5000)
    jerk_g_s: float = Field(ge=0, le=5000)
    impact_duration_ms: float = Field(ge=0, le=10000)
    post_impact_stillness: float = Field(ge=0, le=50)


class HelmetPredictRequest(BaseModel):
    device_id: str = Field(min_length=1, max_length=80)
    features: HelmetFeatures


class HelmetPredictResponse(BaseModel):
    # Pydantic reserves names starting with "model_", but the API contract
    # uses model_version. Disable that protected namespace for this schema.
    model_config = ConfigDict(protected_namespaces=())

    is_crash: bool
    confidence: float
    severity: str
    model_version: str
    reasons: list[str]