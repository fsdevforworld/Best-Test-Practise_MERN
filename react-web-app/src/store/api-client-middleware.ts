import { AnyAction, Middleware } from 'redux';
import { Action } from 'typesafe-actions';
import APIClient from '../lib/api-client';

export type APIClientAction<T, U = Record<string, unknown>> = {
  promise: (client: APIClient) => Promise<T>;
  actions: [() => Action, (result: T, extra?: U) => Action, (error: APIError) => Action];
  extra?: U;
};

// eslint-disable-next-line
export type APIError = any;

export default function clientMiddleware(client: APIClient): Middleware {
  return () => {
    return (next) => {
      return <T, U>(action: AnyAction | APIClientAction<T, U>) => {
        const { promise, actions, extra } = action as APIClientAction<T, U>;
        if (!promise) {
          return next(action as AnyAction);
        }

        const [load, success, failure] = actions;
        next(load());

        const actionPromise = promise(client);
        actionPromise
          .then((result) => {
            return next(success(result, extra));
          })
          .catch((error) => {
            return next(failure(error));
          });

        return actionPromise;
      };
    };
  };
}
