import React, { FunctionComponent } from 'react';

type Props = {
  onSubmit: () => void;
  className?: string;
};

const Form: FunctionComponent<Props> = ({ children, onSubmit, className }) => {
  const handleSubmit = (event: React.KeyboardEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className={className} onSubmit={handleSubmit}>
      {children}
    </form>
  );
};

export default Form;
