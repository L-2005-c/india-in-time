from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from app.core.database import engine, Base, get_db
from app.models.spatial import Landmark
from app.services.ai_companion import generate_local_itinerary

# Bootstrap PostGIS tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Trip Tastic API", version="1.0.0")

@app.get("/")
def read_root():
    return {"status": "Production Ready", "platform": "India In Time"}

@app.get("/ai/companion")
def get_ai_guide(landmark: str = "Golconda Fort"):
    guide = generate_local_itinerary(landmark)
    return {"landmark": landmark, "guide": guide}

@app.post("/landmarks/")
def create_landmark(name: str, style: str, lon: float, lat: float, db: Session = Depends(get_db)):
    # SRID 4326 represents standard longitude/latitude coordinates for spatial tracking
    point = f"SRID=4326;POINT({lon} {lat})"
    new_landmark = Landmark(name=name, architectural_style=style, location=point)
    db.add(new_landmark)
    db.commit()
    db.refresh(new_landmark)
    return {"id": new_landmark.id, "name": new_landmark.name}
