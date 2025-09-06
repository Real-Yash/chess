import { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import axios from 'axios';

// API base URL: prefer Vite env var VITE_API_BASE_URL, otherwise fall back to the current host and port 8001.
// Note: using 0.0.0.0 is only valid for server bind addresses; clients must use a routable IP or hostname.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8001`;

function App() {
  // State
  const [game, setGame] = useState(new Chess());
  // Initialize to starting FEN to avoid empty board flashes on slow devices
  const [fen, setFen] = useState(new Chess().fen());
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [checkSquare, setCheckSquare] = useState(null);
  const [botElo, setBotElo] = useState(1500);
  const [status, setStatus] = useState('Ready to play! You are white.');
  const [evaluation, setEvaluation] = useState({ type: 'cp', value: 0 });
  const [isLoading, setIsLoading] = useState(false);

  // Initialize game
  useEffect(() => {
    newGame();
  }, []);

  // Start a new game
  const newGame = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/new-game`);
      const newFen = response.data.fen;
      
      const newGame = new Chess(newFen);
      setGame(newGame);
      setFen(newFen);
      // compute check square
      if (newGame.in_check && newGame.in_check()) {
        // find king square of side in check (side to move)
        const color = newGame.turn();
        const files = ['a','b','c','d','e','f','g','h'];
        let ksq = null;
        for (let r = 8; r >= 1; r--) {
          for (let f of files) {
            const sq = f + r;
            const p = newGame.get(sq);
            if (p && p.type === 'k' && p.color === color) {
              ksq = sq;
              break;
            }
          }
          if (ksq) break;
        }
        setCheckSquare(ksq);
      } else {
        setCheckSquare(null);
      }
      setStatus('New game started! You are playing as white.');
      setEvaluation({ type: 'cp', value: 0 });
    } catch (error) {
      console.error('Error starting new game:', error);
      setStatus('Error starting new game. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Debug: log fen changes for diagnosis
  useEffect(() => {
    console.log('[DEBUG] FEN changed ->', fen);
  }, [fen]);

  // Change bot ELO rating
  const changeBotElo = async (newElo) => {
    const eloValue = parseInt(newElo, 10);
    setBotElo(eloValue);
    
    try {
      await axios.post(`${API_BASE_URL}/set-elo`, { elo: eloValue });
      setStatus(`Bot ELO set to ${eloValue}`);
    } catch (error) {
      console.error('Error setting ELO:', error);
      setStatus(`Error setting ELO. ${error.response?.data?.detail || ''}`);
    }
  };

  // Format evaluation for display
  const formatEvaluation = useCallback(() => {
    if (evaluation.type === 'cp') {
      const value = evaluation.value;
      return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
    } else if (evaluation.type === 'mate') {
      const moves = evaluation.moves;
      return `Mate in ${Math.abs(moves)}`;
    } else if (evaluation.type === 'game_over') {
      return `Game over: ${evaluation.result}`;
    }
    return 'Even';
  }, [evaluation]);

  // Calculate evaluation bar percentage
  const calculateEvaluationBarPercentage = useCallback(() => {
    if (evaluation.type === 'cp') {
      // Convert centipawn value to percentage (from -5 to +5 mapped to 0% to 100%)
      const value = evaluation.value;
      const percentage = 50 + (Math.min(Math.max(value, -5), 5) / 10) * 100;
      return `${Math.min(Math.max(percentage, 0), 100)}%`;
    } else if (evaluation.type === 'mate') {
      // If it's a mate, show 0% or 100% depending on who's getting mated
      return evaluation.moves > 0 ? '100%' : '0%';
    }
    return '50%'; // Default to even
  }, [evaluation]);

  // Handle piece move
  const onDrop = async (sourceSquare, targetSquare) => {
    if (isLoading) return false;
    
    // Store the original position before making the move
    const originalFen = game.fen();
    
    // Check if the move is legal
    try {
      // Create the move string first
      const moveUci = sourceSquare + targetSquare;
      
      // Make a local move to validate
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q', // always promote to queen for simplicity
      });

      // If move is invalid
      if (move === null) return false;
      
      // Update the FEN locally to show the user's move
      setFen(game.fen());
      
      // Send move to server
      setIsLoading(true);
      setStatus('Thinking...');
      
      try {
        const response = await axios.post(`${API_BASE_URL}/move`, {
          fen: originalFen, // Send the position BEFORE the move
          user_move: moveUci
        });
        
        // Update with bot's response
        const { fen: newFen, bot_move, evaluation: newEvaluation } = response.data;
        
        // Update game state
        const updatedGame = new Chess(newFen);
        setGame(updatedGame);
        setFen(newFen);
        setEvaluation(newEvaluation);
        // compute check square for updated position
        if (updatedGame.in_check && updatedGame.in_check()) {
          const color = updatedGame.turn();
          const files = ['a','b','c','d','e','f','g','h'];
          let ksq = null;
          for (let r = 8; r >= 1; r--) {
            for (let f of files) {
              const sq = f + r;
              const p = updatedGame.get(sq);
              if (p && p.type === 'k' && p.color === color) {
                ksq = sq;
                break;
              }
            }
            if (ksq) break;
          }
          setCheckSquare(ksq);
        } else {
          setCheckSquare(null);
        }
        
        // Update status message
        if (updatedGame.isGameOver()) {
          if (updatedGame.isCheckmate()) {
            setStatus('Checkmate! ' + (updatedGame.turn() === 'w' ? 'Black' : 'White') + ' wins!');
          } else if (updatedGame.isDraw()) {
            setStatus(`Game over: Draw! ${updatedGame.isStalemate() ? 'Stalemate' : updatedGame.isThreefoldRepetition() ? 'Threefold repetition' : 'Insufficient material'}`);
          }
        } else {
          setStatus(`Bot moved ${bot_move}. ${updatedGame.isCheck() ? 'Check!' : ''}`);
        }
      } catch (error) {
        console.error('Error making move:', error);
        const errorDetail = error.response?.data?.detail || 'Failed to communicate with the server';
        setStatus(`Error: ${errorDetail}`);
        console.log('Full error response:', error.response?.data);
        
        // Reset the game to the original position
        const newGame = new Chess(originalFen);
        setGame(newGame);
        setFen(newGame.fen());
      } finally {
        setIsLoading(false);
      }
      
      return true;
    } catch (error) {
      console.error('Move error:', error);
      return false;
    }
  };

  // Show legal moves when clicking a square
  const onSquareClick = (square) => {
    if (isLoading) return;
    // If a source selected and clicking a target that is legal, perform move
    if (selectedSquare) {
      const from = selectedSquare;
      const to = square;
      // attempt drop
      onDrop(from, to);
      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }

    // Otherwise select square and show legal targets
    const moves = game.moves({ square, verbose: true });
    const targets = moves.map(m => m.to);
    setSelectedSquare(square);
    setLegalTargets(targets);
  };

  return (
    <div className="chessboard-container">
      <h1>Chess vs Stockfish</h1>
      
      <div className="chess-board">
        <Chessboard
          position={fen}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick}
          boardOrientation="white"
          customBoardStyle={{
            borderRadius: '5px',
            boxShadow: '0 5px 15px rgba(0, 0, 0, 0.5)',
          }}
          customSquareStyles={{
            ...(selectedSquare ? { [selectedSquare]: { background: 'rgba(100,108,255,0.35)' } } : {}),
            ...legalTargets.reduce((acc, sq) => ({ ...acc, [sq]: { background: 'rgba(100,255,150,0.35)' } }), {}),
            ...(checkSquare ? { [checkSquare]: { background: 'rgba(255,0,0,0.45)' } } : {}),
          }}
          areArrowsAllowed={true}
        />
      </div>
      
      <div className="controls">
        <div className="control-row">
          <select 
            value={botElo} 
            onChange={(e) => changeBotElo(e.target.value)}
            disabled={isLoading}
          >
            <option value="800">Beginner (ELO 800)</option>
            <option value="1200">Casual (ELO 1200)</option>
            <option value="1500">Intermediate (ELO 1500)</option>
            <option value="1800">Club Player (ELO 1800)</option>
            <option value="2200">Expert (ELO 2200)</option>
            <option value="2500">Master (ELO 2500)</option>
          </select>
          
          <button onClick={newGame} disabled={isLoading}>
            New Game
          </button>
        </div>
        
        <div className="evaluation">
          <span>Evaluation: {formatEvaluation()}</span>
          <div className="evaluation-bar">
            <div 
              className="evaluation-fill" 
              style={{ width: calculateEvaluationBarPercentage() }}
            ></div>
          </div>
        </div>
      </div>
      
      <div style={{ maxWidth: 400, margin: '10px auto', color: '#ccc', textAlign: 'left' }}>
        <div style={{ fontSize: 12 }}>API: {API_BASE_URL}</div>
        <div style={{ fontSize: 12 }}>FEN: {fen}</div>
        <div style={{ fontSize: 12 }}>Pieces on board: {game.board().flat().filter(Boolean).length}</div>
      </div>
      
      <div className="status">
        <div>{status}</div>
        <pre>FEN: {fen}</pre>
      </div>
    </div>
  );
}

export default App;
