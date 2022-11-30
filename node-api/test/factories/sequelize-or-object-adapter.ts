import { DefaultAdapter } from 'factory-girl';
import { ModelClass } from '../../src/lib/sequelize';
import { Model } from 'sequelize';

export class SequelizeAdapterOrObjectAdapter extends DefaultAdapter {
  private currentIdAutoIncrement = 100000000;

  constructor() {
    super();
  }

  public build(ModelStatic: ModelClass<any>, props: any) {
    try {
      return ModelStatic.build(props);
    } catch (err) {
      return props;
    }
  }

  public async save(model: Model | any) {
    if (model.save) {
      return model.save();
    } else {
      if (!model.id) {
        model.id = this.currentIdAutoIncrement;
        this.currentIdAutoIncrement += 1;
      }
      return model;
    }
  }

  public get(model: Model | any, attr: string, ModelStatic: ModelClass<any>) {
    if (model.get) {
      return model.get(attr);
    } else {
      return model[attr];
    }
  }
}
