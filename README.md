# Chess App with React and FastAPI

A full-stack chess application where users can play against a Stockfish-powered chess engine.

## Features

- Interactive chess board with drag and drop pieces
- Play against Stockfish engine with adjustable ELO (800-2600)
- Real-time evaluation display
- Game status updates
- FEN string display

## Project Structure

```
chess-app/
├── frontend/           # React Frontend
│   ├── src/
│   │   ├── App.jsx     # Main React component
│   │   ├── main.jsx    # Entry point
│   │   └── index.css   # Styles
│   ├── public/
│   └── package.json    # Frontend dependencies
├── backend/            # FastAPI Backend
│   ├── main.py         # API endpoints
│   ├── requirements.txt # Python dependencies
│   ├── Dockerfile      # For containerization
│   └── stockfish/      # Directory for Stockfish binary
```

## Setup Instructions

### Backend Setup

1. Download Stockfish binary for your platform from https://stockfishchess.org/download/
2. Place the Stockfish binary in `chess-app/backend/stockfish/` directory
3. Make sure the binary is named `stockfish` and is executable

```bash
# Navigate to backend directory
cd chess-app/backend

# Install Python dependencies
pip install -r requirements.txt

# Make Stockfish executable if needed
chmod +x stockfish/stockfish

# Run the FastAPI server
uvicorn main:app --reload
```

The backend will be available at http://localhost:8000

### Frontend Setup

```bash
# Navigate to frontend directory
cd chess-app/frontend

# Install Node.js dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at http://localhost:3000

### Configuring the frontend API base (for mobile / LAN testing)

- The frontend reads the backend base URL from `import.meta.env.VITE_API_BASE_URL`.
- Create a `.env` file in `frontend/` with a line like:

```text
VITE_API_BASE_URL=http://192.168.1.42:8001
```

- Restart Vite after changing `.env`:

```bash
npm run dev -- --host
```

- Do not set `0.0.0.0` inside the client `.env` — `0.0.0.0` is a server bind address and is not routable from browsers. Use the machine's LAN IP (e.g. `192.168.x.y`) or `localhost` for same-machine testing.

## Docker Deployment

You can use the provided Dockerfile to deploy the backend:

```bash
# Navigate to backend directory
cd chess-app/backend

# Build Docker image
docker build -t chess-app-backend .

# Run container
docker run -p 8000:8000 chess-app-backend
```

## API Endpoints

- `POST /move` - Submit a user move and get back the bot's move
- `POST /set-elo` - Set the bot's ELO rating
- `POST /new-game` - Start a new game

## Technologies Used

- **Frontend**: React, react-chessboard, chess.js, axios
- **Backend**: Python, FastAPI, python-chess, Stockfish

## Notes

- The Stockfish engine needs to be compatible with your operating system
- The frontend assumes the backend is running on the same machine at port 8000
