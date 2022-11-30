import { createContext } from 'react';

export type LandingPageVariant = 'default' | 'banking' | 'promotion';
export type LandingPageAlignment = 'left' | 'center';

export type LandingPageConfig = {
  variant: LandingPageVariant;
  align: LandingPageAlignment;
};

const defaultConfig: LandingPageConfig = {
  variant: 'default',
  align: 'center',
};

const LandingPageContext = createContext<LandingPageConfig>(defaultConfig);

export default LandingPageContext;
