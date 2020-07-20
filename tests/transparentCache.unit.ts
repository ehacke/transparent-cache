import { expect } from 'chai';
import { TransparentCache } from '../src/transparentCache';

describe('unit tests', () => {
  it('throws if there is no function name', () => {
    const transparentCache = new TransparentCache({ redis: {} as any });

    expect(() => transparentCache.wrap(() => null)).to.throw('functionId required for unnamed functions');
    // eslint-disable-next-line lodash/prefer-noop
    expect(() => transparentCache.wrap(function () {})).to.throw('functionId required for unnamed functions');
  });
});
