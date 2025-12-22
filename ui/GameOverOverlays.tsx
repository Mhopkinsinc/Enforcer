import React from 'react';
import { PixelText } from './PixelText';
import { GameState } from '../types';

interface GameOverProps {
  state: GameState;
  index: number;
  onRematch: () => void;
  onToggleReplay: () => void;
  onMainMenu: () => void;
  onMouseEnter: (i: number) => void;
}

export const GameOverOverlay: React.FC<GameOverProps> = ({ state, index, onRematch, onToggleReplay, onMainMenu, onMouseEnter }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
      <div className="mb-8 animate-bounce flex flex-col items-center">
          {state.isMultiplayer ? (
              ((state.isHost && state.winner === 'PLAYER 1') || (!state.isHost && state.winner === 'PLAYER 2')) ? (
                  <PixelText text="YOU WIN" scale={6} />
              ) : (
                  <PixelText text="YOU LOSE" scale={6} />
              )
          ) : state.isCPUGame ? (
              state.winner === 'PLAYER 1' ? (
                  <PixelText text="YOU WIN" scale={6} />
              ) : (
                  <PixelText text="YOU LOSE" scale={6} />
              )
          ) : (
              <PixelText text={`${state.winner} WINS`} scale={5} />
          )}
      </div>
      <div className="flex flex-col gap-3 items-center">
          {(!state.isMultiplayer || state.isHost) ? (
              <button
                  onMouseEnter={() => onMouseEnter(0)}
                  onClick={onRematch}
                  className={`px-6 py-2 rounded-full font-bold shadow-lg transition-transform ${index === 0 ? 'scale-110 ring-4 ring-white' : ''} bg-[#4ecdc4] text-[#1a1a2e] hover:bg-[#3dbdb4]`}
              >
                  {state.isMultiplayer ? "REMATCH (SPACE)" : "FIGHT AGAIN (SPACE)"}
              </button>
          ) : (
              <div className="px-6 py-2 rounded-full font-bold shadow-lg bg-gray-600 text-gray-300 opacity-70 cursor-default">
                  Wait for Host...
              </div>
          )}
          <button 
              onMouseEnter={() => onMouseEnter(1)}
              onClick={onToggleReplay}
              className={`mt-2 bg-[#e94560] text-white px-6 py-2 rounded-full font-bold shadow-lg hover:bg-[#d43750] transition-transform ${index === 1 ? 'scale-110 ring-4 ring-white' : ''}`}
          >
              🎥 WATCH REPLAY
          </button>
          <button 
              onMouseEnter={() => onMouseEnter(2)}
              onClick={onMainMenu} 
              className={`mt-2 bg-[#16213e] border-2 border-[#4ecdc4] text-white px-6 py-2 rounded-full font-bold shadow-lg hover:bg-[#1f2b4d] transition-transform ${index === 2 ? 'scale-110 ring-4 ring-white' : ''}`}
          >
              {state.isMultiplayer ? "DISCONNECT" : "MAIN MENU"}
          </button>
      </div>
  </div>
);

interface ReplayProps {
  progress: number;
  speed: number;
  activeIndex: number;
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSetSpeed: (s: number) => void;
  onExit: () => void;
  onMouseEnter: (i: number) => void;
}

export const ReplayOverlay: React.FC<ReplayProps> = ({ progress, speed, activeIndex, onSeek, onSetSpeed, onExit, onMouseEnter }) => (
  <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-4 border-t-2 border-[#e94560] z-30">
      <div className="flex flex-col gap-2">
          <input 
              type="range" 
              min="0" max="1" step="0.001"
              value={progress}
              onChange={onSeek}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#e94560]"
          />
          <div className="flex justify-center items-center gap-4 mt-2">
              <button onMouseEnter={() => onMouseEnter(0)} onClick={() => onSetSpeed(-2)} className={`px-3 py-1 rounded transition-transform ${speed === -2 ? 'bg-[#e94560]' : 'bg-gray-700'} ${activeIndex === 0 ? 'ring-2 ring-white scale-110' : ''}`}>⏪</button>
              <button onMouseEnter={() => onMouseEnter(1)} onClick={() => onSetSpeed(0)} className={`px-3 py-1 rounded transition-transform ${speed === 0 ? 'bg-[#e94560]' : 'bg-gray-700'} ${activeIndex === 1 ? 'ring-2 ring-white scale-110' : ''}`}>⏸</button>
              <button onMouseEnter={() => onMouseEnter(2)} onClick={() => onSetSpeed(1)} className={`px-3 py-1 rounded transition-transform ${speed === 1 ? 'bg-[#e94560]' : 'bg-gray-700'} ${activeIndex === 2 ? 'ring-2 ring-white scale-110' : ''}`}>▶</button>
              <button onMouseEnter={() => onMouseEnter(3)} onClick={() => onSetSpeed(2)} className={`px-3 py-1 rounded transition-transform ${speed === 2 ? 'bg-[#e94560]' : 'bg-gray-700'} ${activeIndex === 3 ? 'ring-2 ring-white scale-110' : ''}`}>⏩</button>
              <button onMouseEnter={() => onMouseEnter(4)} onClick={onExit} className={`px-3 py-1 rounded transition-transform bg-red-600 text-white font-bold ml-4 hover:bg-red-500 ${activeIndex === 4 ? 'ring-2 ring-white scale-110' : ''}`}>EXIT REPLAY</button>
          </div>
      </div>
  </div>
);