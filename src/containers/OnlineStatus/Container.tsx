import React from 'react';
import { connect } from 'react-redux';
import { createStructuredSelector } from 'reselect';

import { hydrateOnlineDieState } from 'containers/Dice/state/actions';
import { diceStateSelector } from 'containers/Dice/state/selectors';
import { hydrateOnlineState } from 'containers/Ludo/state/actions';
import { BaseID } from 'containers/Ludo/state/interfaces';
import { ludoStateSelector } from 'containers/Ludo/state/selectors';
import { onlineSession } from 'online/session';
import { IOnlinePlayer, IOnlineRoom } from 'online/types';

import { VoiceChat } from './VoiceChat';
import styles from './Container.module.css';

interface IStateProps {
  dice: ReturnType<typeof diceStateSelector>;
  ludo: ReturnType<typeof ludoStateSelector>;
}

interface IDispatchProps {
  hydrateOnlineDieState: typeof hydrateOnlineDieState;
  hydrateOnlineState: typeof hydrateOnlineState;
}

interface IProps extends IStateProps, IDispatchProps {}

interface IState {
  room: IOnlineRoom | null;
  copied: boolean;
}

const mapStateToProps = createStructuredSelector<any, IStateProps>({
  dice: diceStateSelector,
  ludo: ludoStateSelector,
});

const mapDispatchToProps = {
  hydrateOnlineDieState,
  hydrateOnlineState,
};

class OnlineStatusBare extends React.PureComponent<IProps, IState> {
  public state: IState = {
    copied: false,
    room: onlineSession.getRoom(),
  };

  private unsubscribe: (() => void) | null = null;
  private lastAppliedRemoteUpdate = 0;
  private lastPublishedState = '';

  public componentDidMount() {
    this.unsubscribe = onlineSession.subscribe(this.handleRoomChange);
  }

  public componentDidUpdate(prevProps: IProps) {
    const stateChanged = prevProps.ludo !== this.props.ludo || prevProps.dice !== this.props.dice;
    if (stateChanged) {
      this.publishStateIfNeeded();
    }
  }

  public componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  public render() {
    const { room } = this.state;
    if (!room || !onlineSession.isOnline()) {
      return null;
    }
    const localBase = onlineSession.getBaseID();
    const players = Object.values(room.players || {});
    return (
      <div className={styles.Container}>
        <div className={styles.Row}>
          <div className={styles.Meta}>
            <strong>Online room:</strong> {room.id} · <strong>Mode:</strong> {room.mode === 'teams' ? 'Teams 2v2' : 'Classic'} · <strong>You:</strong> {this.baseLabel(localBase)}
          </div>
          <button className={styles.SmallButton} onClick={this.copyLink}>{this.state.copied ? 'Copied' : 'Copy invite link'}</button>
        </div>
        <div className={styles.Row}>
          <input className={styles.ShareInput} value={onlineSession.getShareURL()} readOnly={true}/>
        </div>
        <div className={styles.Players}>
          {players.map((player) => <span className={styles.PlayerPill} key={player.id}>{this.playerLabel(player)}</span>)}
        </div>
        <VoiceChat room={room}/>
      </div>
    );
  }

  private handleRoomChange = (room: IOnlineRoom | null) => {
    this.setState({ room });
    if (!room || !room.gameState) {
      return;
    }
    const gameState = room.gameState;
    if (gameState.updatedBy === onlineSession.getPlayerID() || gameState.updatedAt <= this.lastAppliedRemoteUpdate) {
      return;
    }
    this.lastAppliedRemoteUpdate = gameState.updatedAt;
    onlineSession.isApplyingRemoteState = true;
    this.props.hydrateOnlineState(gameState.ludo);
    this.props.hydrateOnlineDieState(gameState.dice);
    window.setTimeout(() => {
      onlineSession.isApplyingRemoteState = false;
    }, 0);
  }

  private publishStateIfNeeded() {
    if (!onlineSession.isOnline() || onlineSession.isApplyingRemoteState || this.props.ludo.relationships.length === 0) {
      return;
    }
    const serialized = JSON.stringify({ dice: this.props.dice, ludo: this.props.ludo });
    if (serialized === this.lastPublishedState) {
      return;
    }
    this.lastPublishedState = serialized;
    onlineSession.publishGameState(this.props.ludo, this.props.dice).catch(() => undefined);
  }

  private copyLink = () => {
    const shareURL = onlineSession.getShareURL();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareURL).then(() => this.setState({ copied: true })).catch(() => this.fallbackCopy(shareURL));
    } else {
      this.fallbackCopy(shareURL);
    }
  }

  private fallbackCopy(shareURL: string) {
    window.prompt('Copy this invite link', shareURL);
    this.setState({ copied: true });
  }

  private playerLabel(player: IOnlinePlayer) {
    const teamLabel = player.team ? ` · Team ${player.team}` : '';
    return `${player.name}: ${this.baseLabel(player.baseID)}${teamLabel}`;
  }

  private baseLabel(baseID: BaseID | null) {
    switch (baseID) {
      case BaseID.BASE_1:
        return 'Red';
      case BaseID.BASE_2:
        return 'Green';
      case BaseID.BASE_3:
        return 'Blue';
      case BaseID.BASE_4:
        return 'Yellow';
      default:
        return 'Spectator';
    }
  }
}

export const OnlineStatus = connect(mapStateToProps, mapDispatchToProps)(OnlineStatusBare);
