import { Op } from 'sequelize';

export type SequelizeOperator =
  | typeof Op.gte
  | typeof Op.gt
  | typeof Op.lt
  | typeof Op.lte
  | typeof Op.in
  | typeof Op.notIn;
