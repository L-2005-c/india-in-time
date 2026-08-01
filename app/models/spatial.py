from sqlalchemy import Column, Integer, String
from geoalchemy2 import Geometry
from app.core.database import Base

class Landmark(Base):
    __tablename__ = "landmarks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    architectural_style = Column(String)
    
    # PostGIS geometry column for precise regional spatial routing
    location = Column(Geometry(geometry_type='POINT', srid=4326))
