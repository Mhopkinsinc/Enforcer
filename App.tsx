
import { THEME_SONG_B64 } from './game/sfx/music';
import { FULLRINK_SHEET_B64 } from './game/sprites/fullrinkbkg';
import React, { useEffect, useRef, useState } from 'react';
import { Engine, DisplayMode, Color } from 'excalibur';
import { HockeyGame } from './game/HockeyGame';
import { GameState, GamepadSettings } from './types';
import { NetworkManager } from './game/NetworkManager';
import { SMALLFONT_SHEET_B64 } from './game/sprites/smallfontsheet';

// Declare Driver.js global if needed, but we use the IIFE version which attaches to window
declare const driver: any;

const ALPHABET = " !\"#©%&'()✓+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~■";
const SETTINGS_STORAGE_KEY = 'hockey_fight_settings';
const PLAYER_ID_KEY = 'hockey_fight_player_id';

const PixelText: React.FC<{ text: string; scale?: number }> = ({ text, scale = 3 }) => {
  return (
    <div className="flex flex-row gap-0">
      {text.split('').map((char, i) => {
        const index = ALPHABET.indexOf(char);
        if (index === -1) return <div key={i} style={{ width: 8 * scale }} />;
        
        const col = index % 32;
        const row = Math.floor(index / 32);
        
        return (
          <div
            key={i}
            style={{
              width: 8 * scale,
              height: 8 * scale,
              backgroundImage: `url(${SMALLFONT_SHEET_B64})`,
              backgroundSize: `${32 * 8 * scale}px ${3 * 8 * scale + (8 * scale)}px`, // Account for the 8px top offset in sheet
              backgroundPosition: `-${col * 8 * scale}px -${(row + 1) * 8 * scale}px`,
              imageRendering: 'pixelated',
            }}
          />
        );
      })}
    </div>
  );
};

