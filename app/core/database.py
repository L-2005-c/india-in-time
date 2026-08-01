import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Catch the URL provided by Render's environment
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql+psycopg://pumba:securepassword@localhost:5432/trip_tastic"
)

# Production Patch: Render provides 'postgres://' but SQLAlchemy requires 'postgresql://'
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
