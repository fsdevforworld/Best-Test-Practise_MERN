import React, { FunctionComponent, useState, ChangeEvent } from 'react';
import classNames from 'classnames';
import { useDispatch } from 'react-redux';
import { RouteComponentProps } from 'react-router-dom';
import moment from 'moment';

import Button from 'components/button';
import Form from 'components/form';
import Input from 'components/input';
import DatePicker from 'components/input/date-picker';
import TwoColumnLayout from 'components/layout';
import { submitCCPARequest } from 'actions/ccpa';

import { Shield } from 'img/icon';

import styles from './ccpa-request.module.css';

const CCPARequest: FunctionComponent<RouteComponentProps> = ({ history }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDoB] = useState<Date | null>(null);
  const [ssn, setSSN] = useState('');
  const [requestType, setRequestType] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');

  const dispatch = useDispatch();

  const validateForm = () => {
    return Boolean(firstName && lastName && email && dob && ssn && requestType && details);
  };

  const onSubmit = async () => {
    setError('');
    const valid = validateForm();
    if (!valid) {
      setError('Please fill all required fields and submit again.');
      return;
    }
    try {
      const birthdate = dob as Date;
      await dispatch(
        submitCCPARequest({
          firstName,
          lastName,
          email,
          birthdate: moment(birthdate).format('MM-DD-YYYY'),
          ssn,
          requestType,
          details,
        }),
      );
      history.push('/ccpa-request/submitted');
    } catch (e) {
      setError('There was an issue with submitting your form. Please try again.');
    }
  };

  const handleRequestTypeChanged = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setRequestType(value);
  };

  return (
    <>
      <TwoColumnLayout
        title={<h1 className="title-6 text-black">CCPA request form</h1>}
        hideBBB
        body={
          <>
            <p className="body-4 text-black col-12">
              Welcome! Please complete this form to submit a request and we will respond as soon as
              possible. You may also submit requests directly from your account within the Dave app.
              Thank you.
            </p>
            <div className={styles.inputContainer}>
              <div className="col-12">
                <Form onSubmit={onSubmit}>
                  <Input
                    hasError={false}
                    title="First name"
                    onChange={({ value }) => setFirstName(value)}
                    value={firstName}
                  />
                  <Input
                    hasError={false}
                    title="Last name"
                    onChange={({ value }) => setLastName(value)}
                    value={lastName}
                  />
                  <Input
                    hasError={false}
                    title="Email address"
                    onChange={({ value }) => setEmail(value)}
                    value={email}
                  />
                  <DatePicker
                    onChange={(date) => {
                      if (Array.isArray(date)) return;
                      setDoB(date);
                    }}
                    value={dob}
                    title="Date of birth"
                  />
                  <Input
                    hasError={false}
                    title="Social security number"
                    onChange={({ value }) => setSSN(value)}
                    value={ssn}
                  />
                  <h3 className={classNames([styles.sectionLabel, 'title-3'])}>
                    Select request type
                  </h3>
                  <div className={styles.radioContainer}>
                    <label
                      htmlFor="data-deletion"
                      className={classNames([styles.radioLabel, 'text-black body-4'])}
                    >
                      <input
                        type="radio"
                        id="data-deletion"
                        value="DELETION"
                        checked={requestType === 'DELETION'}
                        onChange={handleRequestTypeChanged}
                        className={styles.radioButton}
                      />
                      Data deletion
                    </label>
                    <label
                      htmlFor="data-request"
                      className={classNames([styles.radioLabel, 'text-black body-4'])}
                    >
                      <input
                        type="radio"
                        id="data-request"
                        value="REQUEST"
                        checked={requestType === 'REQUEST'}
                        onChange={handleRequestTypeChanged}
                        className={styles.radioButton}
                      />
                      Data request
                    </label>
                  </div>
                  <h3 className={classNames([styles.sectionLabel, 'title-3'])}>Request details</h3>
                  <div className="col-12 body-4 text-black" style={{ marginBottom: 15 }}>
                    Please provide any relevant details to your California Consumer Privacy Act
                    (CCPA) request. If your message is unrelated to the CCPA, please email&nbsp;
                    <a href="mailto:support@dave.com">support@dave.com</a> as you won’t get a
                    response from filling out this form.
                  </div>
                  <Input
                    hasError={false}
                    title="Details"
                    onChange={({ value }) => setDetails(value)}
                    value={details}
                  />
                </Form>
              </div>
              <div className="col-12">
                {error && <div className="col-12 body-1 text-candy3">{error}</div>}
                <Button title="Submit" onClick={onSubmit} />
              </div>
              <div className={classNames([styles.disclaimer, 'col-12 body-1 text-black'])}>
                I understand that I must verify my identity and request under the California
                Consumer Privacy Act before further action will be taken. As part of this process,
                government identification may be required for authentication.
              </div>
            </div>
          </>
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

export default CCPARequest;
