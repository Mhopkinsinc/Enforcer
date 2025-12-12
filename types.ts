
export type AnimationState = 
    | 'idle'
    | 'throw_gloves'
    | 'ready'
    | 'high_punch'
    | 'low_punch'
    | 'grab'
    | 'hit_high'
    | 'hit_low'
    | 'held'
    | 'falling'
    | 'down'
    | 'win';

export interface GameState {
    p1Health: number;
    p2Health: number;
    p1State: string;
    p2State: string;
    gameOver: boolean;
    showGameOver: boolean;
    winner: 'PLAYER 1' | 'PLAYER 2' | null;
    isReplaying: boolean;
    replayProgress: number; // 0 to 1
    replaySpeed: number;
    // Network Info
    isMultiplayer: boolean;
    connectionStatus: 'disconnected' | 'connecting' | 'connected';
    roomId?: string;
    isHost?: boolean;
}

export interface PlayerSnapshot {
    x: number;
    y: number;
    state: AnimationState;
    frameIndex: number;
    facingRight: boolean;
    health: number;
    visible: boolean;
}

export interface EntitySnapshot {
    type: 'blood' | 'glove';
    x: number;
    y: number;
    scale: number;
    color?: string;
    zIndex: number;
    isPlayer1?: boolean;
}

export interface GameSnapshot {
    p1: PlayerSnapshot;
    p2: PlayerSnapshot;
    cameraPos: { x: number, y: number };
    cameraZoom: number;
    entities: EntitySnapshot[];
}

// --- Network Messages ---

export type MessageType = 'SYNC' | 'HIT' | 'RESTART';

export interface NetworkMessage {
    type: MessageType;
    payload: any;
}

export interface SyncPayload {
    x: number;
    y: number;
    vx: number;
    state: AnimationState;
    facingRight: boolean;
    health: number;
}

export interface HitPayload {
    damageType: 'high' | 'low';
    targetP1: boolean; // true if P1 was hit
}