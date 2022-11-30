import { RootState } from 'typings/redux';

export const selectUser = (state: RootState) => state.user;
export const selectTempUser = (state: RootState) => state.user.tempUser;
