from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import chess
import chess.engine
import os
from typing import Dict, Optional, Any

app = FastAPI()

# Configure CORS to allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define path to Stockfish binary
STOCKFISH_PATH = os.path.join(os.path.dirname(__file__), "stockfish", "stockfish")

# Global variable to store current ELO rating
current_elo = 1500

# Models for request/response
class MoveRequest(BaseModel):
    fen: str
    user_move: str

class MoveResponse(BaseModel):
    bot_move: str
    fen: str
    evaluation: Dict[str, Any]

class EloRequest(BaseModel):
    elo: int

class EloResponse(BaseModel):
    status: str
    elo: int

class NewGameResponse(BaseModel):
    fen: str
    status: str

# Initialize the engine
def get_engine():
    try:
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        # Some Stockfish builds enforce a minimum Elo (e.g., 1320). Try to configure; if it fails,
        # fall back to enabling limit strength without setting UCI_Elo and simulate weaker play later.
        try:
            engine.configure({"UCI_LimitStrength": True, "UCI_Elo": current_elo})
        except chess.engine.EngineError:
            # Fallback: enable limit strength but don't set UCI_Elo
            engine.configure({"UCI_LimitStrength": True})
        return engine
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Stockfish engine not found. Check installation.")

@app.post("/move", response_model=MoveResponse)
async def make_move(move_request: MoveRequest):
    # Parse the current FEN string
    try:
        board = chess.Board(move_request.fen)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN string")
    
    # Parse and validate user move
    try:
        user_move = chess.Move.from_uci(move_request.user_move)
        if user_move not in board.legal_moves:
            raise HTTPException(status_code=400, detail=f"Illegal move: {move_request.user_move} in position {board.fen()}")
        
        # Make the user's move
        board.push(user_move)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid move format: {move_request.user_move}, error: {str(e)}")
    
    # Check if game is over after user move
    if board.is_game_over():
        return MoveResponse(
            bot_move="",
            fen=board.fen(),
            evaluation={"type": "game_over", "result": board.result()}
        )
    
    # Get bot's response move
    engine = get_engine()
    try:
        # Use a short depth for responsiveness
        limit = chess.engine.Limit(depth=10)

        # For normal elos, ask engine for best move
        if current_elo >= 1320:
            result = engine.play(board, limit)
            bot_move = result.move
        else:
            # Simulate weaker play: evaluate each legal move shallowly and pick a suboptimal one
            legal = list(board.legal_moves)
            scores = []
            for mv in legal:
                board.push(mv)
                try:
                    info = engine.analyse(board, chess.engine.Limit(depth=6))
                    sc = None
                    if "score" in info:
                        s = info["score"].relative
                        sc = s.score() if not s.is_mate() else (100000 if s.mate() > 0 else -100000)
                    else:
                        sc = 0
                except Exception:
                    sc = 0
                scores.append((mv, sc))
                board.pop()

            # sort moves by descending score (best first)
            scores.sort(key=lambda x: x[1], reverse=True)
            # Introduce randomness: pick an index biased toward worse moves for lower ELO
            import random
            n = len(scores)
            # bias factor: higher for lower elo -> pick worse moves more often
            bias = max(1.0, (1320 - current_elo) / 200.0)
            # pick using weighted probability where weight = 1 / (rank^bias)
            weights = []
            for idx in range(n):
                weight = 1.0 / ((idx + 1) ** bias)
                weights.append(weight)
            # normalize
            ssum = sum(weights)
            probs = [w / ssum for w in weights]
            # choose index
            idx = random.choices(range(n), weights=probs, k=1)[0]
            bot_move = scores[idx][0]

        # Calculate evaluation
        try:
            info = engine.analyse(board, chess.engine.Limit(depth=10))
        except Exception:
            info = {}

        evaluation = {}
        if info and "score" in info:
            score = info["score"].relative
            if score.is_mate():
                evaluation = {"type": "mate", "moves": score.mate()}
            else:
                evaluation = {"type": "cp", "value": score.score() / 100.0}

        # Make the bot's move
        board.push(bot_move)

        return MoveResponse(
            bot_move=bot_move.uci(),
            fen=board.fen(),
            evaluation=evaluation
        )
    finally:
        engine.quit()

@app.post("/set-elo", response_model=EloResponse)
async def set_elo(elo_request: EloRequest):
    global current_elo
    
    # Validate ELO range
    if elo_request.elo < 800 or elo_request.elo > 2600:
        raise HTTPException(status_code=400, detail="ELO must be between 800 and 2600")
    
    current_elo = elo_request.elo
    return EloResponse(status="ok", elo=current_elo)

@app.post("/new-game", response_model=NewGameResponse)
async def new_game():
    # Return the starting position FEN
    starting_fen = chess.Board().fen()
    return NewGameResponse(fen=starting_fen, status="ok")

# Add a health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
