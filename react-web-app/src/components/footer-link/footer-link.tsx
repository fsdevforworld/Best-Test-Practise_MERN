import { Link, makeStyles, Theme } from '@material-ui/core';
import clsx from 'clsx';
import React, { FC } from 'react';

interface Props {
  href: string;
  className?: string;
}

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    fontWeight: 700,
    color: theme.palette.grey['300'],
  },
}));

const FooterLink: FC<Props> = ({ href, className, children }) => {
  const classes = useStyles();

  return (
    <Link href={href} underline="none" className={clsx(classes.root, className)}>
      {children}
    </Link>
  );
};

export default FooterLink;
