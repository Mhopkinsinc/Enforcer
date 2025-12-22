import React, { useEffect, useRef, useState } from 'react';
import { Engine, DisplayMode, Color } from 'excalibur';
import { THEME_SONG_B64 } from './game/sfx/music';
import { FULLRINK_SHEET_B64 } from './game/sprites/fullrinkbkg';
import { HockeyGame } from './game/HockeyGame';
import { NetworkManager } from './game/NetworkManager';
import { GameState } from './types';
import { 
  SETTINGS_STORAGE_KEY, 
  PLAYER_ID_KEY, 
  DEFAULT_GAME_STATE 
} from './appConstants';
import { PixelText } from './ui/PixelText';
import { useResponsiveScale } from './hooks/useResponsiveScale';
import { MainMenu, HostMenu, JoinMenu, LeaderboardMenu } from './ui/GameMenus';
import { GameOverOverlay, ReplayOverlay } from './ui/GameOverOverlays';

declare const driver: any;

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HockeyGame | null>(null);
  const networkRef = useRef<NetworkManager | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const lastInputTime = useRef<number>(0);

  const { scale, isMobile } = useResponsiveScale();

  const [gameState, setGameState] = useState<GameState>(() => {
    let savedSettings = {};
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        savedSettings = {
          sfxVolume: parsed.sfxVolume,
          crtScanlines: parsed.crtScanlines,
          crtFlicker: parsed.crtFlicker,
          crtVignette: parsed.crtVignette,
          gamepadConfig: parsed.gamepadConfig,
          nickname: parsed.nickname || 'PLAYER'
        };
      }
    } catch (e) { console.error("Failed to load settings:", e); }

    let playerId = localStorage.getItem(PLAYER_ID_KEY);
    if (!playerId) {
        playerId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'player-' + Date.now().toString(36);
        localStorage.setItem(PLAYER_ID_KEY, playerId);
    }

    return { ...DEFAULT_GAME_STATE, ...savedSettings, playerId };
  });
  
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const [menuState, setMenuState] = useState<'main' | 'host' | 'join' | 'game' | 'settings' | 'leaderboard'>('main');
  const [mainMenuIndex, setMainMenuIndex] = useState(0); 
  const [gameOverIndex, setGameOverIndex] = useState(0);
  const [replayControlIndex, setReplayControlIndex] = useState(2);
  const [settingsIndex, setSettingsIndex] = useState(0); 
  const [roomId, setRoomId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [settingsTab, setSettingsTab] = useState<'audio_video' | 'controls'>('audio_video');
  const [availableGamepads, setAvailableGamepads] = useState<(Gamepad | null)[]>([]);
  const [remapping, setRemapping] = useState<{ player: 1 | 2, action: 'highPunch' | 'lowPunch' | 'grab' } | null>(null);

  useEffect(() => {
    const settingsToSave = {
      sfxVolume: gameState.sfxVolume,
      crtScanlines: gameState.crtScanlines,
      crtFlicker: gameState.crtFlicker,
      crtVignette: gameState.crtVignette,
      gamepadConfig: gameState.gamepadConfig,
      nickname: gameState.nickname
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsToSave));
  }, [gameState.sfxVolume, gameState.crtScanlines, gameState.crtFlicker, gameState.crtVignette, gameState.gamepadConfig, gameState.nickname]);

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
      antialiasing: false,
      suppressHiDPIScaling: true
    });

    game.setSFXVolume(gameState.sfxVolume);
    game.updateGamepadSettings(gameState.gamepadConfig);

    game.start().then(() => {
        game.setupGame((state) => {
            setGameState(prev => ({ 
              ...prev, ...state,
              sfxVolume: prev.sfxVolume, 
              crtScanlines: prev.crtScanlines,
              crtFlicker: prev.crtFlicker,
              crtVignette: prev.crtVignette,
              gamepadConfig: prev.gamepadConfig,
              playerId: prev.playerId,
              nickname: prev.nickname
            }));
        });
        game.restartGame(false, true);
    });

    gameRef.current = game;

    const handleKeyDown = (e: KeyboardEvent) => {
        if (game.opponentDisconnected) return;
        if (game.isDemoMode && e.key === 'Escape') {
            setMenuState('main');
            if (musicRef.current) { musicRef.current.pause(); musicRef.current.currentTime = 0; }
            return;
        }
        if (!game.isReplaying && game.isGameOver && (e.key === ' ' || e.key === 'Enter')) {
            game.restartGame(game.isCPUGame, game.isDemoMode);
            playBase64Mp3();
        }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if ((game as any).stop) (game as any).stop();
      if (networkRef.current) networkRef.current.destroy();
      if (musicRef.current) musicRef.current.pause();
    };
  }, []);

  const cycleInput = (player: 1 | 2, direction: 1 | -1) => {
      const gps = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      const current = player === 1 ? gameStateRef.current.gamepadConfig.p1Index : gameStateRef.current.gamepadConfig.p2Index;
      let val = current === null ? -1 : current;
      val += direction;
      if (val < -1) val = gps.length - 1;
      if (val >= gps.length) val = -1;
      updateGamepadAssignment(player, val === -1 ? 'kb' : val.toString());
  };

  useEffect(() => {
    if ((menuState === 'game' && !gameState.showGameOver && !gameState.isReplaying) || menuState === 'host' || menuState === 'join') return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastInputTime.current < 150) return;

      const gps = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      let inputFound = false;

      for (const gp of gps) {
        if (!gp) continue;

        const up = gp.buttons[12]?.pressed || gp.axes[1] < -0.5;
        const down = gp.buttons[13]?.pressed || gp.axes[1] > 0.5;
        const left = gp.buttons[14]?.pressed || gp.axes[0] < -0.5;
        const right = gp.buttons[15]?.pressed || gp.axes[0] > 0.5;
        const select = gp.buttons[0]?.pressed || gp.buttons[9]?.pressed;
        const back = gp.buttons[1]?.pressed;

        if (menuState === 'game' && gameState.isReplaying) {
            if (left) setReplayControlIndex(prev => Math.max(0, prev - 1));
            else if (right) setReplayControlIndex(prev => Math.min(4, prev + 1));
            if (select) {
                switch(replayControlIndex) {
                    case 0: handleSpeed(-2); break;
                    case 1: handleSpeed(0); break;
                    case 2: handleSpeed(1); break;
                    case 3: handleSpeed(2); break;
                    case 4: toggleReplay(); break;
                }
            }
            inputFound = left || right || select;
        } else if (menuState === 'game' && gameState.showGameOver && !gameState.isReplaying) {
             if (up) setGameOverIndex(prev => Math.max(0, prev - 1));
             else if (down) setGameOverIndex(prev => Math.min(2, prev + 1));
             if (select) {
                 if (gameOverIndex === 0) { gameRef.current?.restartGame(gameRef.current.isCPUGame, gameRef.current.isDemoMode); playBase64Mp3(); }
                 else if (gameOverIndex === 1) toggleReplay();
                 else if (gameOverIndex === 2) gameState.isMultiplayer ? window.location.reload() : setMenuState('main');
             }
             inputFound = up || down || select;
        } else if (menuState === 'main') {
            if (up) {
                if (mainMenuIndex === 2) setMainMenuIndex(0);
                else if (mainMenuIndex === 3) setMainMenuIndex(1);
                else if (mainMenuIndex === 4) setMainMenuIndex(2);
                else if (mainMenuIndex === 5) setMainMenuIndex(4);
            } else if (down) {
                if (mainMenuIndex === 0) setMainMenuIndex(2);
                else if (mainMenuIndex === 1) setMainMenuIndex(3);
                else if (mainMenuIndex === 2 || mainMenuIndex === 3) setMainMenuIndex(4);
                else if (mainMenuIndex === 4) setMainMenuIndex(5);
            } else if (left) {
                if (mainMenuIndex === 1) setMainMenuIndex(0);
                else if (mainMenuIndex === 3) setMainMenuIndex(2);
            } else if (right) {
                if (mainMenuIndex === 0) setMainMenuIndex(1);
                else if (mainMenuIndex === 2) setMainMenuIndex(3);
            }
            if (select) {
                switch(mainMenuIndex) {
                    case 0: startDemoMode(); break;
                    case 1: startCpuGame(); break;
                    case 2: handleHost(); break;
                    case 3: setMenuState('join'); break;
                    case 4: setMenuState('leaderboard'); break;
                    case 5: setMenuState('settings'); setSettingsIndex(0); break;
                }
            }
            inputFound = up || down || left || right || select;
        } else if (menuState === 'settings' && !remapping) {
            const maxIndex = settingsTab === 'audio_video' ? 7 : 9;
            if (up) setSettingsIndex(prev => Math.max(0, prev - 1));
            else if (down) setSettingsIndex(prev => Math.min(maxIndex, prev + 1));

            if (left || right) {
                if (settingsIndex === 0) setSettingsTab(prev => prev === 'audio_video' ? 'controls' : 'audio_video');
                if (settingsTab === 'audio_video' && settingsIndex === 1) {
                    const newVol = Math.max(0, Math.min(1, gameStateRef.current.sfxVolume + (left ? -0.05 : 0.05)));
                    setGameState(prev => ({ ...prev, sfxVolume: newVol }));
                    gameRef.current?.setSFXVolume(newVol);
                } else if (settingsTab === 'controls') {
                    if (settingsIndex === 1) cycleInput(1, left ? -1 : 1);
                    if (settingsIndex === 5) cycleInput(2, left ? -1 : 1);
                }
            }

            if (select || back) {
                if (back || (settingsIndex === maxIndex && select)) setMenuState('main');
                else if (settingsIndex === 0) setSettingsTab(prev => prev === 'audio_video' ? 'controls' : 'audio_video');
                else if (settingsTab === 'audio_video') {
                    if (settingsIndex === 2) toggleSetting('crtScanlines');
                    if (settingsIndex === 3) toggleSetting('crtVignette');
                    if (settingsIndex === 4) toggleSetting('crtFlicker');
                    if (settingsIndex === 5) gameRef.current?.playHitSound('high');
                    if (settingsIndex === 6) playBase64Mp3();
                } else {
                    if (settingsIndex === 2) setRemapping({player: 1, action: 'highPunch'});
                    if (settingsIndex === 3) setRemapping({player: 1, action: 'lowPunch'});
                    if (settingsIndex === 4) setRemapping({player: 1, action: 'grab'});
                    if (settingsIndex === 6) setRemapping({player: 2, action: 'highPunch'});
                    if (settingsIndex === 7) setRemapping({player: 2, action: 'lowPunch'});
                    if (settingsIndex === 8) setRemapping({player: 2, action: 'grab'});
                }
            }
            inputFound = up || down || left || right || select || back;
        } else if (menuState === 'leaderboard') {
            if (select || back) setMenuState('main');
            inputFound = select || back;
        }

        if (inputFound) { lastInputTime.current = now; break; }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [menuState, mainMenuIndex, settingsIndex, settingsTab, remapping, gameOverIndex, replayControlIndex, gameState.showGameOver, gameState.isReplaying]); 

  useEffect(() => {
    if (menuState !== 'settings') return;
    const interval = setInterval(() => {
        if (navigator.getGamepads) setAvailableGamepads(Array.from(navigator.getGamepads()));
        if (remapping) {
            const gps = Array.from(navigator.getGamepads());
            for(const gp of gps) {
                if(!gp) continue;
                for (let i = 0; i < gp.buttons.length; i++) {
                    if (gp.buttons[i].pressed) {
                        const newConfig = { ...gameStateRef.current.gamepadConfig };
                        if (remapping.player === 1) newConfig.p1Mapping = { ...newConfig.p1Mapping, [remapping.action]: i };
                        else newConfig.p2Mapping = { ...newConfig.p2Mapping, [remapping.action]: i };
                        setGameState(prev => ({ ...prev, gamepadConfig: newConfig }));
                        gameRef.current?.updateGamepadSettings(newConfig);
                        setRemapping(null);
                        lastInputTime.current = Date.now() + 500;
                        return;
                    }
                }
            }
        }
    }, 50);
    return () => clearInterval(interval);
  }, [menuState, remapping]);

  useEffect(() => {
    if (menuState === 'main') {
      const tourComplete = localStorage.getItem('hockey_fight_tour_complete');
      if (!tourComplete && typeof (window as any).driver !== 'undefined') {
        const timer = setTimeout(() => {
            const driverObj = (window as any).driver.js.driver({
              showProgress: true, animate: true,
              steps: [            
                { element: '#tour-local-btn', popover: { title: 'Demo Mode', description: 'See an automated tutorial of the controls', side: "bottom", align: 'start' }},
                { element: '#tour-cpu-btn', popover: { title: 'VS CPU', description: 'Play against the computer AI', side: "bottom", align: 'start' }},
                { element: '#tour-online-section', popover: { title: 'Online Play', description: 'Host or Connect to a friends room', side: "bottom", align: 'start' }},
                { element: '#tour-settings-btn', popover: { title: 'Settings', description: 'Joystick, Volume, CRT Filters', side: "top", align: 'start' }},
                { element: '#tour-controls', popover: { title: 'Keyboard Controls', description: 'Default Keyboard Buttons', side: "top", align: 'start' }},
              ],
              onDestroyStarted: () => { localStorage.setItem('hockey_fight_tour_complete', 'true'); driverObj.destroy(); }
            });
            driverObj.drive();
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [menuState]);

  useEffect(() => {
    if ((gameState.gameOver || gameState.opponentDisconnected) && musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = 0;
    }
  }, [gameState.gameOver, gameState.opponentDisconnected]);

  const startDemoMode = () => { setMenuState('game'); gameRef.current?.restartGame(false, true); playBase64Mp3(); };
  const startCpuGame = () => { setMenuState('game'); gameRef.current?.restartGame(true); playBase64Mp3(); };
  const handleHost = async () => {
      const net = new NetworkManager();
      try {
          const id = await net.init();
          setRoomId(id);
          setMenuState('host');
          net.onConnection = () => { setMenuState('game'); gameRef.current?.setupNetwork(net, true); playBase64Mp3(); };
          networkRef.current = net;
      } catch (e) { alert("Failed to connect to matchmaking server."); }
  };

  const handleJoin = async () => {
      if(!joinId) return;
      const net = new NetworkManager();
      try {
          await net.init();
          net.connect(joinId);
          net.onConnection = () => { setMenuState('game'); gameRef.current?.setupNetwork(net, false); playBase64Mp3(); };
          networkRef.current = net;
      } catch(e) { alert("Connection failed"); }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => { gameRef.current?.seekTo(parseFloat(e.target.value)); gameRef.current?.setPlaybackSpeed(0); };
  const handleSpeed = (speed: number) => { gameRef.current?.setPlaybackSpeed(speed); };
  const toggleReplay = () => { gameRef.current?.toggleReplay(!gameState.isReplaying); };
  const toggleSetting = (setting: 'crtScanlines' | 'crtFlicker' | 'crtVignette') => { setGameState(prev => ({ ...prev, [setting]: !prev[setting] })); };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const vol = parseFloat(e.target.value);
      setGameState(prev => ({ ...prev, sfxVolume: vol }));
      if (musicRef.current) musicRef.current.volume = vol;
      gameRef.current?.setSFXVolume(vol);
  };

  const updateGamepadAssignment = (player: 1 | 2, indexString: string) => {
      const index = indexString === 'kb' ? null : parseInt(indexString);
      const newConfig = { ...gameStateRef.current.gamepadConfig };
      if (player === 1) newConfig.p1Index = index;
      else newConfig.p2Index = index;
      setGameState(prev => ({ ...prev, gamepadConfig: newConfig }));
      gameRef.current?.updateGamepadSettings(newConfig);
  };

  const playBase64Mp3 = () => {
    if (!THEME_SONG_B64) return;
    if (musicRef.current) { musicRef.current.pause(); musicRef.current.currentTime = 0; }
    const audio = new Audio(`data:audio/mp3;base64,${THEME_SONG_B64}`);
    audio.volume = gameStateRef.current.sfxVolume;
    audio.play().catch(err => console.error("Error playing base64 audio:", err));
    musicRef.current = audio;
  };

  return (
    <div 
      className="flex flex-col items-center justify-center h-screen w-screen font-sans relative overflow-hidden bg-black"
      style={!isMobile ? { backgroundImage: `url(${FULLRINK_SHEET_B64})`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', imageRendering: 'pixelated' } : {}}
    >
      {!isMobile && <div className="arena-frosted-glass"><div className="arena-glass-glare"></div></div>}

      <div className={isMobile ? "relative z-10" : "tv-case"} id="tour-tv-case" style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
        <div className={isMobile ? "" : "tv-screen-bezel"}>
            <div className="tv-glass-container relative" style={{width: '800px', height: '400px'}}>
                <canvas ref={canvasRef} id="gameCanvas" className="image-pixelated" onContextMenu={(e) => e.preventDefault()} />

                {menuState === 'game' && gameState.isDemoMode && gameState.demoText && !gameState.showGameOver && (
                    <div className="absolute top-8 left-0 right-0 flex justify-center z-40">
                        <div className="bg-black/70 px-4 py-2 rounded-lg border-2 border-white/10 shadow-lg backdrop-blur-sm">
                            <PixelText text={gameState.demoText} scale={3} />
                        </div>
                    </div>
                )}

                {menuState !== 'game' && (
                    <div className="absolute inset-0 bg-[#1a1a2e]/95 flex flex-col items-center justify-start pt-10 z-20">
                        {menuState === 'main' && <div className="absolute top-4 left-4 text-gray-500 text-[10px] font-mono opacity-50">v0.7 - Demo Mode</div>}
                        
                        {menuState === 'main' && (
                            <MainMenu 
                                onStartDemo={startDemoMode} onStartCpu={startCpuGame} onHost={handleHost} onJoin={() => setMenuState('join')}
                                onShowLeaderboard={() => setMenuState('leaderboard')} onShowSettings={() => { setMenuState('settings'); setSettingsIndex(0); }}
                                mainMenuIndex={mainMenuIndex} setMainMenuIndex={setMainMenuIndex} onClose={() => {}} 
                            />
                        )}

                        {menuState === 'host' && (
                            <HostMenu roomId={roomId} nickname={gameState.nickname} setNickname={(n) => setGameState(p => ({...p, nickname: n}))} onCancel={() => setMenuState('main')} />
                        )}

                        {menuState === 'join' && (
                            <JoinMenu joinId={joinId} setJoinId={setJoinId} nickname={gameState.nickname} setNickname={(n) => setGameState(p => ({...p, nickname: n}))} onJoin={handleJoin} onBack={() => setMenuState('main')} />
                        )}

                        {menuState === 'leaderboard' && <LeaderboardMenu onBack={() => setMenuState('main')} />}

                        {menuState === 'settings' && (
                            <div className="absolute top-[30px] bottom-[135px] left-1/2 -translate-x-1/2 flex flex-col bg-[#16213e] rounded-xl border-2 border-[#e94560] shadow-2xl min-w-[340px] overflow-hidden z-50">
                                <div className={`flex w-full border-b border-gray-700 ${settingsIndex === 0 ? 'ring-2 ring-white z-10' : ''}`}>
                                    <button className={`flex-1 py-2 text-xs font-bold ${settingsTab === 'audio_video' ? 'bg-[#e94560] text-white' : 'text-gray-400'}`} onClick={() => { setSettingsTab('audio_video'); setSettingsIndex(0); }}>AUDIO / VIDEO</button>
                                    <button className={`flex-1 py-2 text-xs font-bold ${settingsTab === 'controls' ? 'bg-[#e94560] text-white' : 'text-gray-400'}`} onClick={() => { setSettingsTab('controls'); setSettingsIndex(0); }}>CONTROLS</button>
                                </div>
                                <div className="px-6 py-3 flex flex-col items-center gap-2 overflow-y-auto max-h-[300px]">
                                    {settingsTab === 'audio_video' ? (
                                        <>
                                            <div className={`w-full p-1 rounded ${settingsIndex === 1 ? 'bg-white/10 ring-1 ring-[#4ecdc4]' : ''}`}>
                                                <label className="flex justify-between text-[#4ecdc4] mb-1 font-bold text-xs"><span>SFX VOLUME</span><span>{Math.round(gameState.sfxVolume * 100)}%</span></label>
                                                <input type="range" min="0" max="1" step="0.05" value={gameState.sfxVolume} onChange={handleVolumeChange} onMouseEnter={() => setSettingsIndex(1)} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#e94560]" />
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {(['crtScanlines', 'crtVignette', 'crtFlicker'] as const).map((key, i) => (
                                                  <label key={key} className={`flex flex-col items-center cursor-pointer p-1 rounded ${settingsIndex === i + 2 ? 'bg-white/10 ring-1 ring-[#e94560]' : ''}`} onMouseEnter={() => setSettingsIndex(i + 2)}>
                                                    <span className="text-gray-300 text-[10px] mb-1">{['Scan', 'Vignette', 'Flicker'][i]}</span>
                                                    <input type="checkbox" checked={!!gameState[key]} onChange={() => toggleSetting(key)} className="w-3 h-3 accent-[#e94560]"/>
                                                  </label>
                                                ))}
                                            </div>
                                            <div className="flex gap-2 w-full mt-1">
                                                <button onMouseEnter={() => setSettingsIndex(5)} onClick={() => gameRef.current?.playHitSound('high')} className={`flex-1 bg-gray-700 text-white py-1 rounded text-[10px] ${settingsIndex === 5 ? 'ring-2 ring-white' : ''}`}>SFX TEST</button>
                                                <button onMouseEnter={() => setSettingsIndex(6)} onClick={playBase64Mp3} className={`flex-1 bg-gray-700 text-white py-1 rounded text-[10px] ${settingsIndex === 6 ? 'ring-2 ring-white' : ''}`}>SONG</button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="w-full flex flex-col gap-3">
                                            {[1, 2].map(pNum => (
                                              <div key={pNum} className="bg-black/30 p-2 rounded">
                                                <div className={`text-[${pNum === 1 ? '#4ecdc4' : '#e94560'}] font-bold text-[10px] mb-1`}>PLAYER {pNum} INPUT</div>
                                                <select className={`w-full bg-[#1a1a2e] text-white text-xs border border-gray-600 rounded p-1 ${settingsIndex === (pNum === 1 ? 1 : 5) ? 'ring-2 ring-white' : ''}`} value={gameState.gamepadConfig[`p${pNum}Index`] === null ? 'kb' : gameState.gamepadConfig[`p${pNum}Index`]} onChange={(e) => updateGamepadAssignment(pNum as 1|2, e.target.value)} onMouseEnter={() => setSettingsIndex(pNum === 1 ? 1 : 5)}>
                                                  <option value="kb">Keyboard</option>
                                                  {availableGamepads.map((gp, i) => gp && <option key={i} value={i}>Gamepad {i + 1}</option>)}
                                                </select>
                                                {gameState.gamepadConfig[`p${pNum}Index`] !== null && (
                                                  <div className="flex flex-col gap-1 mt-2">
                                                    {(['highPunch', 'lowPunch', 'grab'] as const).map((action, actionIdx) => {
                                                      const overallIdx = pNum === 1 ? 2 + actionIdx : 6 + actionIdx;
                                                      const isThisRemapping = remapping?.player === pNum && remapping?.action === action;
                                                      return (
                                                        <button
                                                          key={action}
                                                          onMouseEnter={() => setSettingsIndex(overallIdx)}
                                                          onClick={() => setRemapping({ player: pNum as 1|2, action })}
                                                          className={`flex justify-between items-center px-2 py-1 rounded text-[9px] font-bold uppercase tracking-tighter ${settingsIndex === overallIdx ? 'bg-white/20 ring-1 ring-white' : 'bg-black/20 text-gray-400'}`}
                                                        >
                                                          <span>{action.replace('Punch', ' PUNCH')}</span>
                                                          <span className={isThisRemapping ? 'animate-pulse text-yellow-400' : 'text-white'}>
                                                            {isThisRemapping ? 'WAITING...' : `BTN ${gameState.gamepadConfig[`p${pNum}Mapping`][action]}`}
                                                          </span>
                                                        </button>
                                                      );
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                        </div>
                                    )}
                                    <button onMouseEnter={() => setSettingsIndex(settingsTab === 'audio_video' ? 7 : 9)} onClick={() => setMenuState('main')} className={`w-full mt-2 bg-[#4ecdc4] text-[#1a1a2e] py-1.5 rounded font-bold text-xs ${settingsIndex === (settingsTab === 'audio_video' ? 7 : 9) ? 'ring-2 ring-white scale-105' : ''}`}>DONE</button>
                                </div>
                            </div>
                        )}

                        {menuState !== 'leaderboard' && !isMobile && (
                            <div className="absolute bottom-6 left-6 right-6 flex gap-6 z-30" id="tour-controls">
                                <div className="flex-1 bg-[#1a1a2e] border border-[#2a2a4e] p-3 rounded-xl flex gap-3 items-start">
                                    <div className="w-6 h-6 rounded-full bg-[#4ecdc4]/20 flex items-center justify-center text-[#4ecdc4] font-bold text-xs border border-[#4ecdc4]/40">i</div>
                                    <div className="flex flex-col"><span className="text-[#4ecdc4] font-bold text-[10px] uppercase tracking-widest mb-1">Player 1 Controls</span><ul className="text-gray-300 text-[11px] space-y-0.5 leading-tight"><li>WASD / Stick</li><li>J / K / L or Buttons</li></ul></div>
                                </div>
                                <div className={`flex-1 bg-[#1a1a2e] border ${gameState.isCPUGame ? 'border-[#4ecdc4]' : 'border-[#2a2a4e]'} p-3 rounded-xl flex gap-3 items-start`}>
                                    <div className={`w-6 h-6 rounded-full ${gameState.isCPUGame ? 'bg-[#4ecdc4]/20 text-[#4ecdc4]' : 'bg-[#e94560]/20 text-[#e94560]'} flex items-center justify-center font-bold text-xs border`}>i</div>
                                    <div className="flex flex-col"><span className={`${gameState.isCPUGame ? 'text-[#4ecdc4]' : 'text-[#e94560]'} font-bold text-[10px] uppercase tracking-widest mb-1`}>{gameState.isCPUGame ? 'P1 Alt Controls' : 'Player 2 Controls'}</span><ul className="text-gray-300 text-[11px] space-y-0.5 leading-tight"><li>Arrows / Stick</li><li>1 / 2 / 3 or Buttons</li></ul></div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                {gameState.isReplaying && <ReplayOverlay progress={gameState.replayProgress} speed={gameState.replaySpeed} activeIndex={replayControlIndex} onSeek={handleSeek} onSetSpeed={handleSpeed} onExit={toggleReplay} onMouseEnter={setReplayControlIndex} />}
                {gameState.showGameOver && !gameState.isReplaying && !gameState.opponentDisconnected && <GameOverOverlay state={gameState} index={gameOverIndex} onRematch={() => { gameRef.current?.restartGame(gameRef.current.isCPUGame, gameRef.current.isDemoMode); playBase64Mp3(); }} onToggleReplay={toggleReplay} onMainMenu={() => gameState.isMultiplayer ? window.location.reload() : setMenuState('main')} onMouseEnter={setGameOverIndex} />}

                {gameState.opponentDisconnected && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 z-50">
                        <div className="text-4xl text-[#e94560] font-bold mb-6">⚠️ OPPONENT DISCONNECTED</div>
                        <button onClick={() => window.location.reload()} className="bg-[#4ecdc4] text-[#1a1a2e] px-8 py-3 rounded-lg font-bold text-xl">RETURN TO MENU</button>
                    </div>
                )}

                <div className={`crt-overlay ${gameState.crtScanlines ? 'crt-scanlines' : ''} ${gameState.crtVignette ? 'crt-vignette' : ''} ${gameState.crtFlicker ? 'crt-flicker' : ''}`}></div>
                <div className="screen-reflection"></div>
            </div>
        </div>

        {!isMobile && (
          <div className="tv-controls">
              <div className="speaker-grill"></div>
              <div className="flex flex-col items-center"><div className="tv-brand">POLYTRON</div></div>
              <div className="tv-buttons"><div className="power-led"></div><div className="power-btn"></div></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;