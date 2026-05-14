import React from 'react';
import { connect } from 'react-redux';
import { createStructuredSelector } from 'reselect';

import { Base } from 'containers/Base/Container';
import { BotController } from 'containers/BotController/Container';
import { Home } from 'containers/Home/Container';
import { OnlineStatus } from 'containers/OnlineStatus/Container';
import { Player } from 'containers/Player/Container';
import { Walkway } from 'containers/Walkway/Container';
import { getStyleObject } from 'containers/utils';
import { BOARD_SIZE } from 'globalConstants';
import { onlineSession } from 'online/session';
import { OnlineGameMode } from 'online/types';
import { ContextMenu } from 'services/contextMenu/Container';

import { getInitialGameData, setPlayers } from './state/actions';
import { BaseID, BoardEntities } from './state/interfaces';
import {
  basesSelector,
  currentTurnSelector,
  relationshipsSelector,
  walkwaysSelector,
} from './state/selectors';

import styles from './Container.module.css';

interface IDispatchProps {
  getInitialGameData: typeof getInitialGameData;
  setPlayers: typeof setPlayers;
}

interface IStateProps {
  bases: ReturnType<typeof basesSelector>;
  relationships: ReturnType<typeof relationshipsSelector>;
  walkways: ReturnType<typeof walkwaysSelector>;
  currentTurn: ReturnType<typeof currentTurnSelector>;
}

interface IPublicProps {

}

interface IProps extends IPublicProps, IStateProps, IDispatchProps {}

interface IState {
  error: string;
  isBusy: boolean;
  playerName: string;
  roomID: string;
  showPlayerConfiguration: boolean;
}

const mapStateToProps = createStructuredSelector<any, IStateProps>({
  bases: basesSelector,
  currentTurn: currentTurnSelector,
  relationships: relationshipsSelector,
  walkways: walkwaysSelector,
});

const mapDispatchToProps = {
  setPlayers,
  getInitialGameData,
};

class LudoBare extends React.PureComponent<IProps, IState> {
  public state: IState = {
    error: '',
    isBusy: false,
    playerName: window.localStorage.getItem('ludo-online-player-name') || 'Player',
    roomID: this.getRoomIDFromURL(),
    showPlayerConfiguration: true,
  }

  public componentDidMount() {
    onlineSession.configureFromEnv();
    this.props.getInitialGameData();
  }

  public render() {
    const { currentTurn } = this.props;
    return (
      <div className={styles.Container}>
        <OnlineStatus />
        <BotController />
        <div className={styles.GameContainer}>
          <div className={styles.PlayerContainer}>
            <Player baseID={BaseID.BASE_1} placement='top' disabled={currentTurn !== BaseID.BASE_1}/>
            <Player baseID={BaseID.BASE_3} placement='bottom' disabled={currentTurn !== BaseID.BASE_3}/>
          </div>
          <div className={styles.Board} style={getStyleObject(BOARD_SIZE, BOARD_SIZE)}>
            {
              this.renderBoardEntities()
            }
          </div>
          <div className={styles.PlayerContainer}>
            <Player baseID={BaseID.BASE_2} placement='top' disabled={currentTurn !== BaseID.BASE_2}/>
            <Player baseID={BaseID.BASE_4} placement='bottom' disabled={currentTurn !== BaseID.BASE_4}/>
          </div>
        </div>
        {
          this.state.showPlayerConfiguration
          ? this.renderGameConfiguration()
          : null
        }
        {
          process.env.NODE_ENV === 'development'
          ? <ContextMenu />
          : null
        }
      </div>
    );
  }

