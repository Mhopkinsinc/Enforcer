
import React, { useEffect, useRef, useState } from 'react';
import { Engine, DisplayMode, Color } from 'excalibur';
import { HockeyGame } from './game/HockeyGame';
import { GameState } from './types';
import { NetworkManager } from './game/NetworkManager';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HockeyGame | null>(null);
  const networkRef = useRef<NetworkManager | null>(null);

  const [gameState, setGameState] = useState<GameState>({
    p1Health: 5,
    p2Health: 5,
    p1State: 'READY',
    p2State: 'READY',
    gameOver: false,
    showGameOver: false,
    winner: null,
    isReplaying: false,
    replayProgress: 0,
    replaySpeed: 1,
    isMultiplayer: false,
    connectionStatus: 'disconnected',
    opponentDisconnected: false,
    sfxVolume: 0.15
  });

  const [menuState, setMenuState] = useState<'main' | 'host' | 'join' | 'game' | 'settings'>('main');
  const [roomId, setRoomId] = useState('');
  const [joinId, setJoinId] = useState('');

  // Initialize Engine
  useEffect(() => {
    if (!canvasRef.current) return;

    const game = new HockeyGame({
      canvasElement: canvasRef.current,
      width: 800,
      height: 400,
      displayMode: DisplayMode.Fixed,
      backgroundColor: Color.fromHex('#90fcfc'),
      pixelArt: true,
      fixedUpdateFps: 60,
      antialiasing: false
    });

    game.start().then(() => {
        // Initial setup for background/menu visuals
        game.setupGame((state) => {
            setGameState({ ...state });
        });
    });

    gameRef.current = game;

    const handleKeyDown = (e: KeyboardEvent) => {
        // Prevent restarting if opponent disconnected
        if (game.opponentDisconnected) return;

        if (!game.isReplaying && game.isGameOver && (e.key === ' ' || e.key === 'Enter')) {
            game.restartGame();
        }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if ((game as any).stop) (game as any).stop();
      if ((game as any).dispose) (game as any).dispose();
      if (networkRef.current) networkRef.current.destroy();
    };
  }, []);

  const startLocalGame = () => {
      setMenuState('game');
      if (gameRef.current) gameRef.current.restartGame();
  };

  const handleHost = async () => {
      const net = new NetworkManager();
      try {
          const id = await net.init();
          setRoomId(id);
          setMenuState('host');
          
          net.onConnection = () => {
              setMenuState('game');
              if (gameRef.current) {
                  gameRef.current.setupNetwork(net, true); // True = Host (P1)
              }
          };

          networkRef.current = net;
      } catch (e) {
          alert("Failed to connect to matchmaking server.");
      }
  };

  const handleJoin = async () => {
      if(!joinId) return;
      
      const net = new NetworkManager();
      try {
          await net.init(); // Init self to get ID
          net.connect(joinId);

          net.onConnection = () => {
              setMenuState('game');
              if (gameRef.current) {
                  gameRef.current.setupNetwork(net, false); // False = Client (P2)
              }
          };

          networkRef.current = net;
      } catch(e) {
          alert("Connection failed");
      }
  };

  const getHealthPercent = (current: number, max: number = 5) => {
    return Math.max(0, (current / max) * 100);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (gameRef.current) {
          gameRef.current.seekTo(parseFloat(e.target.value));
          gameRef.current.setPlaybackSpeed(0);
      }
  };

  const handleSpeed = (speed: number) => {
      if (gameRef.current) {
          gameRef.current.setPlaybackSpeed(speed);
      }
  };

  const toggleReplay = () => {
      if (gameRef.current) {
          gameRef.current.toggleReplay(!gameState.isReplaying);
      }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const vol = parseFloat(e.target.value);
      // Update local state immediately for UI responsiveness
      setGameState(prev => ({ ...prev, sfxVolume: vol }));
      // Update game engine
      if (gameRef.current) {
          gameRef.current.setSFXVolume(vol);
      }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen font-sans">
      <h1 className="text-4xl mb-4 text-[#e94560] drop-shadow-md font-bold">
        🏒 HOCKEY FIGHT 🥊
      </h1>

      <div className="relative">
        <canvas
            ref={canvasRef}
            id="gameCanvas"
            className="border-4 border-[#e94560] rounded-lg shadow-[0_0_30px_rgba(233,69,96,0.3)] image-pixelated"
            onContextMenu={(e) => e.preventDefault()}
        />

        {/* MENU OVERLAY */}
        {menuState !== 'game' && (
            <div className="absolute inset-0 bg-[#1a1a2e]/95 flex flex-col items-center justify-center z-20">
                {menuState === 'main' && (
                    <div className="flex flex-col gap-4 items-center">
                        <button onClick={startLocalGame} className="bg-[#4ecdc4] text-[#1a1a2e] px-8 py-3 rounded-lg font-bold text-xl hover:bg-[#3dbdb4] transition">
                            LOCAL 2 PLAYER
                        </button>
                        <div className="flex gap-4">
                            <button onClick={handleHost} className="bg-[#e94560] text-white px-6 py-2 rounded-lg font-bold hover:bg-[#d13650]">
                                HOST ONLINE
                            </button>
                            <button onClick={() => setMenuState('join')} className="bg-[#16213e] border-2 border-[#e94560] text-white px-6 py-2 rounded-lg font-bold hover:bg-[#1f2b4d]">
                                JOIN ONLINE
                            </button>
                        </div>
                        <button onClick={() => setMenuState('settings')} className="text-gray-400 hover:text-white mt-4 font-bold tracking-widest text-sm border-b border-transparent hover:border-white transition-all">
                             ⚙️ SETTINGS
                        </button>
                    </div>
                )}

                {menuState === 'host' && (
                    <div className="flex flex-col items-center gap-4 text-center p-6">
                        <h2 className="text-2xl text-[#4ecdc4] font-bold">WAITING FOR PLAYER...</h2>
                        <div className="bg-[#16213e] p-4 rounded border border-gray-600">
                            <p className="text-gray-400 text-sm mb-1">SHARE THIS ROOM ID:</p>
                            <p className="text-2xl font-mono text-white tracking-widest select-all">{roomId}</p>
                        </div>
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mt-4"></div>
                        <button onClick={() => setMenuState('main')} className="text-gray-400 hover:text-white mt-4 underline">Cancel</button>
                    </div>
                )}

                {menuState === 'join' && (
                    <div className="flex flex-col items-center gap-4">
                        <h2 className="text-2xl text-[#e94560] font-bold">JOIN GAME</h2>
                        <input 
                            type="text" 
                            placeholder="ENTER ROOM ID"
                            className="bg-[#16213e] border border-gray-600 p-3 rounded text-white text-center font-mono uppercase"
                            value={joinId}
                            onChange={(e) => setJoinId(e.target.value)}
                        />
                        <div className="flex gap-4">
                             <button onClick={() => setMenuState('main')} className="text-gray-400 hover:text-white">Back</button>
                             <button onClick={handleJoin} className="bg-[#4ecdc4] text-[#1a1a2e] px-6 py-2 rounded font-bold hover:bg-[#3dbdb4]">
                                CONNECT
                            </button>
                        </div>
                    </div>
                )}

                {menuState === 'settings' && (
                    <div className="flex flex-col items-center gap-6 p-8 bg-[#16213e] rounded-xl border-2 border-[#e94560] shadow-2xl min-w-[320px]">
                        <h2 className="text-3xl text-[#e94560] font-bold tracking-wider">SETTINGS</h2>
                        
                        <div className="w-full">
                            <label className="flex justify-between text-[#4ecdc4] mb-3 font-bold text-lg">
                                <span>SFX VOLUME</span>
                                <span>{Math.round(gameState.sfxVolume * 100)}%</span>
                            </label>
                            <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.05"
                                value={gameState.sfxVolume}
                                onChange={handleVolumeChange}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#e94560] hover:accent-[#ff6b81]"
                            />
                        </div>

                        <div className="flex gap-4 w-full">
                            <button 
                                onClick={() => { if (gameRef.current) gameRef.current.playHitSound('high'); }} 
                                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded font-bold transition-colors"
                            >
                                🔊 TEST
                            </button>
                            <button 
                                onClick={() => setMenuState('main')} 
                                className="flex-1 bg-[#4ecdc4] hover:bg-[#3dbdb4] text-[#1a1a2e] py-2 rounded font-bold transition-colors"
                            >
                                DONE
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )}
        
        {/* Replay Overlay Controls */}
        {gameState.isReplaying && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-4 border-t-2 border-[#e94560] z-30">
                <div className="flex flex-col gap-2">
                    <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.001"
                        value={gameState.replayProgress}
                        onChange={handleSeek}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#e94560]"
                    />
                    <div className="flex justify-center items-center gap-4 mt-2">
                        <button onClick={() => handleSpeed(-2)} className={`px-3 py-1 rounded ${gameState.replaySpeed === -2 ? 'bg-[#e94560]' : 'bg-gray-700'}`}>⏪</button>
                        <button onClick={() => handleSpeed(0)} className={`px-3 py-1 rounded ${gameState.replaySpeed === 0 ? 'bg-[#e94560]' : 'bg-gray-700'}`}>⏸</button>
                        <button onClick={() => handleSpeed(1)} className={`px-3 py-1 rounded ${gameState.replaySpeed === 1 ? 'bg-[#e94560]' : 'bg-gray-700'}`}>▶</button>
                        <button onClick={() => handleSpeed(2)} className={`px-3 py-1 rounded ${gameState.replaySpeed === 2 ? 'bg-[#e94560]' : 'bg-gray-700'}`}>⏩</button>
                        <button onClick={toggleReplay} className="px-3 py-1 rounded bg-red-600 text-white font-bold ml-4 hover:bg-red-500">EXIT REPLAY</button>
                    </div>
                </div>
            </div>
        )}

        {/* Game Over Overlay */}
        {gameState.showGameOver && !gameState.isReplaying && !gameState.opponentDisconnected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
                 <div className="text-4xl text-[#feca57] drop-shadow-md font-bold mb-4 animate-bounce">
                    🏆 {gameState.winner} WINS! 🏆
                 </div>
                 <div className="flex flex-col gap-3 items-center">
                    <div className="text-white text-lg">
                        {gameState.isMultiplayer 
                            ? (gameState.isHost ? "Press SPACE to rematch" : "Waiting for Host to rematch...") 
                            : "Press SPACE to fight again"
                        }
                    </div>
                    <button 
                        onClick={toggleReplay}
                        className="mt-2 bg-[#e94560] text-white px-6 py-2 rounded-full font-bold shadow-lg hover:bg-[#d43750] transition-transform hover:scale-105"
                    >
                        🎥 WATCH REPLAY
                    </button>
                    {gameState.isMultiplayer && (
                        <button onClick={() => window.location.reload()} className="text-sm text-gray-400 hover:text-white mt-4 underline">
                            DISCONNECT
                        </button>
                    )}
                    <button onClick={() => setMenuState('main')} className="text-sm text-gray-400 hover:text-white mt-2 underline">
                        MAIN MENU
                    </button>
                 </div>
            </div>
        )}

        {/* Disconnected Overlay */}
        {gameState.opponentDisconnected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 z-50">
                <div className="text-4xl text-[#e94560] drop-shadow-md font-bold mb-6">
                    ⚠️ OPPONENT DISCONNECTED
                </div>
                <button 
                    onClick={() => window.location.reload()}
                    className="bg-[#4ecdc4] text-[#1a1a2e] px-8 py-3 rounded-lg font-bold text-xl hover:bg-[#3dbdb4] transition hover:scale-105"
                >
                    RETURN TO MENU
                </button>
            </div>
        )}
      </div>

      <div className="flex justify-between w-[800px] mt-4">
        {/* Player 1 HUD */}
        <div className="bg-[#16213e] p-4 rounded-lg min-w-[200px] border-l-4 border-[#4ecdc4]">
          <div className="text-lg font-bold mb-2 text-[#4ecdc4]">PLAYER 1</div>
          <div className="w-full h-5 bg-[#0f0f23] rounded-full overflow-hidden mb-2">
            <div
              className="h-full transition-all duration-200 bg-gradient-to-r from-[#4ecdc4] to-[#44a08d]"
              style={{ width: `${getHealthPercent(gameState.p1Health)}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">
            {gameState.p1State}
          </div>
        </div>

        {/* Controls Hint */}
        {gameState.isMultiplayer ? (
            <div className="text-center text-sm text-gray-400 mt-2">
                 <span className="block font-bold text-[#e94560]">YOU ARE {gameState.isHost ? "PLAYER 1" : "PLAYER 2"}</span>
                 <span>WASD / ARROWS to Move • J / 1 High • K / 2 Low • L / 3 Grab</span>
            </div>
        ) : (
            <div className="text-center text-sm text-gray-400 mt-2">
                 P1: WASD+J/K/L &nbsp;|&nbsp; P2: ARROWS+1/2/3
            </div>
        )}

        {/* Player 2 HUD */}
        <div className="bg-[#16213e] p-4 rounded-lg min-w-[200px] border-r-4 border-[#ff6b6b] text-right">
          <div className="text-lg font-bold mb-2 text-[#ff6b6b]">PLAYER 2</div>
          <div className="w-full h-5 bg-[#0f0f23] rounded-full overflow-hidden mb-2">
             <div
              className="h-full transition-all duration-200 bg-gradient-to-l from-[#ff6b6b] to-[#ee5a5a] float-right"
              style={{ width: `${getHealthPercent(gameState.p2Health)}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">
            {gameState.p2State}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
