import axios, { AxiosRequestConfig, Method } from 'axios';
import { RootAction } from 'typings/redux';

import { Dispatch } from 'redux';
import { Config } from './config';
import { getDeviceId, getDeviceType } from './device';

function formatURL(path: string): string {
  const adjustedPath = path[0] !== '/' ? `/${path}` : path;
  const url = Config.REACT_APP_API_URL;
  return `${url}${adjustedPath}`;
}

export type APIOptions = {
  params?: Record<string, any> | string;
  data?: Record<string, any> | string;
  timeout?: number;
};

export default class APIClient {
  dispatch!: (action: RootAction) => void;

  // eslint-disable-next-line
  get!: (path: string, options?: APIOptions) => Promise<any>;

  // eslint-disable-next-line
  post!: (path: string, options?: APIOptions) => Promise<any>;

  // eslint-disable-next-line
  put!: (path: string, options?: APIOptions) => Promise<any>;

  // eslint-disable-next-line
  patch!: (path: string, options?: APIOptions) => Promise<any>;

  // eslint-disable-next-line
  del!: (path: string, options?: APIOptions) => Promise<any>;

  constructor() {
    const methods: Method[] = ['get', 'post', 'put', 'patch', 'delete'];

    axios.defaults.headers.common['x-device-id'] = getDeviceId();
    axios.defaults.headers.common['x-device-type'] = getDeviceType();
    // enables cookies
    axios.defaults.withCredentials = true;

    methods.forEach((method: Method) => {
      // @ts-ignore
      this[method] = async (path: string, options: APIOptions = {}) => {
        const formattedUrl: string = formatURL(path);
        const requestConfig: AxiosRequestConfig = {
          method,
          url: formattedUrl,
        };

        if (options.data) {
          requestConfig.data = options.data;
        }

        if (options.params) {
          requestConfig.params = options.params;
        }

        if (options.timeout || options.timeout === undefined) {
          requestConfig.timeout = options.timeout || 30000;
        }

        const res = await axios(requestConfig);
        return res.data;
      };
    });
  }

  setDispatch = (dispatch: Dispatch) => {
    this.dispatch = dispatch;
  };
}
