import * as sinon from 'sinon';
import { expect } from 'chai';
import { PaymentMethod } from '../../src/models';
import { IDaveResourceRequest } from '../../src/typings';
import { addResource } from '../../src/middleware';
import { InvalidParametersError, NotFoundError } from '../../src/lib/error';
import { factory } from 'factory-girl';
import { clean } from '../test-helpers';

describe('Add resource middleware', () => {
  before(() => clean());

  afterEach(() => clean());

  it('should throw an error if the resource ID does not exist at the specified path', async () => {
    const middlewareFn = addResource<PaymentMethod>(PaymentMethod, 'foo.bar.baz');
    const spy = sinon.spy();
    await middlewareFn({} as IDaveResourceRequest<PaymentMethod>, null, spy);
    expect(spy).to.have.callCount(1);
    expect(spy.firstCall.args[0]).to.be.an.instanceOf(InvalidParametersError);
    expect(spy.firstCall.args[0].message).to.equal('Could not find resource at specified path');
  });

  it('should throw an error if the resource was not found', async () => {
    const middlewareFn = addResource<PaymentMethod>(PaymentMethod, 'paymentMethodId');
    const request = { paymentMethodId: 1 } as unknown;

    const spy = sinon.spy();
    await middlewareFn(request as IDaveResourceRequest<PaymentMethod>, null, spy);
    expect(spy).to.have.callCount(1);
    expect(spy.firstCall.args[0]).to.be.an.instanceOf(NotFoundError);
  });

  it('should throw an error if the resource is not owned by the authorized user', async () => {
    const middlewareFn = addResource<PaymentMethod>(PaymentMethod, 'paymentMethodId');
    const paymentMethod = await factory.create('payment-method');
    const request = ({
      paymentMethodId: paymentMethod.id,
      user: {},
    } as unknown) as IDaveResourceRequest<PaymentMethod>;

    const spy = sinon.spy();
    await middlewareFn(request, null, spy);
    expect(spy).to.have.callCount(1);
    expect(spy.firstCall.args[0]).to.be.an.instanceOf(InvalidParametersError);
  });

  it('should successfully add the resource of the right type to the request', async () => {
    const middlewareFn = addResource<PaymentMethod>(PaymentMethod, 'paymentMethodId');
    const paymentMethod = await factory.create('payment-method');
    const request = ({
      paymentMethodId: paymentMethod.id,
      user: { id: paymentMethod.userId },
    } as unknown) as IDaveResourceRequest<PaymentMethod>;

    const spy = sinon.spy();
    await middlewareFn(request, null, spy);
    expect(spy).to.have.callCount(1);
    expect(spy.firstCall.args[0]).to.equal(undefined);
    expect(request.resource).to.be.an.instanceOf(PaymentMethod);
    expect(request.resource.id).to.equal(paymentMethod.id);
  });
});
