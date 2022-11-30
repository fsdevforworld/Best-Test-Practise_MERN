import React, { FC } from 'react';
import { Grid, makeStyles, Theme, Link } from '@material-ui/core';
import AppStoreButtons from 'components/app-store-buttons';
import { useIsMobile } from 'lib/hooks';
import { useModeStyle } from 'lib/use-mode-style';
import clsx from 'clsx';
import LinkGroup from './link-group';

export interface NavigationGroup {
  title: string;
  links: {
    name: string;
    url: string;
  }[];
}

interface Props {
  navigationGroups?: NavigationGroup[];
}

const defaultNavGroups: NavigationGroup[] = [
  {
    title: 'Company',
    links: [
      { name: 'About', url: '/about' },
      { name: 'Giving Back', url: '/giving-back' },
      { name: 'Careers', url: '/careers' },
      { name: 'Blog', url: '/blog/' },
      { name: 'Help', url: '/help' },
      { name: 'Press', url: '/press' },
    ],
  },
  {
    title: 'Features',
    links: [
      { name: 'Side Hustle', url: '/side-hustle' },
      { name: 'Build Credit', url: '/build-credit' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { name: 'Dave Banking Policies', url: '/deposit-agreement' },
      { name: 'Dave Privacy Policy', url: '/privacy' },
      { name: 'Dave Terms of Use', url: '/terms' },
    ],
  },
  {
    title: 'Follow Us',
    links: [
      { name: 'Facebook', url: 'https://www.facebook.com/TheDaveApp/' },
      { name: 'Twitter', url: 'https://twitter.com/DaveBanking' },
      { name: 'Instagram', url: 'https://www.instagram.com/thedaveapp/' },
    ],
  },
];

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    marginTop: theme.spacing(4),
  },
  linksContainer: {
    flexBasis: 0,
    flexGrow: 1,
  },
  appLinksContainer: {
    alignItems: 'center',
    flexWrap: 'nowrap',
    width: 360,
    [theme.breakpoints.down('xs')]: {
      alignItems: 'flex-start',
      marginBottom: theme.spacing(3),
    },
  },
  appLinksWrapper: {
    flexBasis: 0,
    flexGrow: 0.25,
  },
  link: {
    display: 'block',
    paddingBottom: '8px',
    whiteSpace: 'nowrap',
    fontFamily: 'Basis Grotesque',
    fontSize: '14px',
    fontWeight: 400,
    '&:hover': {
      color: '#16b04f',
    },
  },
}));

const Links: FC<Props> = ({ navigationGroups = defaultNavGroups }) => {
  const classes = useStyles();
  const { classes: modeClasses } = useModeStyle();

  const isMobile = useIsMobile();

  return (
    <Grid container item justify="space-between" className={classes.container}>
      {isMobile && (
        <Grid container item>
          <LinkGroup header="GET THE APP" className={classes.appLinksContainer}>
            <AppStoreButtons />
          </LinkGroup>
        </Grid>
      )}
      <Grid container item className={classes.linksContainer}>
        {navigationGroups.map(({ title, links }) => (
          <LinkGroup key={title} header={title}>
            {links.map(({ name, url }) => (
              <Link
                key={name}
                underline="none"
                className={clsx(classes.link, modeClasses.textTertiary)}
                href={url}
              >
                {name}
              </Link>
            ))}
          </LinkGroup>
        ))}
      </Grid>
      {!isMobile && (
        <Grid container item className={classes.appLinksWrapper} justify="flex-end">
          <LinkGroup header="GET THE APP" className={classes.appLinksContainer}>
            <AppStoreButtons />
          </LinkGroup>
        </Grid>
      )}
    </Grid>
  );
};

export default Links;
