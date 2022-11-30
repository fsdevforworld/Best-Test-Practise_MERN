import React, { FunctionComponent, ReactNode } from 'react';
import { makeStyles, Theme, Grid, Link } from '@material-ui/core';

import Colors from 'components/colors';
import { DaveLogo } from 'img/logos';
import Urls from 'lib/urls';
import { useWindowSize } from 'lib/hooks';

import backgroundGreen from '../img/backgroundGreen.svg';
import backgroundWhite from '../img/backgroundWhite.svg';

type Props = {
  content: ReactNode;
  footer: ReactNode;
  backgroundColor: 'green' | 'white';
};
const SimpleLayout: FunctionComponent<Props> = ({ content, footer, backgroundColor }) => {
  const { height } = useWindowSize();
  const classes = useStyles({ backgroundColor, height });

  return (
    <Grid
      container
      direction="column"
      className={classes.container}
      justify="space-between"
      alignItems="center"
      wrap="nowrap"
    >
      <Grid item>
        <Link className={classes.logo} href={Urls.SAVES} target="_blank" rel="noreferrer noopener">
          <DaveLogo color={backgroundColor === 'green' ? Colors.white : Colors.pitchBlack} />
        </Link>
      </Grid>
      <Grid>{content}</Grid>
      <Grid item>{footer}</Grid>
    </Grid>
  );
};

type StyleProps = Pick<Props, 'backgroundColor'> & { height: number };
const useStyles = makeStyles((theme: Theme) => ({
  container: ({ backgroundColor, height }: StyleProps) => ({
    backgroundImage:
      backgroundColor === 'green' ? `url(${backgroundWhite})` : `url(${backgroundGreen})`,
    backgroundColor: backgroundColor === 'green' ? Colors.green3 : Colors.white,
    backgroundRepeat: 'no-repeat',
    height,
    padding: theme.spacing(4, 3),
    overflow: 'hidden',
  }),
  logo: {
    textAlign: 'center',
  },
}));

export default SimpleLayout;
