import React, { FC } from 'react';
import {
  makeStyles,
  List,
  Divider,
  Drawer as MuiDrawer,
  DrawerProps,
  Typography,
} from '@material-ui/core';

import DrawerListItem, { DrawerRouteListItem } from './drawer-list-item';

interface Props extends Pick<DrawerProps, 'open' | 'onClose'> {
  routeLists: DrawerRouteListItem[];
}

const drawerWidth = '100%';

const useStyles = makeStyles({
  container: {
    display: 'flex',
  },
  drawer: {
    width: drawerWidth,
    flexShrink: 0,
  },
  drawerPaper: {
    width: drawerWidth,
  },
  drawerContainer: {
    overflow: 'auto',
  },
  navbarDivider: {
    marginTop: '83px',
    marginBottom: '4px',
    backgroundColor: '#efefef',
  },
  copyrightText: {
    paddingRight: '25px',
    marginBottom: '15px',
    marginTop: '7px',
    fontSize: '12px',
    color: '#aaa',
    fontFamily: 'Basis Grotesque',
  },
});

const Drawer: FC<Props> = ({ open, onClose, routeLists }) => {
  const classes = useStyles();

  return (
    <MuiDrawer
      open={open}
      onClose={onClose}
      className={classes.drawer}
      variant="persistent"
      classes={{
        paper: classes.drawerPaper,
      }}
    >
      <Divider className={classes.navbarDivider} />
      <div className={classes.drawerContainer}>
        <List>
          {routeLists.map((routeList, index) => {
            const { name, dropdownList } = routeList;
            const previousRouteLists = index ? routeLists[index - 1] : null;
            let displayTopDivider = false;

            if (
              index > 0 &&
              previousRouteLists &&
              !previousRouteLists.dropdownList &&
              dropdownList
            ) {
              displayTopDivider = true;
            }

            return (
              <DrawerListItem
                key={name}
                topBorder={displayTopDivider}
                bottomBorder={Boolean(dropdownList)}
                routeList={routeList}
              />
            );
          })}
        </List>
        <Typography align="right" color="inherit" className={classes.copyrightText}>
          &#169;2020 Dave, Inc.
        </Typography>
      </div>
    </MuiDrawer>
  );
};

export default Drawer;
