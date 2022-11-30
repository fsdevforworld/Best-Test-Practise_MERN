import { ActionType } from 'typesafe-actions';
import { DeepReadonly } from 'utility-types';

import { UserResponse } from '@dave-inc/wire-typings';
import * as UserActions from '../actions/user';

export type UserAction = ActionType<typeof UserActions>;

type TempUser = {
  email: string;
  password: string;
  phoneNumber: string;
};

export type UserState = DeepReadonly<{
  user?: UserResponse;
  loading: boolean;
  tempUser: TempUser;
}>;

const initialState = {
  loading: false,
  tempUser: {
    email: '',
    password: '',
    phoneNumber: '',
  },
};

export default function reduce(state: UserState = initialState, action: UserAction): UserState {
  switch (action.type) {
    case 'VERIFY_CODE_LOAD':
      return {
        ...state,
        loading: true,
      };
    case 'VERIFY_CODE_SUCCESS':
      return {
        ...state,
        user: action.payload,
        loading: false,
      };
    case 'VERIFY_CODE_FAIL':
      return {
        ...state,
        loading: false,
      };
    case 'GET_USER_LOAD':
      return {
        ...state,
        loading: true,
      };

    case 'GET_USER_SUCCESS':
      return {
        ...state,
        user: action.payload,
        loading: false,
      };
    case 'GET_USER_FAIL':
      return {
        ...state,
        loading: false,
      };
    case 'SET_TEMP_USER':
      return {
        ...state,
        tempUser: {
          ...action.payload,
        },
      };
    case 'CLEAR_TEMP_USER':
      return {
        ...state,
        tempUser: {
          email: '',
          password: '',
          phoneNumber: '',
        },
      };
    default:
      return state;
  }
}
