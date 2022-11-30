import React, { FC, useState } from 'react';
import clsx from 'clsx';
import {
  makeStyles,
  Theme,
  List,
  ListItem,
  ListItemText,
  Divider,
  Collapse,
} from '@material-ui/core';

import { ChevronRightIcon } from 'components/icons';

export type DrawerRouteListItem = {
  name: string;
  url?: string;
  dropdownList?: {
    name: string;
    url: string;
  }[];
};

interface Props {
  routeList: DrawerRouteListItem;
  topBorder: boolean;
  bottomBorder: boolean;
}

const useStyles = makeStyles((theme: Theme) => ({
  listDivider: {
    backgroundColor: '#efefef',
    margin: '15px 25px',
  },
  listItemRoot: {
    padding: '14px 25px',
    color: '#9d9d9d',
    fontSize: '18px',
    fontWeight: 400,
    '&:hover': {
      backgroundColor: 'transparent',
      color: '#3c3c3c',
    },
    '&.Mui-selected, &.Mui-selected:hover': {
      backgroundColor: 'transparent',
      '&::after': {
        content: "''",
        display: 'block',
        margin: 'auto',
        position: 'absolute',
        borderLeft: '5px solid #0b9a40',
        left: 0,
        height: '27px',
      },
    },
  },
  listItemText: {
    margin: 0,
  },
  nestedListItem: {
    paddingLeft: '45px',
  },
  expandIcon: {
    fontSize: '30px',
    transform: 'rotate(0deg)',
    marginLeft: 'auto',
    transition: theme.transitions.create('transform', {
      duration: theme.transitions.duration.shortest,
    }),
  },
  expandOpen: {
    transform: 'rotate(90deg)',
  },
  copyrightText: {
    paddingRight: '25px',
    marginBottom: '15px',
    marginTop: '7px',
    fontSize: '12px',
    color: '#aaa',
    fontFamily: 'Basis Grotesque',
  },
}));

const DrawerListItem: FC<Props> = ({ routeList, topBorder, bottomBorder }) => {
  const classes = useStyles();
  const { name, dropdownList, url } = routeList;
  const [isExpanded, setIsExpanded] = useState(false);

  const listItemConditionalProps: any = dropdownList
    ? { button: true, disableRipple: true }
    : { button: true, component: 'a', href: url, disableRipple: true };

  return (
    <>
      {topBorder && <Divider className={classes.listDivider} />}
      <ListItem
        selected={url && window.location.pathname === url}
        className={classes.listItemRoot}
        onClick={() => setIsExpanded((prevExpanded) => !prevExpanded)}
        {...listItemConditionalProps}
      >
        <ListItemText
          className={classes.listItemText}
          primary={name}
          primaryTypographyProps={{ color: 'inherit', variant: 'inherit' }}
        />
        {dropdownList && (
          <ChevronRightIcon
            className={clsx(classes.expandIcon, {
              [classes.expandOpen]: isExpanded,
            })}
            fontSize="inherit"
          />
        )}
      </ListItem>
      {dropdownList && (
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {dropdownList.map(({ name: itemName, url: itemUrl }) => (
              <ListItem
                key={itemUrl}
                className={clsx([classes.nestedListItem, classes.listItemRoot])}
                selected={window.location.pathname === itemUrl}
                button
                disableRipple
                component="a"
                href={itemUrl}
              >
                <ListItemText
                  className={classes.listItemText}
                  primary={itemName}
                  primaryTypographyProps={{ color: 'inherit', variant: 'inherit' }}
                />
              </ListItem>
            ))}
          </List>
        </Collapse>
      )}
      {bottomBorder && <Divider className={classes.listDivider} />}
    </>
  );
};

export default DrawerListItem;