  private renderGameConfiguration = () => {
    return (
      <div className={styles.GameConfiguration}>
        <div className={styles.ConfigSection}>
          <h2 className={styles.ConfigTitle}>Local / Single Player</h2>
          <div className={styles.ButtonRow}>
            <button className={styles.Button} onClick={() => this.startGame(2)}>2 Players</button>
            <button className={styles.Button} onClick={() => this.startGame(3)}>3 Players</button>
            <button className={styles.Button} onClick={() => this.startGame(4)}>4 Players</button>
            <button className={styles.Button} onClick={this.startSinglePlayer}>Single Player vs Bots</button>
          </div>
        </div>
        <div className={styles.ConfigSection}>
          <h2 className={styles.ConfigTitle}>Online With Friends</h2>
          <input
            className={styles.Input}
            value={this.state.playerName}
            placeholder='Your name'
            onChange={(event) => this.setPlayerName(event.target.value)}
          />
          <div className={styles.ButtonRow}>
            <button className={styles.Button} disabled={this.state.isBusy} onClick={() => this.createOnlineRoom('classic')}>Create Classic Room</button>
            <button className={styles.Button} disabled={this.state.isBusy} onClick={() => this.createOnlineRoom('teams')}>Create Teams 2v2 Room</button>
          </div>
          <div className={styles.JoinRow}>
            <input
              className={styles.Input}
              value={this.state.roomID}
              placeholder='Room code or invite link'
              onChange={(event) => this.setState({ roomID: event.target.value, error: '' })}
            />
            <button className={styles.Button} disabled={this.state.isBusy} onClick={this.joinOnlineRoom}>Join Room</button>
          </div>
          <p className={styles.HelpText}>Create a room, copy the invite link, send it to friends, then turn Voice On after everyone joins.</p>
          {!onlineSession.isConfigured() ? <p className={styles.ErrorText}>Firebase URL missing. Add REACT_APP_FIREBASE_DATABASE_URL in .env.local first.</p> : null}
          {this.state.error ? <p className={styles.ErrorText}>{this.state.error}</p> : null}
        </div>
      </div>
    );
  }

  private renderBoardEntities = () => {
    const {
      bases,
      relationships,
      walkways,
    } = this.props;

    return relationships.map((relationship, index) => {
      const base = bases[relationship.ID];
      const walkway = walkways[relationship.ID];
      switch (relationship.type) {
        case BoardEntities.BASE:
          return <Base baseID={base.ID} key={index} enabled={base.enabled} hasWon={base.hasWon}/>;
        case BoardEntities.HOME:
          return <Home baseIDs={relationship.baseIDs} key={index}/>;
        case BoardEntities.WALKWAY:
          return <Walkway walkway={walkway!} key={index}/>;
        default:
          return null;
      }
    });
  }

  private startGame = (playerCount: number) => {
    onlineSession.disconnect();
    onlineSession.disableSinglePlayer();
    this.props.setPlayers(playerCount);
    this.setState({ showPlayerConfiguration: false });
  }

  private startSinglePlayer = () => {
    onlineSession.enableSinglePlayer();
    this.props.setPlayers(4);
    this.setState({ showPlayerConfiguration: false });
  }

  private createOnlineRoom = async (mode: OnlineGameMode) => {
    this.setState({ error: '', isBusy: true });
    try {
      await onlineSession.createRoom(this.state.playerName, mode);
      this.props.setPlayers(4);
      const shareURL = onlineSession.getShareURL();
      window.history.replaceState(null, document.title, shareURL);
      this.setState({ showPlayerConfiguration: false });
    } catch (error) {
      this.setState({ error: (error as Error).message });
    } finally {
      this.setState({ isBusy: false });
    }
  }

  private joinOnlineRoom = async () => {
    this.setState({ error: '', isBusy: true });
    try {
      const roomID = this.normalizeRoomID(this.state.roomID);
      const room = await onlineSession.joinRoom(roomID, this.state.playerName);
      if (!room.gameState) {
        this.props.setPlayers(4);
      }
      const shareURL = onlineSession.getShareURL();
      window.history.replaceState(null, document.title, shareURL);
      this.setState({ showPlayerConfiguration: false, roomID });
    } catch (error) {
      this.setState({ error: (error as Error).message });
    } finally {
      this.setState({ isBusy: false });
    }
  }

  private setPlayerName(playerName: string) {
    window.localStorage.setItem('ludo-online-player-name', playerName);
    this.setState({ playerName, error: '' });
  }

  private normalizeRoomID(rawValue: string) {
    const trimmed = rawValue.trim();
    try {
      const url = new URL(trimmed);
      return (url.searchParams.get('room') || trimmed).toUpperCase();
    } catch (error) {
      return trimmed.toUpperCase();
    }
  }

  private getRoomIDFromURL() {
    return (new URLSearchParams(window.location.search).get('room') || '').toUpperCase();
  }
}

export const Ludo = connect(mapStateToProps, mapDispatchToProps)(LudoBare) as unknown as React.ComponentClass<IPublicProps>;
