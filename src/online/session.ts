import { IState as IDiceState } from 'containers/Dice/state/interfaces';
import { BaseID, IState as ILudoState } from 'containers/Ludo/state/interfaces';

import { FirebaseRestClient } from './firebaseRest';
import { IOnlinePlayer, IOnlineRoom, OnlineGameMode } from './types';

export const TEAM_BY_BASE: { [baseID: string]: 'A' | 'B' } = {
  [BaseID.BASE_1]: 'A',
  [BaseID.BASE_3]: 'A',
  [BaseID.BASE_2]: 'B',
  [BaseID.BASE_4]: 'B',
};

const BASE_ASSIGNMENT_ORDER = [BaseID.BASE_3, BaseID.BASE_2, BaseID.BASE_1, BaseID.BASE_4];

type RoomListener = (room: IOnlineRoom | null) => void;

class OnlineSession {
  public isApplyingRemoteState = false;

  private client: FirebaseRestClient | null = null;
  private playerID: string = '';
  private playerName: string = '';
  private roomID: string | null = null;
  private baseID: BaseID | null = null;
  private mode: OnlineGameMode | null = null;
  private room: IOnlineRoom | null = null;
  private listeners: RoomListener[] = [];
  private unsubscribe: (() => void) | null = null;
  private singlePlayer = false;

  public constructor() {
    this.playerID = this.getOrCreatePlayerID();
  }

  public configureFromEnv() {
    const databaseURL = process.env.REACT_APP_FIREBASE_DATABASE_URL;
    if (databaseURL && !this.client) {
      this.client = new FirebaseRestClient(databaseURL);
    }
  }

  public isConfigured() {
    this.configureFromEnv();
    return Boolean(this.client);
  }

  public getPlayerID() {
    return this.playerID;
  }

  public getPlayerName() {
    return this.playerName;
  }

  public getRoomID() {
    return this.roomID;
  }

  public getBaseID() {
    return this.baseID;
  }

  public getMode() {
    return this.mode;
  }

  public getRoom() {
    return this.room;
  }

  public getShareURL() {
    if (!this.roomID) {
      return '';
    }
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomID);
    return url.toString();
  }

  public enableSinglePlayer() {
    this.disconnect();
    this.singlePlayer = true;
    this.baseID = BaseID.BASE_3;
  }

  public disableSinglePlayer() {
    this.singlePlayer = false;
  }

  public isSinglePlayer() {
    return this.singlePlayer;
  }

  public isOnline() {
    return Boolean(this.roomID && this.baseID);
  }

  public isTeamsMode() {
    return this.mode === 'teams';
  }

  public sameTeam(a: BaseID, b: BaseID) {
    return this.isTeamsMode() && TEAM_BY_BASE[a] === TEAM_BY_BASE[b];
  }

  public canControlBase(baseID: BaseID) {
    if (this.singlePlayer) {
      return baseID === BaseID.BASE_3;
    }
    if (!this.isOnline()) {
      return true;
    }
    return this.baseID === baseID;
  }

  public async createRoom(playerName: string, mode: OnlineGameMode) {
    this.configureFromEnv();
    if (!this.client) {
      throw new Error('Firebase is not configured. Add REACT_APP_FIREBASE_DATABASE_URL in .env.local.');
    }
    this.disconnect();
    this.singlePlayer = false;
    this.playerName = playerName || 'Player';
    const roomID = this.generateRoomID();
    const baseID = BaseID.BASE_3;
    const player = this.createPlayer(baseID, mode);
    const room: IOnlineRoom = {
      createdAt: Date.now(),
      hostID: this.playerID,
      id: roomID,
      mode,
      players: { [this.playerID]: player },
      status: 'waiting',
    };
    await this.client.put<IOnlineRoom>(`rooms/${roomID}`, room);
    this.setLocalRoom(roomID, baseID, mode);
    this.listenToRoom(roomID);
    return room;
  }

  public async joinRoom(roomID: string, playerName: string) {
    this.configureFromEnv();
    if (!this.client) {
      throw new Error('Firebase is not configured. Add REACT_APP_FIREBASE_DATABASE_URL in .env.local.');
    }
    this.disconnect();
    this.singlePlayer = false;
    this.playerName = playerName || 'Player';
    const room = await this.client.get<IOnlineRoom>(`rooms/${roomID}`);
    if (!room) {
      throw new Error('Room not found. Check the link or ask your friend to create a new room.');
    }
    const existingPlayer = room.players ? room.players[this.playerID] : undefined;
    const baseID = existingPlayer ? existingPlayer.baseID : this.findFreeBase(room);
    if (!baseID) {
      throw new Error('Room is full. Maximum 4 players can join.');
    }
    const mode = room.mode;
    await this.client.patch<IOnlinePlayer>(`rooms/${roomID}/players/${this.playerID}`, this.createPlayer(baseID, mode));
    await this.client.patch<IOnlineRoom>(`rooms/${roomID}`, { status: 'playing' });
    this.setLocalRoom(roomID, baseID, mode);
    this.listenToRoom(roomID);
    return room;
  }

  public async publishGameState(ludo: ILudoState, dice: IDiceState) {
    if (!this.client || !this.roomID || !this.isOnline() || this.isApplyingRemoteState) {
      return;
    }
    await this.client.patch<IOnlineRoom>(`rooms/${this.roomID}/gameState`, {
      dice,
      ludo,
      updatedAt: Date.now(),
      updatedBy: this.playerID,
    });
  }

  public async writeVoiceSignal(path: string, value: object | string | number | boolean | null) {
    if (!this.client || !this.roomID) {
      return;
    }
    await this.client.put(`rooms/${this.roomID}/voice/${path}`, value);
  }

  public subscribe(listener: RoomListener) {
    this.listeners.push(listener);
    listener(this.room);
    return () => {
      this.listeners = this.listeners.filter((candidate) => candidate !== listener);
    };
  }

  public disconnect() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.roomID = null;
    this.baseID = null;
    this.mode = null;
    this.room = null;
    this.notify();
  }

  private setLocalRoom(roomID: string, baseID: BaseID, mode: OnlineGameMode) {
    this.roomID = roomID;
    this.baseID = baseID;
    this.mode = mode;
  }

  private listenToRoom(roomID: string) {
    if (!this.client) {
      return;
    }
    this.unsubscribe = this.client.listen<IOnlineRoom>(
      `rooms/${roomID}`,
      (room) => {
        this.room = room;
        this.notify();
      },
      () => undefined,
    );
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.room));
  }

  private createPlayer(baseID: BaseID, mode: OnlineGameMode): IOnlinePlayer {
    return {
      baseID,
      id: this.playerID,
      joinedAt: Date.now(),
      name: this.playerName,
      online: true,
      team: mode === 'teams' ? TEAM_BY_BASE[baseID] : null,
    };
  }

  private findFreeBase(room: IOnlineRoom) {
    const occupied = new Set(Object.values(room.players || {}).map((player) => player.baseID));
    return BASE_ASSIGNMENT_ORDER.find((baseID) => !occupied.has(baseID)) || null;
  }

  private generateRoomID() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  private getOrCreatePlayerID() {
    const key = 'ludo-online-player-id';
    const existingID = window.localStorage.getItem(key);
    if (existingID) {
      return existingID;
    }
    const playerID = `p_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    window.localStorage.setItem(key, playerID);
    return playerID;
  }
}

export const onlineSession = new OnlineSession();
