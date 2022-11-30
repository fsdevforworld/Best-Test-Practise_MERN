import React, { FunctionComponent, useCallback, useMemo, useState } from 'react';
import classNames from 'classnames';

import Icon from 'components/icon';

import {
  hasALowerCaseLetter,
  hasAnUpperCaseLetter,
  hasNumber,
  hasMinLength,
  hasASpecialCharacter,
} from 'lib/validation';

import styles from './index.module.css';

type Props = {
  onChange: (obj: { value: string; isValid: boolean }) => void;
  value: string;
  size?: 'medium' | 'large';
  variant?: 'light' | 'dark';
};
type BaseProps = Props & {
  label: string;
  Helper: FunctionComponent<PasswordHelperProps>;
  validator: (password: string) => boolean;
};

const BasePasswordInput: FunctionComponent<BaseProps> = ({
  onChange,
  value,
  size = 'medium',
  variant = 'light',
  label,
  Helper,
  validator,
}) => {
  const [hasFocus, setHasFocus] = useState(false);
  const [hasRefocused, setHasRefocused] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const onValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ value: e.target.value, isValid: validator(e.target.value) });
    },
    [validator, onChange],
  );

  const showError = useMemo(() => {
    return value !== '' && !validator(value) && (hasRefocused || (!hasFocus && isDirty));
  }, [hasFocus, hasRefocused, isDirty, validator, value]);

  const icon = useMemo(() => {
    if (validator(value) && isDirty) {
      return (
        <Icon
          styles={classNames(styles.icon, size === 'large' && styles['icon-lg'])}
          name="check"
          fill="green3"
        />
      );
    }

    if (value !== '' && !validator(value) && (hasRefocused || (!hasFocus && isDirty))) {
      return (
        <Icon
          styles={classNames(styles.icon, size === 'large' && styles['icon-lg'])}
          name="warning"
          fill="candy3"
        />
      );
    }

    return <> </>;
  }, [hasFocus, hasRefocused, isDirty, size, validator, value]);

  return (
    <>
      <div className="mb-24">
        <div className={styles.inputWrapper}>
          <input
            className={classNames(
              styles.input,
              showError && styles.inputError,
              size === 'large' && styles['input-lg'],
              variant === 'dark' && styles['input-dark'],
            )}
            onChange={onValueChange}
            maxLength={72}
            onFocus={() => {
              if (isDirty) {
                setHasRefocused(true);
              }
              setHasFocus(true);
              setIsDirty(true);
            }}
            onBlur={() => setHasFocus(false)}
            placeholder=" "
            type="password"
            value={value}
          />
          <span
            className={classNames(
              styles.label,
              showError && styles.labelError,
              size === 'large' && styles['label-lg'],
              variant === 'dark' && styles['label-dark'],
            )}
          >
            {label}
          </span>
          {icon}
        </div>

        <Helper isDirty={isDirty} password={value} showError={showError} />
      </div>
    </>
  );
};

const isPasswordValid = (password: string) => {
  return (
    hasAnUpperCaseLetter(password) &&
    hasALowerCaseLetter(password) &&
    hasNumber(password) &&
    hasMinLength(password) &&
    hasASpecialCharacter(password)
  );
};

type PasswordHelperProps = {
  password: string;
  isDirty: boolean;
  showError: boolean;
};

const PasswordHelper: FunctionComponent<PasswordHelperProps> = ({ isDirty, password }) => {
  const validation = useMemo(() => {
    return {
      uppercase: hasAnUpperCaseLetter(password),
      lowercase: hasALowerCaseLetter(password),
      number: hasNumber(password),
      length: hasMinLength(password),
      specialCharacter: hasASpecialCharacter(password),
    };
  }, [password]);

  if (!isDirty) {
    return null;
  }

  return (
    <div className={styles.errorText}>
      <table>
        <tbody>
          <tr>
            <td className="pr-24">
              <span
                className={classNames([
                  'body-1',
                  'text-green3',
                  !validation.uppercase && 'text-gray4',
                ])}
              >
                1 uppercase letter
              </span>
            </td>
            <td>
              <span
                className={classNames([
                  'body-1',
                  'text-green3',
                  !validation.number && 'text-gray4',
                ])}
              >
                1 number
              </span>
            </td>
          </tr>
          <tr>
            <td className="pr-24">
              <span
                className={classNames([
                  'body-1',
                  'text-green3',
                  !validation.lowercase && 'text-gray4',
                ])}
              >
                1 lowercase letter
              </span>
            </td>
            <td>
              <span
                className={classNames([
                  'body-1',
                  'text-green3',
                  !validation.length && 'text-gray4',
                ])}
              >
                8 characters minimum
              </span>
            </td>
          </tr>
          <tr>
            <td className="pr-24">
              <span
                className={classNames([
                  'body-1',
                  'text-green3',
                  !validation.specialCharacter && 'text-gray4',
                ])}
              >
                1 special character
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const PasswordInput: FunctionComponent<Props> = (props) => {
  return (
    <BasePasswordInput
      Helper={PasswordHelper}
      validator={isPasswordValid}
      label="Password"
      {...props}
    />
  );
};

const ConfirmPasswordHelper: FunctionComponent<PasswordHelperProps> = ({ showError }) => {
  if (!showError) {
    return null;
  }

  return (
    <div className={styles.errorText}>
      <span className="body-1 text-candy3">Your passwords do not match</span>
    </div>
  );
};

export const ConfirmPasswordInput: FunctionComponent<Props & { comparisonValue: string }> = ({
  comparisonValue,
  ...props
}) => {
  return (
    <BasePasswordInput
      Helper={ConfirmPasswordHelper}
      validator={(value) => comparisonValue === value}
      label="Confirm password"
      {...props}
    />
  );
};
