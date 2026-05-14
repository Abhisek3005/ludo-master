import classnames from 'classnames';
import React from 'react';

import { connect } from 'react-redux';
import { createStructuredSelector } from 'reselect';

import { getStyleObject } from 'containers/utils';
import { DICE_SIZE } from 'globalConstants';
import { BaseID } from 'containers/Ludo/state/interfaces';
import { onlineSession } from 'online/session';
import { BaseColors } from 'state/interfaces';

import { rollDie } from './state/actions';
import { CONFIGURATIONS } from './state/constants';
import { currentDieRollSelector, isDieRollAllowedSelector } from './state/selectors';

import styles from './Container.module.css';

interface IStateProps {
  currentDieRoll: ReturnType<typeof currentDieRollSelector>;
  isDieRollAllowed: ReturnType<typeof isDieRollAllowedSelector>;
}

interface IDispatchProps {
  rollDie: typeof rollDie;
}

interface IPublicProps {
  baseColor: BaseColors;
  baseID: BaseID;
}

interface IProps extends IStateProps, IDispatchProps, IPublicProps {}

const mapStateToProps = createStructuredSelector<any, IStateProps>({
  currentDieRoll: currentDieRollSelector,
  isDieRollAllowed: isDieRollAllowedSelector,
});

const mapDispatchToProps = {
  rollDie,
};

class DiceBare extends React.PureComponent<IProps> {
  render() {
    const { baseColor, baseID } = this.props;
    const canControl = onlineSession.canControlBase(baseID);
    const dieClassNames = this.props.isDieRollAllowed && canControl ? styles.Die : [styles.Die, styles.Disabled];
    return (
      <div className={styles.Container}>
        <div className={classnames(dieClassNames)} style={getStyleObject(DICE_SIZE, DICE_SIZE, baseColor)} onClick={() => this.rollDie()}>
          {
            this.renderDots()
          }
        </div>
      </div>
    );
  }

  private rollDie = () => {
    if (this.props.isDieRollAllowed && onlineSession.canControlBase(this.props.baseID)) {
      this.props.rollDie();
    }
  }

  private renderDots = () => {
    const elements: any[] = [];
    const configurationForCurrentRoll = CONFIGURATIONS[this.props.currentDieRoll];

    for (let i = 0; i < configurationForCurrentRoll.length; i++) {
      const isVisible = Boolean(configurationForCurrentRoll[i]);
      const classNames = isVisible ? styles.Dot : [styles.Dot, styles.Invisible];
      elements.push(
        <div className={classnames(classNames)} key={i}/>,
      );
    }

    return elements;
  }
}

export const Dice = connect(mapStateToProps, mapDispatchToProps)(DiceBare) as unknown as React.ComponentClass<IPublicProps>;
