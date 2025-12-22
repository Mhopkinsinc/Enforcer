import { GameState } from './types';

export const ALPHABET = " !\"#©%&'()✓+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~■";
export const SETTINGS_STORAGE_KEY = 'hockey_fight_settings';
export const PLAYER_ID_KEY = 'hockey_fight_player_id';

export const MOCK_LEADERBOARD = [
  { nickname: "WAYNE_G", wins: 894, losses: 12 },
  { nickname: "MARIO_L", wins: 690, losses: 85 },
  { nickname: "GORDIE_H", wins: 550, losses: 145 },
  { nickname: "BOBBY_O", wins: 412, losses: 180 },
  { nickname: "JAROMIR_J", wins: 389, losses: 210 },
  { nickname: "SID_KID", wins: 256, losses: 98 },
  { nickname: "OVI_8", wins: 198, losses: 112 },
  { nickname: "GOALIE_33", wins: 145, losses: 85 },
  { nickname: "ENFORCER_X", wins: 45, losses: 32 },
  { nickname: "ZAMBONI_DRVR", wins: 12, losses: 45 },
];

export const DEFAULT_GAME_STATE: GameState = {
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