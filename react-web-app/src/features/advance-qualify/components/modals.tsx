import React, { FunctionComponent } from 'react';
import classNames from 'classnames';

import Button from 'components/button';
import Modal, { ModalProps } from 'components/modal';

import { Calendar, MinimumBalance, NotNegative, Paychecks } from 'img/icon';

import styles from './modals.module.css';

const qualifyCells = [
  {
    body: 'You need two paychecks from the same employer.',
    image: <Paychecks />,
    title: 'Two paychecks',
  },
  {
    body: 'Keep at least $105 in your account after you get paid.',
    image: <MinimumBalance />,
    title: 'Minimum balance of $105',
  },
  {
    body: 'Your account has been active for at least 60 days.',
    image: <Calendar />,
    title: 'Bank account age',
  },
  {
    body: 'We only advance to accounts that are not negative.',
    image: <NotNegative />,
    title: 'Account is not negative',
  },
];

const AdvanceQualifyModal: FunctionComponent<ModalProps> = (props) => {
  const { onClose } = props;
  return (
    <Modal {...props}>
      <div className={styles.container}>
        <h1 className={classNames(['title-3', styles.title])}>How do I get approved?</h1>

        {qualifyCells.map((cell) => (
          <div key={cell.title} className={classNames(['col-12', styles.cell])}>
            <div className={styles.image}>{cell.image}</div>
            <div>
              <h1 className={classNames(['body-4', styles.subtitle])}>{cell.title}</h1>
              <p className={classNames('body-4 text-gray4', styles.body)}>{cell.body}</p>
            </div>
          </div>
        ))}

        <div className="col-12">
          <Button title="Got it!" onClick={onClose} />
        </div>
      </div>
    </Modal>
  );
};

export default AdvanceQualifyModal;
