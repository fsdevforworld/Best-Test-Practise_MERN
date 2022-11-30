import React, { FunctionComponent, ReactNode } from 'react';
import classNames from 'classnames';
import Div100vh from 'react-div-100vh';

import Urls from 'lib/urls';
import Colors from 'components/colors';

import { DaveLogo, BBBLogo } from 'img/logos';
import styles from './two-column.module.css';

type Props = {
  backgroundImage?: string;
  body: string | ReactNode;
  footer?: ReactNode;
  title: string | ReactNode;
  hideBBB?: boolean;
  rightContent?: ReactNode;
};

const TwoColumnLayout: FunctionComponent<Props> = ({
  backgroundImage = null,
  body,
  footer,
  title,
  hideBBB = false,
  rightContent,
}) => {
  const background = backgroundImage
    ? {
        backgroundImage: `url(${backgroundImage})`,
      }
    : {};

  return (
    <div className={styles.wrapper}>
      <Div100vh className={styles.left} style={{ minHeight: '100rvh' }}>
        <div className={styles.header}>
          {/* Dave Logo */}
          <div className={styles.logo}>
            <a href={Urls.SAVES} target="_blank" rel="noreferrer noopener">
              <DaveLogo color={Colors.black} />
            </a>
          </div>
          {/* BBB Logo */}
          {!hideBBB && (
            <div className={styles.bbbWrapper}>
              <BBBLogo className={styles.bbbLogo} />
              <div className={classNames([styles.bbbText, 'body-4 hidden-sm'])}>
                <span>
                  Better Business Bureau
                  <br />
                  Accredited Business
                </span>
              </div>
              <div className={classNames([styles.bbbText, 'body-4 hidden-md hidden-lg'])}>
                <span>
                  Accredited
                  <br />
                  Business
                </span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.body}>
          {title}

          {body}
        </div>

        <div>{footer}</div>
      </Div100vh>

      <div className={classNames([styles.image, styles.fadeIn])} style={background}>
        {rightContent}
      </div>
    </div>
  );
};

export default TwoColumnLayout;
