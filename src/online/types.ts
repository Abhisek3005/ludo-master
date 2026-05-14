import { IState as IDiceState } from 'containers/Dice/state/interfaces';
import { BaseID, IState as ILudoState } from 'containers/Ludo/state/interfaces';

export type OnlineGameMode = 'classic' | 'teams';

export interface IOnlinePlayer {
  id: string;
  name: string;
  baseID: BaseID;
  team: 'A' | 'B' | null;
  joinedAt: number;
  online: boolean;
}

export interface IOnlineGameState {
  ludo: ILudoState;
  dice: IDiceState;
  updatedBy: string;
  updatedAt: number;
}

export interface IVoiceCandidateMap {
  [candidateID: string]: RTCIceCandidateInit;
}

export interface IVoicePairSignal {
  offer?: RTCSessionDescriptionInit;
  offerFrom?: string;
  answer?: RTCSessionDescriptionInit;
  answerFrom?: string;
  candidates?: {
    [playerID: string]: IVoiceCandidateMap;
  };
}

export interface IOnlineRoom {
  id: string;
  hostID: string;
  mode: OnlineGameMode;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
  players: { [playerID: string]: IOnlinePlayer };
  gameState?: IOnlineGameState;
  voice?: { [pairKey: string]: IVoicePairSignal };
}
