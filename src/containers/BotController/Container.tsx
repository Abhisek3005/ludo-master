import React from 'react';
import { connect } from 'react-redux';
import { createStructuredSelector } from 'reselect';

import { rollDie } from 'containers/Dice/state/actions';
import { Rolls } from 'containers/Dice/state/interfaces';
import { currentDieRollSelector, isDieRollAllowedSelector, isDieRollValidSelector } from 'containers/Dice/state/selectors';
import { moveCoin, spawnCoin } from 'containers/Ludo/state/actions';
import { BaseID, ICoin } from 'containers/Ludo/state/interfaces';
import { basesSelector, coinsSelector, currentTurnSelector } from 'containers/Ludo/state/selectors';
import { WINNING_MOVES } from 'globalConstants';
import { onlineSession } from 'online/session';

interface IStateProps {
  bases: ReturnType<typeof basesSelector>;
  coins: ReturnType<typeof coinsSelector>;
  currentDieRoll: ReturnType<typeof currentDieRollSelector>;
  currentTurn: ReturnType<typeof currentTurnSelector>;
  isDieRollAllowed: ReturnType<typeof isDieRollAllowedSelector>;
  isDieRollValid: ReturnType<typeof isDieRollValidSelector>;
}

interface IDispatchProps {
  moveCoin: typeof moveCoin;
  rollDie: typeof rollDie;
  spawnCoin: typeof spawnCoin;
}

interface IProps extends IStateProps, IDispatchProps {}

const mapStateToProps = createStructuredSelector<any, IStateProps>({
  bases: basesSelector,
  coins: coinsSelector,
  currentDieRoll: currentDieRollSelector,
  currentTurn: currentTurnSelector,
  isDieRollAllowed: isDieRollAllowedSelector,
  isDieRollValid: isDieRollValidSelector,
});

const mapDispatchToProps = {
  moveCoin,
  rollDie,
  spawnCoin,
};

class BotControllerBare extends React.PureComponent<IProps> {
  private timeoutID: number | null = null;

  public componentDidMount() {
    this.scheduleBotAction();
  }

  public componentDidUpdate() {
    this.scheduleBotAction();
  }

  public componentWillUnmount() {
    if (this.timeoutID !== null) {
      window.clearTimeout(this.timeoutID);
    }
  }

  public render() {
    return null;
  }

  private scheduleBotAction() {
    if (!onlineSession.isSinglePlayer() || this.props.currentTurn === BaseID.BASE_3 || this.timeoutID !== null) {
      return;
    }
    this.timeoutID = window.setTimeout(() => {
      this.timeoutID = null;
      this.performBotAction();
    }, 500);
  }

  private performBotAction() {
    if (!onlineSession.isSinglePlayer() || this.props.currentTurn === BaseID.BASE_3) {
      return;
    }
    const base = this.props.bases[this.props.currentTurn];
    if (!base || !base.enabled || base.hasWon) {
      return;
    }
    if (this.props.isDieRollAllowed) {
      this.props.rollDie();
      return;
    }
    if (!this.props.isDieRollValid) {
      return;
    }
    const spawnableCoinID = base.coinIDs.find((coinID) => !this.props.coins[coinID].isSpawned && !this.props.coins[coinID].isRetired);
    if (this.props.currentDieRoll === Rolls.SIX && spawnableCoinID) {
      this.props.spawnCoin(base.ID, spawnableCoinID);
      return;
    }
    const movableCoin = this.findMovableCoin(base.coinIDs);
    if (movableCoin) {
      this.props.moveCoin(movableCoin.coinID, movableCoin.position, movableCoin.cellID);
    }
  }

  private findMovableCoin(coinIDs: string[]) {
    const movableCoins = coinIDs
      .map((coinID) => this.props.coins[coinID])
      .filter((coin): coin is ICoin => Boolean(coin) && coin.isSpawned && !coin.isRetired && coin.steps + this.props.currentDieRoll <= WINNING_MOVES);
    return movableCoins.sort((a, b) => b.steps - a.steps)[0];
  }
}

export const BotController = connect(mapStateToProps, mapDispatchToProps)(BotControllerBare);
