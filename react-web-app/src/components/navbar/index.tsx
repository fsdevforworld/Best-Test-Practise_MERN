import React, { FC, useState } from 'react';
import clsx from 'clsx';
import {
  Grid,
  makeStyles,
  Theme,
  Button,
  Typography,
  Hidden,
  Divider,
  SvgIconProps,
} from '@material-ui/core';

import { DaveLogo } from 'img/logos';
import { MenuIcon, XIcon } from 'components/icons';
import Colors from 'components/colors';

import NavBarListItem, { NavBarRouteListItem } from './navbar-list-item';
import Drawer from './drawer';
import { DrawerRouteListItem } from './drawer-list-item';

const useStyles = makeStyles((theme: Theme) => ({
  headerContainer: {
    minHeight: '79px',
    zIndex: theme.zIndex.drawer + 1,
    backgroundColor: 'white',
  },
  fixedHeaderContainer: {
    position: 'fixed',
    top: 0,
  },
  header: {
    padding: `15px 50px`,
    [theme.breakpoints.down('sm')]: {
      padding: `23px 25px 21px 25px`,
    },
  },
  daveLogo: {
    color: 'white',
    width: '87px',
    height: '22px',
  },
  menuIcon: {
    cursor: 'pointer',
    padding: '0px 10px',
    color: Colors.black,
  },
  divider: {
    backgroundColor: Colors.gray1,
  },
  joinButtonText: {
    fontFamily: 'Larsseit',
    fontSize: '16px',
    lineHeight: '19px',
    color: 'white',
    fontWeight: 'bold',
  },
  navButton: {
    color: theme.palette.getContrastText(Colors.green3),
    backgroundColor: Colors.green3,
    borderRadius: '6px',
    textTransform: 'none',
    padding: '20px 19px',
    minWidth: '40px',
    [theme.breakpoints.down('sm')]: {
      padding: '10px 19px',
    },
    '&:hover': {
      backgroundColor: Colors.green4,
    },
  },
}));

const navbarRouteLists: NavBarRouteListItem[] = [
  {
    name: 'About',
    dropdownList: [
      {
        name: 'About the company',
        url: '/about',
      },
      {
        name: 'DEI',
        url: '/dei',
      },
      {
        name: 'Press',
        url: '/press',
      },
    ],
  },
  {
    name: 'Help',
    url: '/help',
  },
  {
    name: 'Careers',
    url: '/careers',
  },
  {
    name: 'Blog',
    url: '/blog/',
  },
  {
    name: 'Giving Back',
    url: '/giving-back',
  },
];

const drawerRouteLists: DrawerRouteListItem[] = [
  ...navbarRouteLists,
  {
    name: 'Company',
    dropdownList: [
      {
        name: 'Careers',
        url: '/careers',
      },
      {
        name: 'Help',
        url: '/help',
      },
    ],
  },
  {
    name: 'Features',
    dropdownList: [
      {
        name: 'Side Hustle',
        url: '/side-hustle',
      },
      {
        name: 'Build Credit',
        url: '/build-credit',
      },
    ],
  },
  {
    name: 'Recources',
    dropdownList: [
      {
        name: 'Dave Banking Policies',
        url: '/deposit-agreement',
      },
      {
        name: 'Dave Privacy Policy',
        url: '/privacy',
      },
      {
        name: 'Dave Terms of Use',
        url: '/terms',
      },
    ],
  },
  {
    name: 'Follow Us',
    dropdownList: [
      {
        name: 'Facebook',
        url: 'https://www.facebook.com/TheDaveApp',
      },
      {
        name: 'Twitter',
        url: 'https://twitter.com/davesavesyou',
      },
      {
        name: 'Instagram',
        url: 'https://www.instagram.com/thedaveapp',
      },
    ],
  },
];

const NavBar: FC = () => {
  const classes = useStyles();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const menuIconProps: SvgIconProps = {
    fontSize: 'small',
    color: 'inherit',
    onClick: () => {
      setIsDrawerOpen(!isDrawerOpen);
    },
    className: classes.menuIcon,
  };

  return (
    <>
      <Grid
        container
        className={clsx(classes.headerContainer, {
          [classes.fixedHeaderContainer]: isDrawerOpen,
        })}
        direction="column"
        justify="center"
        alignItems="center"
      >
        <Grid
          container
          className={classes.header}
          direction="row"
          justify="space-between"
          alignItems="center"
          wrap="nowrap"
        >
          <Grid item className={classes.daveLogo}>
            <DaveLogo color={Colors.black} />
          </Grid>
          <Grid item>
            <Grid container direction="row" justify="space-between" alignItems="center">
              <Hidden smDown>
                {navbarRouteLists.map((routeList) => {
                  return <NavBarListItem key={routeList.name} routeList={routeList} />;
                })}
              </Hidden>
              <Grid item>
                <Button
                  className={classes.navButton}
                  href="/register"
                  color="inherit"
                  variant="contained"
                  disableElevation
                  disableRipple
                >
                  <Typography className={classes.joinButtonText}>Join Dave</Typography>
                </Button>
              </Grid>
              <Hidden mdUp>
                <Grid item>
                  {isDrawerOpen ? <XIcon {...menuIconProps} /> : <MenuIcon {...menuIconProps} />}
                </Grid>
              </Hidden>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
      <Hidden mdUp>
        <Divider className={classes.divider} />
        <Drawer
          open={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          routeLists={drawerRouteLists}
        />
      </Hidden>
    </>
  );
};

export default NavBar;
