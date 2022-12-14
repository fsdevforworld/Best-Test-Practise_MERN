import { combineReducers } from 'redux';

import userReducer from 'reducers/user';

const rootReducer = () =>
  combineReducers({
    user: userReducer,
  });

export default rootReducer;
