FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create a non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Set up cron job to run at 9 PM PST daily
RUN echo "0 21 * * * /usr/local/bin/python /app/main.py" > /tmp/crontab
RUN crontab /tmp/crontab

CMD ["python", "main.py"]
