
import { ImageSource, Sound } from "excalibur";
import { AnimationState } from "./types";
import { SPRITE_SHEET_B64 } from "./game/sprites/spritesheet";
import { GLOVES_SHEET_B64 } from "./game/sprites/glovesspritesheet";
import { STARS_SHEET_B64 } from "./game/sprites/starspritesheet";
import { STANLEY_SHEET_B64 } from "./game/sprites/stanleycupspritesheet";
import { GOALNETS_SHEET_B64 } from "./game/sprites/netsspritesheet";
import { SOUND_PUNCHHI_B64 } from "./game/sfx/punchhisound";
import { SOUND_PUNCHLOW_B64 } from "./game/sfx/punchlowsound";
import { Framer_SHEET_B64 } from "./game/sprites/framersheet";
import { Rink_SHEET_B64 } from "./game/sprites/rinksheet";

export const getResources = () => ({
    SpriteSheet: new ImageSource(SPRITE_SHEET_B64),
    GlovesSheet: new ImageSource(GLOVES_SHEET_B64),
    StarsSheet: new ImageSource(STARS_SHEET_B64),
    StanleySheet: new ImageSource(STANLEY_SHEET_B64),
    GoalNetsSheet: new ImageSource(GOALNETS_SHEET_B64),
    PunchHiSound: new Sound(SOUND_PUNCHHI_B64),
    PunchLowSound: new Sound(SOUND_PUNCHLOW_B64),
    FramerSheet: new ImageSource(Framer_SHEET_B64),
    RinkSheet: new ImageSource(Rink_SHEET_B64)
});

// --- Config ---
export const SCALE = 3;
export const SPRITE_WIDTH = 70;
export const SPRITE_HEIGHT = 76;
export const GLOVES_WIDTH = 57;
export const GLOVES_HEIGHT = 32;
export const STAR_WIDTH = 36;
export const STAR_HEIGHT = 36;
export const STANLEY_WIDTH = 32;
export const STANLEY_HEIGHT = 64;
export const NET_WIDTH = 49;
export const NET_HEIGHT = 31;
export const RINK_WIDTH = 267;
export const RINK_HEIGHT = 88;
export const FRAMER_TILE_SIZE = 8;

export const HIT_RANGE = 50;
export const HITBOX_WIDTH = 40;
export const HITBOX_HEIGHT = 80;
export const MOVE_SPEED = 0.8;
export const FRICTION = 0.9;
export const KNOCKBACK_FORCE = 8;

export const FRAMES = {
    THROW_GLOVES: [0, 1, 2, 3],
    READY: 3,
    GRAB_REACH: 4,
    HIGH_WINDUP: 5,
    HIGH_CONNECT: 6,
    LOW_CONNECT: 7,
    HIT_LOW: 13,
    HIT_HIGH: 14,
    FALL_1: 15,
    FALL_2: 16,
    WIN: [0, 1, 2, 3, 4, 5, 6, 7]
};

// Animation definitions with durations (in ms, approx 16.6ms per tick)
const TICK = 16.6;

interface AnimDef {
    frames: number[];
    durations: number[];
    loop: boolean;
    next?: AnimationState;
    hitFrame?: number;
    hitType?: 'high' | 'low' | 'grab';
    dropFrame?: number;
    isStanley?: boolean;
}

export const ANIMATIONS: Record<AnimationState, AnimDef> = {
    'idle': { frames: [FRAMES.READY], durations: [9999], loop: true },
    'ready': { frames: [FRAMES.READY], durations: [9999], loop: true },
    'throw_gloves': { 
        frames: [FRAMES.THROW_GLOVES[0], ...FRAMES.THROW_GLOVES], 
        durations: [60 * TICK, 16 * TICK, 16 * TICK, 8 * TICK, 6 * TICK], 
        loop: false,
        next: 'ready',
        dropFrame: 3 // Drop on 4th frame (index 3) which is start of sprite 2, before animation ends
    },
    'high_punch': { 
        frames: [FRAMES.HIGH_WINDUP, FRAMES.HIGH_CONNECT, FRAMES.READY], 
        durations: [5 * TICK, 12 * TICK, 8 * TICK],
        loop: false,
        next: 'ready',
        hitFrame: 1,
        hitType: 'high'
    },
    'low_punch': { 
        frames: [FRAMES.HIGH_WINDUP, FRAMES.LOW_CONNECT, FRAMES.READY], 
        durations: [5 * TICK, 12 * TICK, 8 * TICK],
        loop: false,
        next: 'ready',
        hitFrame: 1,
        hitType: 'low'
    },
    'grab': { 
        frames: [FRAMES.GRAB_REACH, FRAMES.READY], 
        durations: [20 * TICK, 6 * TICK],
        loop: false,
        next: 'ready',
        hitFrame: 0,
        hitType: 'grab'
    },
    'hit_high': { 
        frames: [FRAMES.HIT_HIGH, FRAMES.READY], 
        durations: [16 * TICK, 8 * TICK],
        loop: false,
        next: 'ready'
    },
    'hit_low': { 
        frames: [FRAMES.HIT_LOW, FRAMES.READY], 
        durations: [16 * TICK, 8 * TICK],
        loop: false,
        next: 'ready'
    },
    'held': { 
        frames: [FRAMES.GRAB_REACH, FRAMES.READY], 
        durations: [30 * TICK, 4 * TICK],
        loop: false,
        next: 'ready'
    },
    'falling': { 
        frames: [FRAMES.FALL_1, FRAMES.FALL_2], 
        durations: [12 * TICK, 20 * TICK], // Reduced 2nd frame from 9999 to ~330ms
        loop: false,
        next: 'down'
    },
    'down': { 
        frames: [FRAMES.FALL_2], 
        durations: [9999],
        loop: true
    },
    'win': {
        frames: FRAMES.WIN,
        durations: [300, 300, 300, 300, 300, 300, 300, 300],
        loop: true,
        isStanley: true
    }
};