const DEFAULT_GAME_STATE: GameState = {
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
  isDemoMode: false,
  demoText: "",
  connectionStatus: 'disconnected',
  opponentDisconnected: false,
  sfxVolume: 0.15,
  crtScanlines: false,
  crtFlicker: false,
  crtVignette: true,
  nickname: 'PLAYER',
  gamepadConfig: {
      p1Index: null,
      p2Index: null,
      p1Mapping: { highPunch: 3, lowPunch: 0, grab: 2 },
      p2Mapping: { highPunch: 3, lowPunch: 0, grab: 2 }
  }
};

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HockeyGame | null>(null);
  const networkRef = useRef<NetworkManager | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const lastInputTime = useRef<number>(0);

  // Initialize State from LocalStorage if available
  const [gameState, setGameState] = useState<GameState>(() => {
    let savedSettings = {};
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Extract saved settings
        savedSettings = {
          sfxVolume: parsed.sfxVolume,
          crtScanlines: parsed.crtScanlines,
          crtFlicker: parsed.crtFlicker,
          crtVignette: parsed.crtVignette,
          gamepadConfig: parsed.gamepadConfig,
          nickname: parsed.nickname || 'PLAYER'
        };
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }

    // Check/Create Player ID
    let playerId = localStorage.getItem(PLAYER_ID_KEY);
    if (!playerId) {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                playerId = crypto.randomUUID();
            } else {
                // Fallback UUID v4 generator
                playerId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }
        } catch (e) {
            playerId = 'player-' + Date.now().toString(36) + Math.random().toString(36).substring(2);
        }
        localStorage.setItem(PLAYER_ID_KEY, playerId);
    }

    return {
      ...DEFAULT_GAME_STATE,
      ...savedSettings,
      playerId: playerId
    };
  });
  
  // Ref to hold latest gameState for polling loops without triggering re-effects
  const gameStateRef = useRef(gameState);
  useEffect(() => {
      gameStateRef.current = gameState;
  }, [gameState]);

  const [menuState, setMenuState] = useState<'main' | 'host' | 'join' | 'game' | 'settings' | 'leaderboard'>('main');
  const [mainMenuIndex, setMainMenuIndex] = useState(0); 
  // Main Menu Index Mapping:
  // 0: Local/Demo, 1: CPU
  // 2: Host, 3: Join
  // 4: Leaderboard
  // 5: Settings

  const [gameOverIndex, setGameOverIndex] = useState(0);
  // Game Over Index Mapping:
  // 0: Rematch
  // 1: Watch Replay
  // 2: Main Menu

  const [settingsIndex, setSettingsIndex] = useState(0); 
  const [roomId, setRoomId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [settingsTab, setSettingsTab] = useState<'audio_video' | 'controls'>('audio_video');
  const [availableGamepads, setAvailableGamepads] = useState<(Gamepad | null)[]>([]);
  const [remapping, setRemapping] = useState<{ player: 1 | 2, action: 'highPunch' | 'lowPunch' | 'grab' } | null>(null);

  // Responsive Scaling Logic
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      // Dimensions of the TV case including padding and controls
      const contentWidth = 920; 
      const contentHeight = 600;

      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      const scaleX = windowWidth / contentWidth;
      const scaleY = windowHeight / contentHeight;

      // Fit within screen, maintaining aspect ratio. 
      // Using 0.95 factor to leave a small safety margin.
      const newScale = Math.min(scaleX, scaleY) * 0.95;
      
      setScale(newScale);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Save settings to LocalStorage whenever they change
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
      antialiasing: false,
      suppressHiDPIScaling: true
    });

    // Apply saved settings to engine immediately
    game.setSFXVolume(gameState.sfxVolume);
    game.updateGamepadSettings(gameState.gamepadConfig);

    game.start().then(() => {
        game.setupGame((state) => {
            setGameState(prev => ({ 
              ...prev, 
              ...state,
              // Ensure we don't overwrite our local settings with game defaults if the game sends them back
              sfxVolume: prev.sfxVolume, 
              crtScanlines: prev.crtScanlines,
              crtFlicker: prev.crtFlicker,
              crtVignette: prev.crtVignette,
              gamepadConfig: prev.gamepadConfig,
              playerId: prev.playerId, // Persist player ID
              nickname: prev.nickname // Persist nickname
            }));
        });
        game.restartGame(false, true);
    });

    gameRef.current = game;

    const handleKeyDown = (e: KeyboardEvent) => {
        if (game.opponentDisconnected) return;

        // Exit Demo Mode with Escape
        if (game.isDemoMode && e.key === 'Escape') {
            setMenuState('main');
            if (musicRef.current) {
                musicRef.current.pause();
                musicRef.current.currentTime = 0;
            }
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
      if ((game as any).dispose) (game as any).dispose();
      if (networkRef.current) networkRef.current.destroy();
      if (musicRef.current) musicRef.current.pause();
    };
  }, []);

  const cycleInput = (player: 1 | 2, direction: 1 | -1) => {
      const gps = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      const current = player === 1 ? gameStateRef.current.gamepadConfig.p1Index : gameStateRef.current.gamepadConfig.p2Index;
      // Map null (kb) to -1
      let val = current === null ? -1 : current;
      val += direction;

      // Range is -1 to gps.length - 1
      // If we go below -1, wrap to end
      if (val < -1) val = gps.length - 1;
      // If we go above length-1, wrap to -1
      if (val >= gps.length) val = -1;

      // Map -1 back to null, else use val
      updateGamepadAssignment(player, val === -1 ? 'kb' : val.toString());
  };

  // Poll Gamepads for Navigation (Main & Settings & Game Over)
  useEffect(() => {
    // Only block gamepad navigation if we are in game AND not showing game over.
    // If we are in game AND showing game over, we want navigation.
    if ((menuState === 'game' && !gameState.showGameOver) || menuState === 'host' || menuState === 'join') return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastInputTime.current < 150) return; // Debounce

      const gps = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      let inputFound = false;
      let actionTriggered = false;

      // Check input on any gamepad
      for (const gp of gps) {
        if (!gp) continue;

        // Navigation
        const up = gp.buttons[12]?.pressed || gp.axes[1] < -0.5;
        const down = gp.buttons[13]?.pressed || gp.axes[1] > 0.5;
        const left = gp.buttons[14]?.pressed || gp.axes[0] < -0.5;
        const right = gp.buttons[15]?.pressed || gp.axes[0] > 0.5;
        
        // Select / Back
        const select = gp.buttons[0]?.pressed || gp.buttons[9]?.pressed;
        const back = gp.buttons[1]?.pressed;

        if (menuState === 'game' && gameState.showGameOver && !gameState.isReplaying) {
             let newIndex = gameOverIndex;
             if (up) {
                newIndex = Math.max(0, gameOverIndex - 1);
                inputFound = true;
             } else if (down) {
                newIndex = Math.min(2, gameOverIndex + 1);
                inputFound = true;
             }
             
             if (inputFound && newIndex !== gameOverIndex) setGameOverIndex(newIndex);
             
             if (select) {
                 actionTriggered = true;
                 inputFound = true;
             }

             if (actionTriggered) {
                 lastInputTime.current = now;
                 if (gameOverIndex === 0) { // Rematch
                     if (gameRef.current) {
                        gameRef.current.restartGame(gameRef.current.isCPUGame, gameRef.current.isDemoMode);
                        playBase64Mp3();
                     }
                 } else if (gameOverIndex === 1) { // Watch Replay
                     toggleReplay();
                 } else if (gameOverIndex === 2) { // Main Menu
                     if (gameState.isMultiplayer) {
                         window.location.reload();
                     } else {
                         setMenuState('main');
                     }
                 }
                 return;
             }

        } else if (menuState === 'main') {
            let newIndex = mainMenuIndex;
            
            if (up) {
                if (mainMenuIndex === 2) newIndex = 0;
                else if (mainMenuIndex === 3) newIndex = 1;
                else if (mainMenuIndex === 4) newIndex = 2; // From Leaderboard to Host
                else if (mainMenuIndex === 5) newIndex = 4; // From Settings to Leaderboard
                inputFound = true;
            } else if (down) {
                if (mainMenuIndex === 0) newIndex = 2;
                else if (mainMenuIndex === 1) newIndex = 3;
                else if (mainMenuIndex === 2 || mainMenuIndex === 3) newIndex = 4; // To Leaderboard
                else if (mainMenuIndex === 4) newIndex = 5; // To Settings
                inputFound = true;
            } else if (left) {
                if (mainMenuIndex === 1) newIndex = 0;
                else if (mainMenuIndex === 3) newIndex = 2;
                inputFound = true;
            } else if (right) {
                if (mainMenuIndex === 0) newIndex = 1;
                else if (mainMenuIndex === 2) newIndex = 3;
                inputFound = true;
            }
            
            if (inputFound && newIndex !== mainMenuIndex) setMainMenuIndex(newIndex);
            
            if (select) {
                actionTriggered = true;
                inputFound = true;
            }

            if (actionTriggered) {
                lastInputTime.current = now;
                switch(mainMenuIndex) {
                    case 0: startDemoMode(); break;
                    case 1: startCpuGame(); break;
                    case 2: handleHost(); break;
                    case 3: setMenuState('join'); break;
                    case 4: setMenuState('leaderboard'); break;
                    case 5: 
                        setMenuState('settings'); 
                        setSettingsIndex(0); 
                        break;
                }
                return; // Break interval
            }
        } else if (menuState === 'settings' && !remapping) {
            // Settings Navigation
            const maxIndex = settingsTab === 'audio_video' ? 7 : 9;
            let newIndex = settingsIndex;

            if (up) { newIndex = Math.max(0, settingsIndex - 1); inputFound = true; }
            else if (down) { newIndex = Math.min(maxIndex, settingsIndex + 1); inputFound = true; }

            if (left || right) {
                inputFound = true;
                // Handle Horizontal Actions based on context
                if (settingsIndex === 0) {
                    // Toggle Tab
                    const newTab = settingsTab === 'audio_video' ? 'controls' : 'audio_video';
                    setSettingsTab(newTab);
                    // Reset index slightly to avoid confusion if lists have diff lengths, or just keep 0
                    setSettingsIndex(0);
                    lastInputTime.current = now;
                    return;
                }
                
                if (settingsTab === 'audio_video' && settingsIndex === 1) {
                    // Volume
                    const delta = left ? -0.05 : 0.05;
                    const newVol = Math.max(0, Math.min(1, gameStateRef.current.sfxVolume + delta));
                    setGameState(prev => ({ ...prev, sfxVolume: newVol }));
                    if (gameRef.current) gameRef.current.setSFXVolume(newVol);
                } else if (settingsTab === 'controls') {
                    if (settingsIndex === 1) cycleInput(1, left ? -1 : 1);
                    if (settingsIndex === 5) cycleInput(2, left ? -1 : 1);
                }
            }

            if (inputFound && newIndex !== settingsIndex) setSettingsIndex(newIndex);

            if (select || back) {
                inputFound = true;
                lastInputTime.current = now; // Aggressive debounce for actions

                if (back || (settingsIndex === (settingsTab === 'audio_video' ? 7 : 9) && select)) {
                     setMenuState('main');
                     return;
                }

                if (settingsIndex === 0) {
                   // Clicking tab header triggers switch too
                   setSettingsTab(prev => prev === 'audio_video' ? 'controls' : 'audio_video');
                }
                
                if (settingsTab === 'audio_video') {
                    if (settingsIndex === 2) toggleSetting('crtScanlines');
                    if (settingsIndex === 3) toggleSetting('crtVignette');
                    if (settingsIndex === 4) toggleSetting('crtFlicker');
                    if (settingsIndex === 5) gameRef.current?.playHitSound('high');
                    if (settingsIndex === 6) playBase64Mp3();
                } else {
                    // Controls
                    if (settingsIndex === 2) setRemapping({player: 1, action: 'highPunch'});
                    if (settingsIndex === 3) setRemapping({player: 1, action: 'lowPunch'});
                    if (settingsIndex === 4) setRemapping({player: 1, action: 'grab'});
                    
                    if (settingsIndex === 6) setRemapping({player: 2, action: 'highPunch'});
                    if (settingsIndex === 7) setRemapping({player: 2, action: 'lowPunch'});
                    if (settingsIndex === 8) setRemapping({player: 2, action: 'grab'});
                }
            }
        } else if (menuState === 'leaderboard') {
            if (select || back) {
                setMenuState('main');
                lastInputTime.current = now;
                return;
            }
        }

        if (inputFound) {
            lastInputTime.current = now;
            break; // Handle one controller input per frame
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [menuState, mainMenuIndex, settingsIndex, settingsTab, remapping, gameOverIndex, gameState.showGameOver, gameState.isReplaying]); 

  // Poll Gamepads for Settings Menu Remapping
  useEffect(() => {
    if (menuState !== 'settings') return;

    const interval = setInterval(() => {
        if (navigator.getGamepads) {
            setAvailableGamepads(Array.from(navigator.getGamepads()));
        }

        // Remapping Logic - runs independent of nav
        if (remapping) {
            const gps = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
            // Allow any connected controller to map
            
            for(const gp of gps) {
                if(!gp) continue;
                for (let i = 0; i < gp.buttons.length; i++) {
                    if (gp.buttons[i].pressed) {
                        // Assign button
                        const newConfig = { ...gameStateRef.current.gamepadConfig };
                        if (remapping.player === 1) {
                            newConfig.p1Mapping = { ...newConfig.p1Mapping, [remapping.action]: i };
                        } else {
                            newConfig.p2Mapping = { ...newConfig.p2Mapping, [remapping.action]: i };
                        }
                        
                        setGameState(prev => ({ ...prev, gamepadConfig: newConfig }));
                        if (gameRef.current) {
                            gameRef.current.updateGamepadSettings(newConfig);
                        }
                        setRemapping(null); // End remapping
                        lastInputTime.current = Date.now() + 500; // Extra debounce delay after mapping
                        return;
                    }
                }
            }
        }
    }, 50);

    return () => clearInterval(interval);
  }, [menuState, remapping]);

  // Effect for Walkthrough
  useEffect(() => {
    if (menuState === 'main') {
      const tourComplete = localStorage.getItem('hockey_fight_tour_complete');
      if (!tourComplete && typeof (window as any).driver !== 'undefined') {
        // Use a short timeout to ensure the transform scale has finished calculating
        // and the browser layout has stabilized, which helps Driver.js position highlights correctly.
        const timer = setTimeout(() => {
            const driverObj = (window as any).driver.js.driver({
              showProgress: true,
              animate: true,
              steps: [            
                { element: '#tour-local-btn', popover: { title: 'Demo Mode', description: 'See an automated tutorial of the controls', side: "bottom", align: 'start' }},
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
        }, 300);

        return () => clearTimeout(timer);
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

  const startDemoMode = () => {
      setMenuState('game');
      if (gameRef.current) gameRef.current.restartGame(false, true);
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

  const updateGamepadAssignment = (player: 1 | 2, indexString: string) => {
      const index = indexString === 'kb' ? null : parseInt(indexString);
      const newConfig = { ...gameStateRef.current.gamepadConfig };
      if (player === 1) newConfig.p1Index = index;
      else newConfig.p2Index = index;

      setGameState(prev => ({ ...prev, gamepadConfig: newConfig }));
      if (gameRef.current) {
          gameRef.current.updateGamepadSettings(newConfig);
      }
  };

  const playBase64Mp3 = () => {
    if (!THEME_SONG_B64) return;
    if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current.currentTime = 0;
    }

    const audio = new Audio(`data:audio/mp3;base64,${THEME_SONG_B64}`);
    audio.volume = gameStateRef.current.sfxVolume;
    audio.loop = false;
    audio.play().catch(err => console.error("Error playing base64 audio:", err));
    musicRef.current = audio;
  };

  const toggleSetting = (setting: 'crtScanlines' | 'crtFlicker' | 'crtVignette') => {
      setGameState(prev => ({ ...prev, [setting]: !prev[setting] }));
  };

  return (
    <div 
      className="flex flex-col items-center justify-center h-screen w-screen font-sans relative overflow-hidden bg-black"
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

      <div className="tv-case" id="tour-tv-case" style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
        <div className="tv-screen-bezel">
            <div className="tv-glass-container relative" style={{width: '800px', height: '400px'}}>
                <canvas
                    ref={canvasRef}
                    id="gameCanvas"
                    className="image-pixelated"
                    onContextMenu={(e) => e.preventDefault()}
                />

                {menuState === 'game' && gameState.isDemoMode && gameState.demoText && !gameState.showGameOver && (
                    <div className="absolute top-8 left-0 right-0 flex justify-center z-40">
                        <div className="bg-black/70 px-4 py-2 rounded-lg border-2 border-white/10 shadow-lg backdrop-blur-sm">
                            <PixelText text={gameState.demoText} scale={3} />
                        </div>
                    </div>
                )}

                {menuState !== 'game' && (
                    <div className="absolute inset-0 bg-[#1a1a2e]/95 flex flex-col items-center justify-start pt-10 z-20">
                        {menuState === 'main' && (
                            <div className="absolute top-4 left-4 text-gray-500 text-[10px] font-mono opacity-50">
                                v0.7 - Demo Mode
                            </div>
                        )}
                        {(menuState === 'main' || menuState === 'settings') && (
                            <div className="flex flex-col gap-3 items-center w-[80%] max-w-[400px]">
                                <div className="mb-2 drop-shadow-[0_0_8px_rgba(233,69,96,0.8)]">
                                  <PixelText text="ENFORCER" scale={4} />
                                </div>
                                <div className="flex gap-4 w-full">
                                    <button 
                                      id="tour-local-btn" 
                                      onClick={startDemoMode}
                                      onMouseEnter={() => setMainMenuIndex(0)}
                                      className={`flex-1 bg-[#4ecdc4] text-[#1a1a2e] py-2 rounded-lg font-bold text-lg hover:bg-[#3dbdb4] transition shadow-[0_0_15px_rgba(78,205,196,0.4)] ${mainMenuIndex === 0 && menuState === 'main' ? 'ring-4 ring-white scale-105' : ''}`}
                                    >
                                        DEMO MODE
                                    </button>
                                    <button 
                                      id="tour-cpu-btn" 
                                      onClick={startCpuGame} 
                                      onMouseEnter={() => setMainMenuIndex(1)}
                                      className={`flex-1 bg-[#feca57] text-[#1a1a2e] py-2 rounded-lg font-bold text-lg hover:bg-[#e1b12c] transition shadow-[0_0_15px_rgba(254,202,87,0.4)] ${mainMenuIndex === 1 && menuState === 'main' ? 'ring-4 ring-white scale-105' : ''}`}
                                    >
                                        VS CPU
                                    </button>
                                </div>
                                <div className="flex gap-4 w-full" id="tour-online-section">
                                    <button 
                                      onClick={handleHost} 
                                      onMouseEnter={() => setMainMenuIndex(2)}
                                      className={`flex-1 bg-[#e94560] text-white py-2 rounded-lg font-bold hover:bg-[#d13650] shadow-[0_0_15px_rgba(233,69,96,0.4)] ${mainMenuIndex === 2 && menuState === 'main' ? 'ring-4 ring-white scale-105' : ''}`}
                                    >
                                        HOST ONLINE
                                    </button>
                                    <button 
                                      onClick={() => setMenuState('join')} 
                                      onMouseEnter={() => setMainMenuIndex(3)}
                                      className={`flex-1 bg-[#16213e] border-2 border-[#e94560] text-white py-2 rounded-lg font-bold hover:bg-[#1f2b4d] ${mainMenuIndex === 3 && menuState === 'main' ? 'ring-4 ring-white scale-105' : ''}`}
                                    >
                                        JOIN ONLINE
                                    </button>
                                </div>
                                <button 
                                  onClick={() => setMenuState('leaderboard')}
                                  onMouseEnter={() => setMainMenuIndex(4)}
                                  className={`w-full bg-[#16213e] border-2 border-[#4ecdc4] text-[#4ecdc4] py-2 rounded-lg font-bold hover:bg-[#1f2b4d] shadow-[0_0_10px_rgba(78,205,196,0.2)] ${mainMenuIndex === 4 && menuState === 'main' ? 'ring-4 ring-white scale-105' : ''}`}
                                >
                                    ONLINE LEADERBOARD
                                </button>
                                <button 
                                  id="tour-settings-btn" 
                                  onClick={() => { setMenuState('settings'); setSettingsIndex(0); }}
                                  onMouseEnter={() => setMainMenuIndex(5)}
                                  className={`text-gray-400 hover:text-white mt-2 font-bold tracking-widest text-sm border-b transition-all ${menuState === 'settings' ? 'border-white text-white' : 'border-transparent'} ${mainMenuIndex === 5 && menuState === 'main' ? 'text-white border-white scale-110' : ''}`}
                                >
                                    {menuState === 'settings' ? '' : '⚙️ SETTINGS'}
                                </button>
                            </div>
                        )}

                        {menuState === 'host' && (
                            <div className="flex flex-col items-center justify-center h-[280px] w-full gap-4 text-center p-6">
                                <h2 className="text-2xl text-[#4ecdc4] font-bold mb-2">WAITING FOR PLAYER...</h2>
                                <div className="flex flex-col gap-1 mb-2">
                                    <label className="text-[#4ecdc4] text-[10px] font-bold uppercase tracking-wider">YOUR NICKNAME</label>
                                    <input
                                        type="text"
                                        className="bg-[#16213e] border border-gray-600 p-2 rounded text-white text-center font-mono focus:border-[#4ecdc4] outline-none w-[200px]"
                                        value={gameState.nickname}
                                        onChange={(e) => setGameState(prev => ({...prev, nickname: e.target.value}))}
                                        maxLength={12}
                                        placeholder="PLAYER"
                                    />
                                </div>
                                <div className="bg-[#16213e] p-4 rounded border border-gray-600">
                                    <p className="text-gray-400 text-sm mb-1">SHARE THIS ROOM ID:</p>
                                    <p className="text-2xl font-mono text-white tracking-widest select-all">{roomId}</p>
                                </div>
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mt-2"></div>
                                <button onClick={() => setMenuState('main')} className="text-gray-400 hover:text-white mt-4 underline">Cancel</button>
                            </div>
                        )}

                        {menuState === 'join' && (
                            <div className="flex flex-col items-center justify-center h-[280px] w-full gap-4">
                                <h2 className="text-2xl text-[#e94560] font-bold mb-2">JOIN GAME</h2>
                                <div className="flex flex-col gap-1 w-[200px]">
                                    <label className="text-[#e94560] text-[10px] font-bold uppercase tracking-wider text-center">YOUR NICKNAME</label>
                                    <input
                                        type="text"
                                        className="bg-[#16213e] border border-gray-600 p-2 rounded text-white text-center font-mono focus:border-[#e94560] outline-none w-full"
                                        value={gameState.nickname}
                                        onChange={(e) => setGameState(prev => ({...prev, nickname: e.target.value}))}
                                        maxLength={12}
                                        placeholder="PLAYER"
                                    />
                                </div>
                                <div className="flex flex-col gap-1 w-[200px]">
                                    <label className="text-gray-400 text-[10px] font-bold uppercase tracking-wider text-center">ROOM ID</label>
                                    <input 
                                        type="text" 
                                        placeholder="ENTER ROOM ID"
                                        className="bg-[#16213e] border border-gray-600 p-3 rounded text-white text-center font-mono uppercase focus:border-[#4ecdc4] outline-none w-full"
                                        value={joinId}
                                        onChange={(e) => setJoinId(e.target.value)}
                                    />
                                </div>
                                <div className="flex gap-4 mt-2">
                                    <button onClick={() => setMenuState('main')} className="text-gray-400 hover:text-white">Back</button>
                                    <button onClick={handleJoin} className="bg-[#4ecdc4] text-[#1a1a2e] px-6 py-2 rounded font-bold hover:bg-[#3dbdb4]">
                                        CONNECT
                                    </button>
                                </div>
                            </div>
                        )}

                        {menuState === 'leaderboard' && (
                            <div className="flex flex-col items-center justify-center h-[280px] w-full gap-4 p-6 text-center">
                                <h2 className="text-2xl text-[#feca57] font-bold mb-4">ONLINE LEADERBOARD</h2>
                                <div className="bg-[#16213e] p-8 rounded border border-gray-600 w-full max-w-[400px] flex items-center justify-center min-h-[150px]">
                                    <p className="text-gray-400 text-lg animate-pulse tracking-widest">COMING SOON</p>
                                </div>
                                <button onClick={() => setMenuState('main')} className="text-gray-400 hover:text-white mt-4 underline">
                                    BACK
                                </button>
                            </div>
                        )}

                        {menuState === 'settings' && (
                            <div className="absolute top-[30px] bottom-[135px] left-1/2 -translate-x-1/2 flex flex-col bg-[#16213e] rounded-xl border-2 border-[#e94560] shadow-2xl min-w-[340px] overflow-hidden z-50">
                                <div className={`flex w-full border-b border-gray-700 ${settingsIndex === 0 ? 'ring-2 ring-white z-10' : ''}`}>
                                    <button 
                                        className={`flex-1 py-2 text-xs font-bold ${settingsTab === 'audio_video' ? 'bg-[#e94560] text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                        onClick={() => { setSettingsTab('audio_video'); setSettingsIndex(0); }}
                                    >
                                        AUDIO / VIDEO
                                    </button>
                                    <button 
                                        className={`flex-1 py-2 text-xs font-bold ${settingsTab === 'controls' ? 'bg-[#e94560] text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                        onClick={() => { setSettingsTab('controls'); setSettingsIndex(0); }}
                                    >
                                        CONTROLS
                                    </button>
                                </div>
                                <div className="px-6 py-3 flex flex-col items-center gap-2 overflow-y-auto max-h-[300px]">
                                    {settingsTab === 'audio_video' && (
                                        <>
                                            <div className={`w-full p-1 rounded ${settingsIndex === 1 ? 'bg-white/10 ring-1 ring-[#4ecdc4]' : ''}`}>
                                                <label className="flex justify-between text-[#4ecdc4] mb-1 font-bold text-xs">
                                                    <span>SFX VOLUME</span>
                                                    <span>{Math.round(gameState.sfxVolume * 100)}%</span>
                                                </label>
                                                <input 
                                                    type="range" 
                                                    min="0" max="1" step="0.05"
                                                    value={gameState.sfxVolume}
                                                    onChange={handleVolumeChange}
                                                    onMouseEnter={() => setSettingsIndex(1)}
                                                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#e94560] hover:accent-[#ff6b81]"
                                                />
                                            </div>
                                            <div className="w-full flex flex-col gap-1">
                                                <div className="text-[#4ecdc4] font-bold text-[10px] uppercase">Visual Filters</div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <label className={`flex flex-col items-center cursor-pointer group p-1 rounded ${settingsIndex === 2 ? 'bg-white/10 ring-1 ring-[#e94560]' : ''}`} onMouseEnter={() => setSettingsIndex(2)}>
                                                        <span className="text-gray-300 text-[10px] mb-1">Scan</span>
                                                        <input type="checkbox" checked={gameState.crtScanlines} onChange={() => toggleSetting('crtScanlines')} className="w-3 h-3 accent-[#e94560]"/>
                                                    </label>
                                                    <label className={`flex flex-col items-center cursor-pointer group p-1 rounded ${settingsIndex === 3 ? 'bg-white/10 ring-1 ring-[#e94560]' : ''}`} onMouseEnter={() => setSettingsIndex(3)}>
                                                        <span className="text-gray-300 text-[10px] mb-1">Vignette</span>
                                                        <input type="checkbox" checked={gameState.crtVignette} onChange={() => toggleSetting('crtVignette')} className="w-3 h-3 accent-[#e94560]"/>
                                                    </label>
                                                    <label className={`flex flex-col items-center cursor-pointer group p-1 rounded ${settingsIndex === 4 ? 'bg-white/10 ring-1 ring-[#e94560]' : ''}`} onMouseEnter={() => setSettingsIndex(4)}>
                                                        <span className="text-gray-300 text-[10px] mb-1">Flicker</span>
                                                        <input type="checkbox" checked={gameState.crtFlicker} onChange={() => toggleSetting('crtFlicker')} className="w-3 h-3 accent-[#e94560]"/>
                                                    </label>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 w-full mt-1">
                                                <button 
                                                    onMouseEnter={() => setSettingsIndex(5)}
                                                    onClick={() => { if (gameRef.current) gameRef.current.playHitSound('high'); }} 
                                                    className={`flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 rounded font-bold text-[10px] transition-colors ${settingsIndex === 5 ? 'ring-2 ring-white' : ''}`}
                                                >
                                                    SFX TEST
                                                </button>
                                                <button 
                                                    onMouseEnter={() => setSettingsIndex(6)}
                                                    onClick={playBase64Mp3} 
                                                    className={`flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 rounded font-bold text-[10px] transition-colors ${settingsIndex === 6 ? 'ring-2 ring-white' : ''}`}
                                                >
                                                    SONG
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {settingsTab === 'controls' && (
                                        <div className="w-full flex flex-col gap-3">
                                            <div className="bg-black/30 p-2 rounded">
                                                <div className="text-[#4ecdc4] font-bold text-[10px] uppercase mb-1">PLAYER 1 INPUT</div>
                                                <select 
                                                    className={`w-full bg-[#1a1a2e] text-white text-xs border border-gray-600 rounded p-1 ${settingsIndex === 1 ? 'ring-2 ring-[#4ecdc4]' : ''}`}
                                                    value={gameState.gamepadConfig.p1Index === null ? 'kb' : gameState.gamepadConfig.p1Index}
                                                    onChange={(e) => updateGamepadAssignment(1, e.target.value)}
                                                    onMouseEnter={() => setSettingsIndex(1)}
                                                >
                                                    <option value="kb">Keyboard (WASD)</option>
                                                    {availableGamepads.map((gp, i) => gp && (
                                                        <option key={i} value={i}>Gamepad {i + 1}: {gp.id.substring(0, 15)}...</option>
                                                    ))}
                                                </select>
                                                {gameState.gamepadConfig.p1Index !== null && (
                                                    <div className="mt-2 grid grid-cols-3 gap-1">
                                                        <button 
                                                            onMouseEnter={() => setSettingsIndex(2)}
                                                            onClick={() => setRemapping({player: 1, action: 'highPunch'})}
                                                            className={`text-[9px] py-1 px-1 rounded ${remapping?.player === 1 && remapping?.action === 'highPunch' ? 'bg-red-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'} ${settingsIndex === 2 ? 'ring-1 ring-white' : ''}`}
                                                        >
                                                            HI Punch: {gameState.gamepadConfig.p1Mapping.highPunch}
                                                        </button>
                                                        <button 
                                                            onMouseEnter={() => setSettingsIndex(3)}
                                                            onClick={() => setRemapping({player: 1, action: 'lowPunch'})}
                                                            className={`text-[9px] py-1 px-1 rounded ${remapping?.player === 1 && remapping?.action === 'lowPunch' ? 'bg-red-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'} ${settingsIndex === 3 ? 'ring-1 ring-white' : ''}`}
                                                        >
                                                            LO Punch: {gameState.gamepadConfig.p1Mapping.lowPunch}
                                                        </button>
                                                        <button 
                                                            onMouseEnter={() => setSettingsIndex(4)}
                                                            onClick={() => setRemapping({player: 1, action: 'grab'})}
                                                            className={`text-[9px] py-1 px-1 rounded ${remapping?.player === 1 && remapping?.action === 'grab' ? 'bg-red-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'} ${settingsIndex === 4 ? 'ring-1 ring-white' : ''}`}
                                                        >
                                                            Hold: {gameState.gamepadConfig.p1Mapping.grab}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="bg-black/30 p-2 rounded">
                                                <div className="text-[#e94560] font-bold text-[10px] uppercase mb-1">PLAYER 2 INPUT</div>
                                                <select 
                                                    className={`w-full bg-[#1a1a2e] text-white text-xs border border-gray-600 rounded p-1 ${settingsIndex === 5 ? 'ring-2 ring-[#e94560]' : ''}`}
                                                    value={gameState.gamepadConfig.p2Index === null ? 'kb' : gameState.gamepadConfig.p2Index}
                                                    onChange={(e) => updateGamepadAssignment(2, e.target.value)}
                                                    onMouseEnter={() => setSettingsIndex(5)}
                                                >
                                                    <option value="kb">Keyboard (Arrows)</option>
                                                    {availableGamepads.map((gp, i) => gp && (
                                                        <option key={i} value={i}>Gamepad {i + 1}: {gp.id.substring(0, 15)}...</option>
                                                    ))}
                                                </select>
                                                {gameState.gamepadConfig.p2Index !== null && (
                                                    <div className="mt-2 grid grid-cols-3 gap-1">
                                                        <button 
                                                            onMouseEnter={() => setSettingsIndex(6)}
                                                            onClick={() => setRemapping({player: 2, action: 'highPunch'})}
                                                            className={`text-[9px] py-1 px-1 rounded ${remapping?.player === 2 && remapping?.action === 'highPunch' ? 'bg-red-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'} ${settingsIndex === 6 ? 'ring-1 ring-white' : ''}`}
                                                        >
                                                            HI: {gameState.gamepadConfig.p2Mapping.highPunch}
                                                        </button>
                                                        <button 
                                                            onMouseEnter={() => setSettingsIndex(7)}
                                                            onClick={() => setRemapping({player: 2, action: 'lowPunch'})}
                                                            className={`text-[9px] py-1 px-1 rounded ${remapping?.player === 2 && remapping?.action === 'lowPunch' ? 'bg-red-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'} ${settingsIndex === 7 ? 'ring-1 ring-white' : ''}`}
                                                        >
                                                            LO: {gameState.gamepadConfig.p2Mapping.lowPunch}
                                                        </button>
                                                        <button 
                                                            onMouseEnter={() => setSettingsIndex(8)}
                                                            onClick={() => setRemapping({player: 2, action: 'grab'})}
                                                            className={`text-[9px] py-1 px-1 rounded ${remapping?.player === 2 && remapping?.action === 'grab' ? 'bg-red-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'} ${settingsIndex === 8 ? 'ring-1 ring-white' : ''}`}
                                                        >
                                                            GR: {gameState.gamepadConfig.p2Mapping.grab}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            {remapping && (
                                                <div className="text-[10px] text-yellow-400 text-center animate-pulse">
                                                    PRESS BUTTON ON CONTROLLER...
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <button 
                                        onMouseEnter={() => setSettingsIndex(settingsTab === 'audio_video' ? 7 : 9)}
                                        onClick={() => setMenuState('main')} 
                                        className={`w-full mt-2 bg-[#4ecdc4] hover:bg-[#3dbdb4] text-[#1a1a2e] py-1.5 rounded font-bold text-xs transition-colors ${settingsIndex === (settingsTab === 'audio_video' ? 7 : 9) ? 'ring-2 ring-white scale-105' : ''}`}
                                    >
                                        DONE
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="absolute bottom-6 left-6 right-6 flex gap-6 z-30" id="tour-controls">
                            <div className="flex-1 bg-[#1a1a2e] border border-[#2a2a4e] p-3 rounded-xl shadow-2xl flex gap-3 items-start">
                                <div className="w-6 h-6 rounded-full bg-[#4ecdc4]/20 flex items-center justify-center text-[#4ecdc4] font-bold text-xs border border-[#4ecdc4]/40">i</div>
                                <div className="flex flex-col">
                                    <span className="text-[#4ecdc4] font-bold text-[10px] uppercase tracking-widest mb-1">Player 1 Controls</span>
                                    <ul className="text-gray-300 text-[11px] space-y-0.5 leading-tight">
                                        <li className="flex items-center gap-2"><span className="w-1 h-1 bg-white rounded-full"></span> WASD / Stick</li>
                                        <li className="flex items-center gap-2"><span className="w-1 h-1 bg-white rounded-full"></span> J / K / L or Buttons</li>
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
                                        <li className="flex items-center gap-2"><span className="w-1 h-1 bg-white rounded-full"></span> Arrows / Stick</li>
                                        <li className="flex items-center gap-2"><span className="w-1 h-1 bg-white rounded-full"></span> 1 / 2 / 3 or Buttons</li>
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
                        <div className="mb-8 animate-bounce flex flex-col items-center">
                            {gameState.isMultiplayer ? (
                                ((gameState.isHost && gameState.winner === 'PLAYER 1') || (!gameState.isHost && gameState.winner === 'PLAYER 2')) ? (
                                    <PixelText text="YOU WIN" scale={6} />
                                ) : (
                                    <PixelText text="YOU LOSE" scale={6} />
                                )
                            ) : gameState.isCPUGame ? (
                                gameState.winner === 'PLAYER 1' ? (
                                    <PixelText text="YOU WIN" scale={6} />
                                ) : (
                                    <PixelText text="YOU LOSE" scale={6} />
                                )
                            ) : (
                                <PixelText text={`${gameState.winner} WINS`} scale={5} />
                            )}
                        </div>
                        <div className="flex flex-col gap-3 items-center">
                            {(!gameState.isMultiplayer || gameState.isHost) ? (
                                <button
                                    onMouseEnter={() => setGameOverIndex(0)}
                                    onClick={() => { if(gameRef.current) { gameRef.current.restartGame(gameRef.current.isCPUGame, gameRef.current.isDemoMode); playBase64Mp3(); }}}
                                    className={`px-6 py-2 rounded-full font-bold shadow-lg transition-transform ${gameOverIndex === 0 ? 'scale-110 ring-4 ring-white' : ''} bg-[#4ecdc4] text-[#1a1a2e] hover:bg-[#3dbdb4]`}
                                >
                                    {gameState.isMultiplayer ? "REMATCH (SPACE)" : "FIGHT AGAIN (SPACE)"}
                                </button>
                            ) : (
                                <div className="px-6 py-2 rounded-full font-bold shadow-lg bg-gray-600 text-gray-300 opacity-70 cursor-default">
                                    Waiting for Host...
                                </div>
                            )}
                            <button 
                                onMouseEnter={() => setGameOverIndex(1)}
                                onClick={toggleReplay}
                                className={`mt-2 bg-[#e94560] text-white px-6 py-2 rounded-full font-bold shadow-lg hover:bg-[#d43750] transition-transform ${gameOverIndex === 1 ? 'scale-110 ring-4 ring-white' : ''}`}
                            >
                                🎥 WATCH REPLAY
                            </button>
                            <button 
                                onMouseEnter={() => setGameOverIndex(2)}
                                onClick={() => gameState.isMultiplayer ? window.location.reload() : setMenuState('main')} 
                                className={`mt-2 bg-[#16213e] border-2 border-[#4ecdc4] text-white px-6 py-2 rounded-full font-bold shadow-lg hover:bg-[#1f2b4d] transition-transform ${gameOverIndex === 2 ? 'scale-110 ring-4 ring-white' : ''}`}
                            >
                                {gameState.isMultiplayer ? "DISCONNECT" : "MAIN MENU"}
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