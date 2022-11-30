import React, { FunctionComponent, ReactNode } from 'react';
import { Grid } from '@material-ui/core';
import Footer from 'components/footer';
import Navbar from 'components/navbar';

type Props = {
  content: ReactNode;
};

const TermsLayout: FunctionComponent<Props> = ({ content }) => {
  return (
    <>
      <Navbar />
      <Grid container direction="column" justify="space-between" alignItems="center" wrap="nowrap">
        {content}
      </Grid>
      <Footer />
    </>
  );
};

export default TermsLayout;
