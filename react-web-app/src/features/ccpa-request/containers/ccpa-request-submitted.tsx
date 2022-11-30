import React, { FunctionComponent } from 'react';
import classNames from 'classnames';

import TwoColumnLayout from 'components/layout';

import { Shield, GreenCheck } from 'img/icon';

import styles from './ccpa-request.module.css';

const CCPARequestSubmitted: FunctionComponent = () => {
  return (
    <>
      <TwoColumnLayout
        title={
          <h1 className="title-6 text-black">
            Form submitted <GreenCheck />
          </h1>
        }
        hideBBB
        body={
          <p className="body-4 text-black col-12">
            Thank you for submitting the form, we will respond as soon as possible. Thank you.
          </p>
        }
        rightContent={
          <div
            className={classNames([styles.image])}
            style={{ backgroundImage: `url(${Shield})` }}
          />
        }
      />
    </>
  );
};

export default CCPARequestSubmitted;
