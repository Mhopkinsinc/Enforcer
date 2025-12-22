import React from 'react';
import { PixelText } from './PixelText';    
import { MOCK_LEADERBOARD } from '../appConstants';
import { GameState } from '../types';

interface MenuProps {
  onStartDemo: () => void;
  onStartCpu: () => void;
  onHost: () => void;
  onJoin: () => void;
  onShowLeaderboard: () => void;
  onShowSettings: () => void;
  onClose: () => void;
  mainMenuIndex: number;
  setMainMenuIndex: (i: number) => void;
}

export const MainMenu: React.FC<MenuProps> = ({ 
  onStartDemo, onStartCpu, onHost, onJoin, onShowLeaderboard, onShowSettings, mainMenuIndex, setMainMenuIndex 
}) => (
  <div className="flex flex-col gap-3 items-center w-[80%] max-w-[400px]">
    <div className="mb-2 drop-shadow-[0_0_8px_rgba(233,69,96,0.8)]">
      <PixelText text="ENFORCER" scale={4} />
    </div>
    <div className="flex gap-4 w-full">
        <button 
          id="tour-local-btn" 
          onClick={onStartDemo}
          onMouseEnter={() => setMainMenuIndex(0)}
          className={`flex-1 bg-[#4ecdc4] text-[#1a1a2e] py-2 rounded-lg font-bold text-lg hover:bg-[#3dbdb4] transition shadow-[0_0_15px_rgba(78,205,196,0.4)] ${mainMenuIndex === 0 ? 'ring-4 ring-white scale-105' : ''}`}
        >
            DEMO MODE
        </button>
        <button 
          id="tour-cpu-btn" 
          onClick={onStartCpu} 
          onMouseEnter={() => setMainMenuIndex(1)}
          className={`flex-1 bg-[#feca57] text-[#1a1a2e] py-2 rounded-lg font-bold text-lg hover:bg-[#e1b12c] transition shadow-[0_0_15px_rgba(254,202,87,0.4)] ${mainMenuIndex === 1 ? 'ring-4 ring-white scale-105' : ''}`}
        >
            VS CPU
        </button>
    </div>
    <div className="flex gap-4 w-full" id="tour-online-section">
        <button 
          onClick={onHost} 
          onMouseEnter={() => setMainMenuIndex(2)}
          className={`flex-1 bg-[#e94560] text-white py-2 rounded-lg font-bold hover:bg-[#d13650] shadow-[0_0_15px_rgba(233,69,96,0.4)] ${mainMenuIndex === 2 ? 'ring-4 ring-white scale-105' : ''}`}
        >
            HOST ONLINE
        </button>
        <button 
          onClick={onJoin} 
          onMouseEnter={() => setMainMenuIndex(3)}
          className={`flex-1 bg-[#16213e] border-2 border-[#e94560] text-white py-2 rounded-lg font-bold hover:bg-[#1f2b4d] ${mainMenuIndex === 3 ? 'ring-4 ring-white scale-105' : ''}`}
        >
            JOIN ONLINE
        </button>
    </div>
    <button 
      onClick={onShowLeaderboard}
      onMouseEnter={() => setMainMenuIndex(4)}
      className={`w-full bg-[#16213e] border-2 border-[#4ecdc4] text-[#4ecdc4] py-2 rounded-lg font-bold hover:bg-[#1f2b4d] shadow-[0_0_10px_rgba(78,205,196,0.2)] ${mainMenuIndex === 4 ? 'ring-4 ring-white scale-105' : ''}`}
    >
        ONLINE LEADERBOARD
    </button>
    <button 
      id="tour-settings-btn" 
      onClick={onShowSettings}
      onMouseEnter={() => setMainMenuIndex(5)}
      className={`text-gray-400 hover:text-white mt-2 font-bold tracking-widest text-sm border-b transition-all ${mainMenuIndex === 5 ? 'text-white border-white scale-110' : ''}`}
    >
        ⚙️ SETTINGS
    </button>
  </div>
);

