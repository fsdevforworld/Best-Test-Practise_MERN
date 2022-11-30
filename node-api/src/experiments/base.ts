import * as PlanOut from 'planout';
import amplitude, { EventData } from '../lib/amplitude';

export default abstract class BaseExperiment extends PlanOut.Experiment {
  public abstract serializeLog(data: PlanOut.Event): EventData;

  public configureLogger() {}

  public log(data: PlanOut.Event) {
    const serializedData = this.serializeLog(data);
    return amplitude.track(serializedData);
  }

  public previouslyLogged() {
    return this._exposureLogged;
  }

  public getParamNames() {
    return this.getDefaultParamNames();
  }
}
