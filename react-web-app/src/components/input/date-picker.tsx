import React, { FunctionComponent } from 'react';
import classNames from 'classnames';
import DateP, { ReactDatePickerProps } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

import styles from './index.module.css';

type Props = {
  value: Date | null;
  title: string;
} & Pick<ReactDatePickerProps, 'onChange'>;

const DatePicker: FunctionComponent<Props> = ({ value, onChange, title }) => (
  <DateP
    className={classNames(styles.input, styles['input-date-picker'])}
    wrapperClassName={classNames(styles.inputWrapper, 'mb-24')}
    selected={value}
    onChange={onChange}
    dateFormat="MM-dd-yyyy"
    placeholderText={title}
  />
);

export default DatePicker;
