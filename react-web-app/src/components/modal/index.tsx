import React, { FunctionComponent } from 'react';
import ReactModal from 'react-modal';

import Icon from 'components/icon';

import styles from './index.module.css';
import { ModalAnalyticsProps, useModalAnalytics } from './analytics';

export type ModalProps = {
  showModal: boolean;
  onClose: () => void;
  canDismiss?: boolean;
} & ModalAnalyticsProps;

const Modal: FunctionComponent<ModalProps> = ({
  children,
  canDismiss = true,
  onClose,
  showModal,
  openEvent,
  closeEvent,
}) => {
  // open/close analytics
  useModalAnalytics({ showModal, openEvent, closeEvent });

  return (
    <ReactModal
      overlayClassName={styles.modal}
      className={styles.content}
      isOpen={showModal}
      ariaHideApp={false}
      onRequestClose={onClose}
      shouldCloseOnEsc={canDismiss}
      shouldCloseOnOverlayClick={canDismiss}
    >
      <div className={styles.container}>
        {canDismiss && (
          <div className={styles.header}>
            <Icon styles={styles.headerIcon} name="x" onClick={onClose} />
          </div>
        )}
        <div className={styles.body}>{children}</div>
      </div>
    </ReactModal>
  );
};

export default Modal;
