
import Peer, { DataConnection } from 'peerjs';
import { NetworkMessage } from '../types';

export class NetworkManager {
    private peer: Peer | null = null;
    private conn: DataConnection | null = null;
    
    public onMessage: (msg: NetworkMessage) => void = () => {};
    public onConnection: () => void = () => {};
    public onDisconnect: () => void = () => {};

    constructor() {}

    public init(): Promise<string> {
        return new Promise((resolve, reject) => {
            // Generate a random ID for the peer
            this.peer = new Peer();

            this.peer.on('open', (id) => {
                console.log('My peer ID is: ' + id);
                resolve(id);
            });

            this.peer.on('error', (err) => {
                console.error(err);
                reject(err);
            });

            // Handle incoming connections (Host side)
            this.peer.on('connection', (conn) => {
                this.setupConnection(conn);
            });
        });
    }

    public connect(peerId: string) {
        if (!this.peer) return;
        const conn = this.peer.connect(peerId);
        this.setupConnection(conn);
    }

    private setupConnection(conn: DataConnection) {
        this.conn = conn;

        this.conn.on('open', () => {
            console.log("Connected to peer!");
            this.onConnection();
        });

        this.conn.on('data', (data) => {
            this.onMessage(data as NetworkMessage);
        });

        this.conn.on('close', () => {
            console.log("Connection closed");
            this.conn = null;
            this.onDisconnect();
        });

        this.conn.on('error', (err) => {
            console.error("Connection error:", err);
            this.conn = null;
            this.onDisconnect();
        });
    }

    public send(msg: NetworkMessage) {
        if (this.conn && this.conn.open) {
            this.conn.send(msg);
        }
    }

    public destroy() {
        if (this.conn) this.conn.close();
        if (this.peer) this.peer.destroy();
    }
}