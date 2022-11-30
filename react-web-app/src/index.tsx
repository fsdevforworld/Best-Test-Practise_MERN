import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { HelmetProvider } from 'react-helmet-async';

import './css';

import ThemeProvider from './components/theme-provider';
import store from './store';
import App from './App';

ReactDOM.render(
  <Provider store={store}>
    <HelmetProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </HelmetProvider>
  </Provider>,
  document.getElementById('root'),
);
