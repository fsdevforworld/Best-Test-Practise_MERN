import React, { FunctionComponent } from 'react';
import classNames from 'classnames';
import Colors from 'components/colors';
import styles from './index.module.css';

type Props = {
  progress: number;
  isWhite?: boolean;
  opacity?: number;
  className?: string;
};

const ProgressBar: FunctionComponent<Props> = ({
  progress,
  isWhite = false,
  opacity = 0.24,
  className = undefined,
}) => {
  let color = Colors.green3; // Default color.
  if (isWhite) {
    color = Colors.white;
  }

  return (
    <div className={classNames([styles.container, className])}>
      <div style={{ backgroundColor: color, flex: progress }} />
      <div style={{ backgroundColor: color, flex: 1 - progress, opacity: opacity }} />
    </div>
  );
};

export default ProgressBar;
