import { createContext } from 'react';

export type Mode = 'light' | 'dark';

const ModeContext = createContext<Mode>('light');

export default ModeContext;
