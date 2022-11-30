import React, { FunctionComponent, KeyboardEvent } from 'react';
import Colors, { ColorName } from 'components/colors';
import { allIcons, IconName } from './icon-paths';

type Props = {
  fill?: ColorName;
  name: IconName;
  onClick?: () => void;
  styles?: string;
};

type Linecap = 'round' | 'inherit' | 'butt' | 'square' | undefined;
type Linejoin = 'round' | 'inherit' | 'miter' | 'bevel' | undefined;

const icon: FunctionComponent<Props> = ({ fill = 'black', name, onClick, styles }) => {
  const { width, height, svg, useStroke } = allIcons[name];
  const color = Colors[fill];

  const fillProp = useStroke
    ? {
        stroke: color,
        fill: 'none',
        strokeWidth: '2',
        strokeLinecap: 'round' as Linecap,
        strokeLinejoin: 'round' as Linejoin,
      }
    : {
        fill: color,
      };

  const actionAttributes = onClick
    ? {
        onClick,
        onKeyDown: (event: KeyboardEvent) => {
          if (onClick && event.key === 'Enter') {
            onClick();
          }
        },
        role: 'button',
      }
    : {};

  return (
    <div {...actionAttributes} className={styles}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${height} ${width}`}
        {...fillProp}
        xmlns="http://www.w3.org/2000/svg"
      >
        {svg}
      </svg>
    </div>
  );
};

export default icon;
