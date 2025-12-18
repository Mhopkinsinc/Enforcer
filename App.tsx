
import { THEME_SONG_B64 } from './game/sfx/music';
import { FULLRINK_SHEET_B64 } from './game/sprites/fullrinkbkg';
import React, { useEffect, useRef, useState } from 'react';
import { Engine, DisplayMode, Color } from 'excalibur';
import { HockeyGame } from './game/HockeyGame';
import { GameState } from './types';
import { NetworkManager } from './game/NetworkManager';

// Declare Driver.js global if needed, but we use the IIFE version which attaches to window
declare const driver: any;

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HockeyGame | null>(null);
  const networkRef = useRef<NetworkManager | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

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
    isCPUGame: false,
    connectionStatus: 'disconnected',
    opponentDisconnected: false,
    sfxVolume: 0.15,
    crtScanlines: true,
    crtFlicker: true,
    crtVignette: true
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
        game.setupGame((state) => {
            setGameState(prev => ({ ...prev, ...state }));
        });
    });

    gameRef.current = game;

    const handleKeyDown = (e: KeyboardEvent) => {
        if (game.opponentDisconnected) return;

        if (!game.isReplaying && game.isGameOver && (e.key === ' ' || e.key === 'Enter')) {
            game.restartGame(game.isCPUGame);
            playBase64Mp3();
        }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if ((game as any).stop) (game as any).stop();
      if ((game as any).dispose) (game as any).dispose();
      if (networkRef.current) networkRef.current.destroy();
      if (musicRef.current) musicRef.current.pause();
    };
  }, []);

  // Effect for Walkthrough
  useEffect(() => {
    if (menuState === 'main') {
      const tourComplete = localStorage.getItem('hockey_fight_tour_complete');
      if (!tourComplete && typeof (window as any).driver !== 'undefined') {
        const driverObj = (window as any).driver.js.driver({
          showProgress: true,
          steps: [            
            { element: '#tour-local-btn', popover: { title: 'Local Play', description: '2 Player Local Play, on the same computer', side: "bottom", align: 'start' }},
            { element: '#tour-cpu-btn', popover: { title: 'VS CPU', description: 'Play against the computer AI', side: "bottom", align: 'start' }},
            { element: '#tour-online-section', popover: { title: 'Online Play', description: 'Host or Connect to a friends room', side: "bottom", align: 'start' }},
            { element: '#tour-settings-btn', popover: { title: 'Settings', description: 'Joystick, Volume, CRT Filters', side: "top", align: 'start' }},
            { element: '#tour-controls', popover: { title: 'Keyboard Controls', description: 'Default Keyboard Buttons', side: "top", align: 'start' }},
          ],
          onDestroyStarted: () => {
            localStorage.setItem('hockey_fight_tour_complete', 'true');
            driverObj.destroy();
          }
        });

        driverObj.drive();
      }
    }
  }, [menuState]);

  // Effect to stop music when game ends or someone wins
  useEffect(() => {
    if ((gameState.gameOver || gameState.opponentDisconnected) && musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = 0;
    }
  }, [gameState.gameOver, gameState.opponentDisconnected]);

  const startLocalGame = () => {
      setMenuState('game');
      if (gameRef.current) gameRef.current.restartGame(false);
      playBase64Mp3();
  };

  const startCpuGame = () => {
      setMenuState('game');
      if (gameRef.current) gameRef.current.restartGame(true);
      playBase64Mp3();
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
                  gameRef.current.setupNetwork(net, true); 
              }
              playBase64Mp3();
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
          await net.init();
          net.connect(joinId);
          net.onConnection = () => {
              setMenuState('game');
              if (gameRef.current) {
                  gameRef.current.setupNetwork(net, false); 
              }
              playBase64Mp3();
          };
          networkRef.current = net;
      } catch(e) {
          alert("Connection failed");
      }
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
      setGameState(prev => ({ ...prev, sfxVolume: vol }));
      if (musicRef.current) {
          musicRef.current.volume = vol;
      }
      if (gameRef.current) {
          gameRef.current.setSFXVolume(vol);
      }
  };

  const playBase64Mp3 = () => {
    if (!THEME_SONG_B64) return;
    if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current.currentTime = 0;
    }

    const audio = new Audio(`data:audio/mp3;base64,${THEME_SONG_B64}`);
    audio.volume = gameState.sfxVolume;
    audio.loop = false;
    audio.play().catch(err => console.error("Error playing base64 audio:", err));
    musicRef.current = audio;
  };

  const toggleSetting = (setting: 'crtScanlines' | 'crtFlicker' | 'crtVignette') => {
      setGameState(prev => ({ ...prev, [setting]: !prev[setting] }));
  };

  return (
    <div 
      className="flex flex-col items-center justify-center min-h-screen font-sans relative overflow-hidden"
      style={{
        backgroundImage: `url(${FULLRINK_SHEET_B64})`,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        imageRendering: 'pixelated'
      }}
    >
      <div className="arena-frosted-glass">
          <div className="arena-glass-glare"></div>
      </div>

      <div className="tv-case" id="tour-tv-case">
        <div className="tv-screen-bezel">
            <div className="tv-glass-container relative" style={{width: '800px', height: '400px'}}>
                <canvas
                    ref={canvasRef}
                    id="gameCanvas"
                    className="image-pixelated"
                    onContextMenu={(e) => e.preventDefault()}
                />

                {menuState !== 'game' && (
                    <div className="absolute inset-0 bg-[#1a1a2e]/95 flex flex-col items-center justify-center z-20">
                        {menuState === 'main' && (
                            <div className="flex flex-col gap-4 items-center">
                                <button id="tour-local-btn" onClick={startLocalGame} className="w-full bg-[#4ecdc4] text-[#1a1a2e] px-8 py-3 rounded-lg font-bold text-xl hover:bg-[#3dbdb4] transition shadow-[0_0_15px_rgba(78,205,196,0.4)]">
                                    LOCAL 2 PLAYER
                                </button>
                                <button id="tour-cpu-btn" onClick={startCpuGame} className="w-full bg-[#feca57] text-[#1a1a2e] px-8 py-3 rounded-lg font-bold text-xl hover:bg-[#e1b12c] transition shadow-[0_0_15px_rgba(254,202,87,0.4)]">
                                    VS CPU
                                </button>
                                <div className="flex gap-4" id="tour-online-section">
                                    <button onClick={handleHost} className="bg-[#e94560] text-white px-6 py-2 rounded-lg font-bold hover:bg-[#d13650] shadow-[0_0_15px_rgba(233,69,96,0.4)]">
                                        HOST ONLINE
                                    </button>
                                    <button onClick={() => setMenuState('join')} className="bg-[#16213e] border-2 border-[#e94560] text-white px-6 py-2 rounded-lg font-bold hover:bg-[#1f2b4d]">
                                        JOIN ONLINE
                                    </button>
                                </div>
                                <button id="tour-settings-btn" onClick={() => setMenuState('settings')} className="text-gray-400 hover:text-white mt-4 font-bold tracking-widest text-sm border-b border-transparent hover:border-white transition-all">
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
                                    className="bg-[#16213e] border border-gray-600 p-3 rounded text-white text-center font-mono uppercase focus:border-[#4ecdc4] outline-none"
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
                            <div className="flex flex-col bg-[#16213e] rounded-xl border-2 border-[#e94560] shadow-2xl min-w-[320px] max-h-[370px] overflow-hidden z-50">
                                <div className="overflow-y-auto px-6 py-3 flex flex-col items-center gap-2">
                                    <h2 className="text-2xl text-[#e94560] font-bold tracking-wider mb-1">SETTINGS</h2>
                                    <div className="w-full">
                                        <label className="flex justify-between text-[#4ecdc4] mb-1 font-bold text-sm">
                                            <span>SFX VOLUME</span>
                                            <span>{Math.round(gameState.sfxVolume * 100)}%</span>
                                        </label>
                                        <input 
                                            type="range" 
                                            min="0" max="1" step="0.05"
                                            value={gameState.sfxVolume}
                                            onChange={handleVolumeChange}
                                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#e94560] hover:accent-[#ff6b81]"
                                        />
                                    </div>
                                    <div className="w-full flex flex-col gap-1.5">
                                        <div className="text-[#4ecdc4] font-bold text-sm mt-1">VISUALS</div>
                                        <label className="flex items-center justify-between cursor-pointer group">
                                            <span className="text-gray-300 text-xs group-hover:text-white transition-colors">Scanlines</span>
                                            <input type="checkbox" checked={gameState.crtScanlines} onChange={() => toggleSetting('crtScanlines')} className="w-3.5 h-3.5 accent-[#e94560]"/>
                                        </label>
                                        <label className="flex items-center justify-between cursor-pointer group">
                                            <span className="text-gray-300 text-xs group-hover:text-white transition-colors">Vignette</span>
                                            <input type="checkbox" checked={gameState.crtVignette} onChange={() => toggleSetting('crtVignette')} className="w-3.5 h-3.5 accent-[#e94560]"/>
                                        </label>
                                        <label className="flex items-center justify-between cursor-pointer group">
                                            <span className="text-gray-300 text-xs group-hover:text-white transition-colors">Flicker</span>
                                            <input type="checkbox" checked={gameState.crtFlicker} onChange={() => toggleSetting('crtFlicker')} className="w-3.5 h-3.5 accent-[#e94560]"/>
                                        </label>
                                    </div>
                                    <div className="flex flex-col gap-2 w-full mt-2">
                                        <div className="flex gap-2">
                                          <button onClick={() => { if (gameRef.current) gameRef.current.playHitSound('high'); }} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 rounded font-bold text-xs transition-colors">SFX TEST</button>
                                          <button onClick={playBase64Mp3} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 rounded font-bold text-xs transition-colors">SONG</button>
                                        </div>
                                        <button onClick={() => setMenuState('main')} className="w-full bg-[#4ecdc4] hover:bg-[#3dbdb4] text-[#1a1a2e] py-1.5 rounded font-bold text-sm transition-colors">DONE</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="absolute bottom-6 left-6 right-6 flex gap-6 z-30" id="tour-controls">
                            <div className="flex-1 bg-[#1a1a2e] border border-[#2a2a4e] p-3 rounded-xl shadow-2xl flex gap-3 items-start">
                                <div className="w-6 h-6 rounded-full bg-[#4ecdc4]/20 flex items-center justify-center text-[#4ecdc4] font-bold text-xs border border-[#4ecdc4]/40">i</div>
                                <div className="flex flex-col">
                                    <span className="text-[#4ecdc4] font-bold text-[10px] uppercase tracking-widest mb-1">Player 1 Controls</span>
                                    <ul className="text-gray-300 text-[11px] space-y-0.5 leading-tight">
                                        <li className="flex items-center gap-2"><span className="w-1 h-1 bg-white rounded-full"></span> WASD to Move</li>
                                        <li className="flex items-center gap-2"><span className="w-1 h-1 bg-white rounded-full"></span> J / K / L Action</li>
                                    </ul>
                                </div>
                            </div>
                            <div className={`flex-1 bg-[#1a1a2e] border ${gameState.isCPUGame ? 'border-[#4ecdc4]' : 'border-[#2a2a4e]'} p-3 rounded-xl shadow-2xl flex gap-3 items-start`}>
                                <div className={`w-6 h-6 rounded-full ${gameState.isCPUGame ? 'bg-[#4ecdc4]/20 text-[#4ecdc4] border-[#4ecdc4]/40' : 'bg-[#e94560]/20 text-[#e94560] border-[#e94560]/40'} flex items-center justify-center font-bold text-xs border`}>i</div>
                                <div className="flex flex-col">
                                    <span className={`${gameState.isCPUGame ? 'text-[#4ecdc4]' : 'text-[#e94560]'} font-bold text-[10px] uppercase tracking-widest mb-1`}>
                                      {gameState.isCPUGame ? 'P1 Alt Controls' : 'Player 2 Controls'}
                                    </span>
                                    <ul className="text-gray-300 text-[11px] space-y-0.5 leading-tight">
                                        <li className="flex items-center gap-2"><span className="w-1 h-1 bg-white rounded-full"></span> Arrows to Move</li>
                                        <li className="flex items-center gap-2"><span className="w-1 h-1 bg-white rounded-full"></span> 1 / 2 / 3 Action</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {gameState.isReplaying && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-4 border-t-2 border-[#e94560] z-30">
                        <div className="flex flex-col gap-2">
                            <input 
                                type="range" 
                                min="0" max="1" step="0.001"
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

                {gameState.showGameOver && !gameState.isReplaying && !gameState.opponentDisconnected && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
                        <div className={`text-4xl drop-shadow-md font-bold mb-4 animate-bounce ${
                            gameState.isMultiplayer && !((gameState.isHost && gameState.winner === 'PLAYER 1') || (!gameState.isHost && gameState.winner === 'PLAYER 2'))
                            ? 'text-red-500'
                            : 'text-[#feca57]'
                        }`}>
                            {!gameState.isMultiplayer 
                                ? `🏆 ${gameState.winner} WINS! 🏆` 
                                : (gameState.isHost && gameState.winner === 'PLAYER 1') || (!gameState.isHost && gameState.winner === 'PLAYER 2')
                                    ? "🏆 YOU WIN! 🏆"
                                    : "🏳️ YOU LOSE! 🏳️"
                            }
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

                <div className={`crt-overlay ${gameState.crtScanlines ? 'crt-scanlines' : ''} ${gameState.crtVignette ? 'crt-vignette' : ''} ${gameState.crtFlicker ? 'crt-flicker' : ''}`}></div>
                <div className="screen-reflection"></div>
            </div>
        </div>

        <div className="tv-controls">
            <div className="speaker-grill"></div>
            <div className="flex flex-col items-center">
                 <div className="tv-brand">POLYTRON</div>
                 <div className="flex gap-2 mt-1">
                    <div className="w-8 h-2 bg-gray-800 rounded"></div>
                    <div className="w-8 h-2 bg-gray-800 rounded"></div>
                 </div>
            </div>
            <div className="tv-buttons">
                <div className="power-led"></div>
                <div className="power-btn"></div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default App;
