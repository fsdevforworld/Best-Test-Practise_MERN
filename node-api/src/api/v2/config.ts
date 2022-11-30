import { IDaveRequest } from '../../typings';
import { Response } from 'express';
import { Config } from '../../models';

async function get(req: IDaveRequest, res: Response) {
  const config = await Config.findAll();
  res.send(
    config.reduce((accumulator: any, item: Config) => {
      accumulator[item.key] = item.value;
      return accumulator;
    }, {}),
  );
}

export default {
  get,
};
