import React, { FunctionComponent } from 'react';
import classNames from 'classnames';

import Urls from 'lib/urls';

import Button from 'components/button';
import Modal, { ModalProps } from 'components/modal';

import styles from './modal.module.css';

type Props = {
  onEdit: () => void;
  onResend: () => void;
} & ModalProps;

const VerificationCodeModal: FunctionComponent<Props> = ({ onEdit, onResend, ...modalProps }) => {
  return (
    <Modal {...modalProps}>
      <>
        <h1 className="title-3">Need help?</h1>
        <div className={classNames([styles.bodyText, 'col-12 col-md-9'])}>
          <p className="body-4">
            If you didn’t receive the code we can resend it to you or you can edit recipient number.
          </p>
        </div>
        <div className={styles.buttonContainer}>
          <Button title="Resend the code" onClick={onResend} />
          <Button title="Edit number" onClick={onEdit} />

          <div className={styles.helpLinkSpacing}>
            <a href={Urls.FAQ} target="_blank" rel="noreferrer noopener">
              Still have an issue? Visit our Help Center
            </a>
          </div>
        </div>
      </>
    </Modal>
  );
};

export default VerificationCodeModal;
