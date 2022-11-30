import React, { FC } from 'react';
import { Grid, Typography, makeStyles, Theme } from '@material-ui/core';
import clsx from 'clsx';
import { useModeStyle } from 'lib/use-mode-style';

interface Props {
  header: string;
  className?: string;
}

const useStyles = makeStyles((theme: Theme) => ({
  linkColumnContainer: {
    flexBasis: 0,
    margin: theme.spacing(0, 3),
    paddingTop: theme.spacing(3),
  },
  header: {
    letterSpacing: '1px',
    marginBottom: '16px',
    paddingBottom: '8px',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'Basis Grotesque',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
}));

const LinkGroup: FC<Props> = ({ header, className, children }) => {
  const classes = useStyles();
  const { classes: modeClasses } = useModeStyle();

  return (
    <Grid
      container
      item
      direction="column"
      className={clsx(classes.linkColumnContainer, className)}
    >
      <Typography className={clsx(classes.header, modeClasses.textSecondary)}>{header}</Typography>
      {children}
    </Grid>
  );
};

export default LinkGroup;