export const HostMenu: React.FC<{ roomId: string, nickname: string, setNickname: (s: string) => void, onCancel: () => void }> = ({ roomId, nickname, setNickname, onCancel }) => (
  <div className="flex flex-col items-center justify-center h-[280px] w-full gap-4 text-center p-6">
      <h2 className="text-2xl text-[#4ecdc4] font-bold mb-2">WAITING FOR PLAYER...</h2>
      <div className="flex flex-col gap-1 mb-2">
          <label className="text-[#4ecdc4] text-[10px] font-bold uppercase tracking-wider">YOUR NICKNAME</label>
          <input
              type="text"
              className="bg-[#16213e] border border-gray-600 p-2 rounded text-white text-center font-mono focus:border-[#4ecdc4] outline-none w-[200px]"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={12}
              placeholder="PLAYER"
          />
      </div>
      <div className="bg-[#16213e] p-4 rounded border border-gray-600">
          <p className="text-gray-400 text-sm mb-1">SHARE THIS ROOM ID:</p>
          <p className="text-2xl font-mono text-white tracking-widest select-all">{roomId}</p>
      </div>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mt-2"></div>
      <button onClick={onCancel} className="text-gray-400 hover:text-white mt-4 underline">Cancel</button>
  </div>
);

export const JoinMenu: React.FC<{ joinId: string, setJoinId: (s: string) => void, nickname: string, setNickname: (s: string) => void, onJoin: () => void, onBack: () => void }> = ({ joinId, setJoinId, nickname, setNickname, onJoin, onBack }) => (
  <div className="flex flex-col items-center justify-center h-[280px] w-full gap-4">
      <h2 className="text-2xl text-[#e94560] font-bold mb-2">JOIN GAME</h2>
      <div className="flex flex-col gap-1 w-[200px]">
          <label className="text-[#e94560] text-[10px] font-bold uppercase tracking-wider text-center">YOUR NICKNAME</label>
          <input
              type="text"
              className="bg-[#16213e] border border-gray-600 p-2 rounded text-white text-center font-mono focus:border-[#e94560] outline-none w-full"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
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
          <button onClick={onBack} className="text-gray-400 hover:text-white">Back</button>
          <button onClick={onJoin} className="bg-[#4ecdc4] text-[#1a1a2e] px-6 py-2 rounded font-bold hover:bg-[#3dbdb4]">
              CONNECT
          </button>
      </div>
  </div>
);

export const LeaderboardMenu: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="flex flex-col items-center w-full h-full p-8 pt-2">
      <div className="mb-4 drop-shadow-[0_0_8px_rgba(254,202,87,0.8)]">
            <PixelText text="LEADERBOARD" scale={4} />
      </div>
      
      <div className="w-full max-w-[600px] flex-1 overflow-y-auto bg-[#16213e] border-2 border-[#4ecdc4] rounded-lg shadow-[0_0_15px_rgba(78,205,196,0.2)]">
          <table className="w-full text-left border-collapse table-auto">
              <thead className="bg-[#0f172a] text-[#4ecdc4] sticky top-0 z-10 shadow-md">
                  <tr>
                      <th className="p-3 text-xs font-bold tracking-wider border-b-2 border-[#4ecdc4]/30">RANK</th>
                      <th className="p-3 text-xs font-bold tracking-wider border-b-2 border-[#4ecdc4]/30">PLAYER</th>
                      <th className="p-3 text-xs font-bold tracking-wider border-b-2 border-[#4ecdc4]/30 text-center">WINS</th>
                      <th className="p-3 text-xs font-bold tracking-wider border-b-2 border-[#4ecdc4]/30 text-center">LOSSES</th>
                      <th className="p-3 text-xs font-bold tracking-wider border-b-2 border-[#4ecdc4]/30 text-right">WIN %</th>
                  </tr>
              </thead>
              <tbody className="text-gray-300 text-xs font-mono">
                  {MOCK_LEADERBOARD.map((entry, index) => {
                      const total = entry.wins + entry.losses;
                      const winRate = total > 0 ? ((entry.wins / total) * 100).toFixed(0) : "0";
                      return (
                          <tr key={index} className="even:bg-[#1a233a] hover:bg-[#252f4a] transition-colors border-b border-gray-800/50 last:border-0">
                              <td className="p-2 pl-4 font-bold text-white/70">
                                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                              </td>
                              <td className="p-2 font-bold text-[#feca57] tracking-wide">{entry.nickname}</td>
                              <td className="p-2 text-center text-green-400">{entry.wins}</td>
                              <td className="p-2 text-center text-red-400">{entry.losses}</td>
                              <td className="p-2 pr-4 text-right text-white">{winRate}%</td>
                          </tr>
                      );
                  })}
              </tbody>
          </table>
      </div>
      <button onClick={onBack} className="text-gray-500 hover:text-white mt-4 text-xs font-bold tracking-widest hover:underline uppercase">
          MAIN MENU
      </button>
  </div>
);