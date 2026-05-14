import { WINNING_MOVES } from 'globalConstants';

import { Actions, ActionTypes } from './actions';
import { BaseID, IBase, ICell, IState } from './interfaces';


const sortObjectKeys = (a: string, b: string) => {
  const aNumber = Number(a);
  const bNumber = Number(b);
  if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber)) {
    return aNumber - bNumber;
  }
  return a.localeCompare(b);
};

const toArray = <T>(value: any): T[] => {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
    .sort(sortObjectKeys)
    .map((key) => value[key])
    .filter((item) => item !== undefined && item !== null);
  }
  return [];
};

const toObject = <T>(value: any): { [key: string]: T } => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
};

const normalizeHydratedGameData = (gameData: IState): IState => {
  const bases = toObject<IBase>(gameData && gameData.bases);
  const cells = toObject<{ [cellID: string]: ICell }>(gameData && gameData.cells);
  const links = toObject<any[]>(gameData && gameData.links);

  const normalizedBases: IState['bases'] = {};
  Object.keys(bases).forEach((baseID) => {
    const base = bases[baseID] as any;
    normalizedBases[baseID] = {
      ...base,
      coinIDs: toArray(base && base.coinIDs),
      enabled: Boolean(base && base.enabled),
      hasWon: Boolean(base && base.hasWon),
      spawnable: Boolean(base && base.spawnable),
    };
  });

  const normalizedCells: IState['cells'] = {};
  Object.keys(cells).forEach((position) => {
    normalizedCells[position] = {};
    const cellsForPosition = toObject<ICell>(cells[position]);
    Object.keys(cellsForPosition).forEach((cellID) => {
      const cell = cellsForPosition[cellID] as any;
      normalizedCells[position][cellID] = {
        ...cell,
        coinIDs: toArray(cell && cell.coinIDs),
      };
    });
  });

  const normalizedLinks: IState['links'] = {};
  Object.keys(links).forEach((cellID) => {
    normalizedLinks[cellID] = toArray(links[cellID]);
  });

  return {
    ...gameData,
    bases: normalizedBases,
    cells: normalizedCells,
    coins: toObject(gameData && gameData.coins) as IState['coins'],
    currentTurn: (gameData && gameData.currentTurn) || BaseID.BASE_3,
    links: normalizedLinks,
    relationships: toArray(gameData && gameData.relationships) as IState['relationships'],
    walkways: toObject(gameData && gameData.walkways) as IState['walkways'],
  };
};

const initialState: IState = {
  bases: {},
  cells: {},
  coins: {},
  currentTurn: BaseID.BASE_3,
  links: {},
  relationships: [],
  walkways: {},
};

export const reducer = (state: IState = initialState, action: Actions): IState => {
  switch (action.type) {
    case ActionTypes.HYDRATE_ONLINE_STATE: {
      return normalizeHydratedGameData(action.data!.gameData);
    }
    case ActionTypes.GET_INITIAL_GAME_DATA_SUCCESS: {
      const {
        bases,
        cells,
        coins,
        relationships,
        walkways,
        links,
      } = action.data!.gameData;
      return {
        ...state,
        bases,
        cells,
        coins,
        links,
        relationships,
        walkways,
      };
    }
    case ActionTypes.SPAWN_COIN_SUCCESS: {
      const { cellID, coinID, position } = action.data!;
      return {
        ...state,
        cells: {
          ...state.cells,
          [position]: {
            ...state.cells[position],
            [cellID]: {
              ...state.cells[position][cellID],
              coinIDs: [
                ...state.cells[position][cellID].coinIDs,
                coinID,
              ],
            },
          },
        },
        coins: {
          ...state.coins,
          [coinID]: {
            ...state.coins[coinID],
            cellID,
            isSpawned: true,
            position,
          },
        },
      };
    }
    case ActionTypes.LIFT_COIN: {
      const { cellID, coinID, walkwayPosition } = action.data!;
      const coinIDsInCell = [...state.cells[walkwayPosition][cellID].coinIDs];
      const index = coinIDsInCell.findIndex((coinIDInCell) => coinIDInCell === coinID);
      coinIDsInCell.splice(index, 1);
      return {
        ...state,
        cells: {
          ...state.cells,
          [walkwayPosition]: {
            ...state.cells[walkwayPosition],
            [cellID]: {
              ...state.cells[walkwayPosition][cellID],
              coinIDs: coinIDsInCell,
            },
          },
        },
      };
    }
    case ActionTypes.PLACE_COIN: {
      const { cellID, coinID, walkwayPosition } = action.data!;
      return {
        ...state,
        cells: {
          ...state.cells,
          [walkwayPosition]: {
            ...state.cells[walkwayPosition],
            [cellID]: {
              ...state.cells[walkwayPosition][cellID],
              coinIDs: [
                ...state.cells[walkwayPosition][cellID].coinIDs,
                coinID,
              ],
            },
          },
        },
        coins: {
          ...state.coins,
          [coinID]: {
            ...state.coins[coinID],
            cellID,
            position: walkwayPosition,
          },
        },
      };
    }
    case ActionTypes.PASS_TURN_TO: {
      const { baseID } = action.data!;
      return {
        ...state,
        currentTurn: baseID,
      };
    }
    case ActionTypes.MARK_CURRENT_BASE: {
      return {
        ...state,
        bases: {
          ...state.bases,
          [state.currentTurn]: {
            ...state.bases[state.currentTurn],
            spawnable: action.data!.spawnable,
          },
        },
      };
    }
    case ActionTypes.DISQUALIFY_COIN: {
      const { coinID, walkwayPosition, cellID } = action.data!;

      const coinIDsInCell = [...state.cells[walkwayPosition][cellID].coinIDs];
      const coinIndexToDelete = coinIDsInCell.findIndex((coinIDInCell) => coinIDInCell === coinID);
      coinIDsInCell.splice(coinIndexToDelete, 1);
      return {
        ...state,
        cells: {
          ...state.cells,
          [walkwayPosition]: {
            ...state.cells[walkwayPosition],
            [cellID]: {
              ...state.cells[walkwayPosition][cellID],
              coinIDs: coinIDsInCell,
            },
          },
        },
        coins: {
          ...state.coins,
          [coinID]: {
            ...state.coins[coinID],
            isSpawned: false,
            steps: 0,
          },
        },
      };
    }
    case ActionTypes.HOME_COIN: {
      const { coinID } = action.data!;
      return {
        ...state,
        coins: {
          ...state.coins,
          [coinID]: {
            ...state.coins[coinID],
            isRetired: true,
            steps: WINNING_MOVES,
          },
        },
      };
    }
    case ActionTypes.MOVE_COIN_SUCCESS: {
      const { currentDieRoll, coinID } = action.data!;
      return {
        ...state,
        coins: {
          ...state.coins,
          [coinID]: {
            ...state.coins[coinID],
            steps: state.coins[coinID].steps + currentDieRoll,
          },
        },
      };
    }
    case ActionTypes.ENABLE_BASE: {
      const { baseID } = action.data!;
      return {
        ...state,
        bases: {
          ...state.bases,
          [baseID]: {
            ...state.bases[baseID],
            enabled: true,
          },
        },
      };
    }
    case ActionTypes.MARK_WINNER: {
      const { baseID } = action.data!;
      return {
        ...state,
        bases: {
          ...state.bases,
          [baseID]: {
            ...state.bases[baseID],
            hasWon: true,
          },
        },
      };
    }
    default:
      return state;
  }
};
