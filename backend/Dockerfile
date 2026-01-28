FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies with memory optimization
# Using --no-cache-dir and installing in smaller batches
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
        fastapi>=0.109.0 \
        uvicorn>=0.27.0 \
        pydantic-settings>=2.1.0 \
        python-dotenv>=1.0.0 \
        python-multipart>=0.0.6 \
        email-validator>=2.1.0 && \
    pip install --no-cache-dir \
        sqlalchemy>=2.0.25 \
        alembic>=1.13.1 \
        psycopg2-binary>=2.9.9 && \
    pip install --no-cache-dir \
        httpx>=0.26.0 \
        apscheduler>=3.10.4 \
        structlog>=24.1.0

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
