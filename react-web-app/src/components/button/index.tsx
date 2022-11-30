import React, { FunctionComponent } from 'react';
import classNames from 'classnames';

import styles from './index.module.css';

interface Props
  extends React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  disabled?: boolean;
  onClick: () => void;
  title: string;
  className?: string;
}

const button: FunctionComponent<Props> = ({
  disabled,
  onClick,
  title,
  className,
  ...buttonProps
}) => {
  return (
    <button
      type="button"
      disabled={disabled}
      className={classNames(styles.button, className)}
      onClick={() => {
        if (!disabled) {
          onClick();
        }
      }}
      {...buttonProps}
    >
      {title}
    </button>
  );
};

export default button;
