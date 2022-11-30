import { applyMiddleware, createStore } from 'redux';
import Client from '../lib/api-client';
import apiClientMiddlewareCreator from './api-client-middleware';
import rootReducer from './root-reducer';

const apiClient = new Client();

const apiClientMiddleware = apiClientMiddlewareCreator(apiClient);

const store = applyMiddleware(apiClientMiddleware)(createStore)(rootReducer(), {});

export default store;
