FROM python:3.11-slim

WORKDIR /code

# Install system dependencies required for Geo-Informatics processing
RUN apt-get update && apt-get install -y libpq-dev gcc

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ./app /code/app

# Bind to 0.0.0.0 so Render can successfully route traffic
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
