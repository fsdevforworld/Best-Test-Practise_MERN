import React, {
  FunctionComponent,
  InputHTMLAttributes,
  useCallback,
  useMemo,
  useState,
} from 'react';
import MaskedInput from 'react-text-mask';
import classNames from 'classnames';

import Icon from 'components/icon';

import {
  isEmailValid,
  isNameValid,
  isPhoneNumberValid,
  isVerificationCodeValid,
} from 'lib/validation';

import styles from './index.module.css';

type Props = {
  classes?: string;
  disabled?: boolean;
  onChange: (obj: { value: string; isValid: boolean }) => void;
  title: string;
  maskType?: 'phone' | 'verificationCode';
  inputType?: 'name' | 'email' | 'password' | 'tel';
  value: string;
  hasError: boolean;
  errorHelperText?: string;
  size?: 'medium' | 'large';
  variant?: 'light' | 'dark';
};

const inputs: {
  [key: string]: {
    mask?: (string | RegExp)[];
    placeholder?: string;
    type: string;
    validation: (arg0: string) => boolean;
    attributes?: InputHTMLAttributes<HTMLInputElement>;
  };
} = {
  text: {
    type: 'text',
    validation: () => true,
  },
  name: {
    type: 'text',
    validation: isNameValid,
    attributes: {
      autoComplete: 'off',
      autoCorrect: 'off',
    },
  },
  email: {
    type: 'email',
    validation: isEmailValid,
  },
  phone: {
    mask: [
      '(',
      /[0-9]/,
      /[0-9]/,
      /[0-9]/,
      ')',
      ' ',
      /[0-9]/,
      /[0-9]/,
      /[0-9]/,
      '-',
      /[0-9]/,
      /[0-9]/,
      /[0-9]/,
      /[0-9]/,
    ],
    placeholder: '\u2000',
    type: 'tel',
    validation: isPhoneNumberValid,
  },
  verificationCode: {
    mask: [/[0-9]/, ' ', /[0-9]/, ' ', /[0-9]/, ' ', /[0-9]/, ' ', /[0-9]/, ' ', /[0-9]/],
    placeholder: '-',
    type: 'tel',
    validation: isVerificationCodeValid,
  },
};

const InputComponent: FunctionComponent<Props> = ({
  classes,
  errorHelperText,
  hasError,
  inputType = 'text',
  onChange,
  title,
  maskType,
  value,
  size = 'medium',
  variant = 'light',
}) => {
  const [hasFocus, setHasFocus] = useState(false);
  const [hasRefocused, setHasRefocused] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const showError = useMemo(() => {
    if (hasRefocused) return value !== '' && hasError;
    return value !== '' && !hasFocus && isDirty && hasError;
  }, [hasError, hasFocus, hasRefocused, isDirty, value]);

  const onValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const key = maskType || inputType;
      const isValid = !isDirty || inputs[key] ? inputs[key].validation(e.target.value) : true;
      onChange({ value: e.target.value, isValid });
    },
    [inputType, isDirty, maskType, onChange],
  );

  const handleOnFocus = useCallback(() => {
    if (isDirty) {
      setHasRefocused(true);
    }
    setHasFocus(true);
    setIsDirty(true);
  }, [isDirty]);

  const handleOnBlur = useCallback(() => {
    setHasFocus(false);
  }, []);

  const input = maskType ? (
    // @ts-ignore
    <MaskedInput
      className={classNames(
        styles.input,
        showError && styles.inputError,
        size === 'large' && styles['input-lg'],
        variant === 'dark' && styles['input-dark'],
      )}
      guide={false}
      mask={inputs[maskType].mask}
      placeholder=" "
      placeholderChar={inputs[maskType].placeholder}
      onBlur={handleOnBlur}
      onChange={onValueChange}
      onFocus={handleOnFocus}
      type={inputs[maskType].type}
      value={value}
      {...inputs[inputType].attributes}
    />
  ) : (
    <input
      className={classNames(
        styles.input,
        showError && styles.inputError,
        size === 'large' && styles['input-lg'],
        variant === 'dark' && styles['input-dark'],
      )}
      onBlur={handleOnBlur}
      onChange={onValueChange}
      onFocus={handleOnFocus}
      placeholder=" "
      type={inputs[inputType].type}
      value={value}
      {...inputs[inputType].attributes}
    />
  );

  return (
    <>
      <div className="mb-24">
        <div className={classNames(classes, styles.inputWrapper, 'mb-24')}>
          {input}
          <span
            className={classNames(
              styles.label,
              showError && styles.labelError,
              size === 'large' && styles['label-lg'],
              variant === 'dark' && styles['label-dark'],
            )}
          >
            {title}
          </span>
          {showError && (
            <Icon
              styles={classNames(styles.icon, size === 'large' && styles['icon-lg'])}
              name="warning"
              fill="candy3"
            />
          )}
        </div>

        {showError && errorHelperText && (
          <div className={styles.errorText}>
            <span id="error-helper" className="body-1 text-candy3">
              {errorHelperText}
            </span>
          </div>
        )}
      </div>
    </>
  );
};

export default InputComponent;
export { PasswordInput, ConfirmPasswordInput } from './password-input';
