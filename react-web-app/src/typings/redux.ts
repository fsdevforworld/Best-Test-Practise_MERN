import { StateType, ActionType } from 'typesafe-actions';
import { APIClientAction } from 'store/api-client-middleware';

export type Store = StateType<typeof import('../store/index').default>;
export type RootAction = ActionType<typeof import('../store/root-action').default>;
export type RootState = StateType<ReturnType<typeof import('../store/root-reducer').default>>;

declare module 'typesafe-actions' {
  interface Types {
    RootAction: ActionType<typeof import('../store/root-action').default>;
  }
}

/**
 * Redux behaviour changed by middleware, so overloads here
 */
declare module 'redux' {
  /**
   * Overload for bindActionCreators redux function, returns expects responses
   * from thunk actions
   */
  function bindActionCreators<M extends ActionCreatorsMapObject>(
    actionCreators: M,
    dispatch: Dispatch,
  ): {
    /**
    welcome to conditional types!
    if one of the possible return types in an action return types is an APIClientAction, then
      our type will be the return type of whatever the action's promise value to be
    else since none of the possible return types is an APIClientAction
      our type will be whatever that action would normally return
     */
    // eslint-disable-next-line
    [N in keyof M]: ReturnType<M[N]> extends APIClientAction<any>
      ? (...args: Parameters<M[N]>) => ReturnType<ReturnType<M[N]>['promise']>
      : M[N];
  };
}
