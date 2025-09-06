FROM python:3.9-slim

WORKDIR /app

# Install stockfish
RUN apt-get update && \
    apt-get install -y stockfish && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create stockfish directory and symlink the stockfish binary
RUN mkdir -p /app/stockfish && \
    ln -s /usr/games/stockfish /app/stockfish/stockfish

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose the port
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
