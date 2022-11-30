import React, { FunctionComponent } from 'react';
import classNames from 'classnames';

import styles from './index.module.css';

type Props = {
  steps: string[];
  activeStep: number;
};

function getStyle(itemIndex: number, activeIndex: number): string {
  if (itemIndex === activeIndex) return styles.stepsItemActive;
  if (itemIndex < activeIndex) return styles.stepsItemCompleted;
  return '';
}

const ProgressSteps: FunctionComponent<Props> = ({ steps, activeStep }) => {
  return (
    <div className={styles.steps}>
      {steps.map((step: string, index: number) => {
        const itemStyle = styles[`stepsItem${index}`];
        const activeStyle = getStyle(index, activeStep);

        return (
          <div className={classNames([styles.stepsItem, itemStyle, activeStyle])} key={step}>
            <div className={styles.stepsItemContent}>
              {index > 0 && (
                <span
                  className={classNames([styles.stepsItemLine, styles[`stepsItemLine${index}`]])}
                />
              )}
              <span className={styles.stepsItemIcon} />
            </div>
            <span className={classNames([styles.stepsItemText, itemStyle])}>{step}</span>
          </div>
        );
      })}
    </div>
  );
};

export default ProgressSteps;
