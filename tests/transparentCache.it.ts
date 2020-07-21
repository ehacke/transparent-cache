import { config } from 'dotenv';
import getenv from 'getenv';
import Redis from 'ioredis';
import sinon from 'sinon';
import { expect } from 'chai';
import { v4 as uuid } from 'uuid';
import Bluebird from 'bluebird';
import { TransparentCache } from '../src/transparentCache';

config();

const REDIS_HOST = getenv('REDIS_HOST');
const REDIS_PORT = getenv('REDIS_PORT');

describe('cache integration test', () => {
  let redis;

  before(() => {
    redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  afterEach(async () => {
    if (redis) {
      await redis.flushdb();
    }
  });

  after(async () => {
    if (redis) {
      await redis.flushdb();
      await redis.disconnect();
    }
    redis = null;
  });

  it('normal operation', async () => {
    const serviceResponse = uuid();
    const transparentCache = new TransparentCache({ redis });

    const fakeFunction = sinon.stub().callsFake(() => serviceResponse);

    const wrapped = transparentCache.wrap<string>(fakeFunction);

    const spiedLocal = sinon.spy(wrapped.__localCache as any);
    const spiedRemote = sinon.spy(wrapped.__remoteCache as any);

    expect(await wrapped()).to.eql(serviceResponse);
    expect(fakeFunction.callCount).to.eql(1);
    expect((spiedLocal as any).get.callCount).to.eql(1);
    expect((spiedRemote as any).get.callCount).to.eql(1);
    expect((spiedLocal as any).setpx.callCount).to.eql(1);
    expect((spiedRemote as any).setpx.callCount).to.eql(1);

    // Wait for out-of-band refresh to complete
    await Bluebird.delay(5);

    expect(await wrapped()).to.eql(serviceResponse);
    expect(fakeFunction.callCount).to.eql(1);
    expect((spiedLocal as any).get.callCount).to.eql(2);
    expect((spiedRemote as any).get.callCount).to.eql(1);
    expect((spiedLocal as any).setpx.callCount).to.eql(1);
    expect((spiedRemote as any).setpx.callCount).to.eql(1);

    // Wait for out-of-band refresh to complete
    await Bluebird.delay(5);
  });

  it('delete after', async () => {
    const serviceResponse = uuid();
    const transparentCache = new TransparentCache({ redis });

    const fakeFunction = sinon.stub().callsFake(() => serviceResponse);

    const wrapped = transparentCache.wrap<string>(fakeFunction);

    const spiedLocal = sinon.spy(wrapped.__localCache as any);
    const spiedRemote = sinon.spy(wrapped.__remoteCache as any);

    expect(await wrapped()).to.eql(serviceResponse);
    expect(fakeFunction.callCount).to.eql(1);
    expect((spiedLocal as any).get.callCount).to.eql(1);
    expect((spiedRemote as any).get.callCount).to.eql(1);
    expect((spiedLocal as any).setpx.callCount).to.eql(1);
    expect((spiedRemote as any).setpx.callCount).to.eql(1);
    expect((spiedLocal as any).delete.callCount).to.eql(0);
    expect((spiedRemote as any).delete.callCount).to.eql(0);

    // Wait for out-of-band refresh to complete
    await Bluebird.delay(5);

    await wrapped.delete();

    expect((spiedLocal as any).delete.callCount).to.eql(1);
    expect((spiedRemote as any).delete.callCount).to.eql(1);

    expect(await wrapped()).to.eql(serviceResponse);
    expect(fakeFunction.callCount).to.eql(2);
    expect((spiedLocal as any).get.callCount).to.eql(2);
    expect((spiedRemote as any).get.callCount).to.eql(2);
    expect((spiedLocal as any).setpx.callCount).to.eql(2);
    expect((spiedRemote as any).setpx.callCount).to.eql(2);
    expect((spiedLocal as any).delete.callCount).to.eql(1);
    expect((spiedRemote as any).delete.callCount).to.eql(1);

    // Wait for out-of-band refresh to complete
    await Bluebird.delay(5);
  });

  it('to and from JSON', async () => {
    const serviceResponse = uuid();
    const transparentCache = new TransparentCache({ redis });

    const fakeFunction = sinon.stub().callsFake(() => ({ serviceResponse }));

    const wrapped = transparentCache.wrap<{ serviceResponse: string; from?: boolean }>(fakeFunction, {
      remote: { fromJson: (input) => ({ ...input, from: true } as any) },
    });

    expect(await wrapped()).to.eql({ serviceResponse });

    // Wait for out-of-band refresh to complete
    await Bluebird.delay(5);

    wrapped.__localCache.client.reset();

    expect(await wrapped()).to.eql({ serviceResponse, from: true });

    // Wait for out-of-band refresh to complete
    await Bluebird.delay(5);
  });

  it('redis timeout ignored', async () => {
    const serviceResponse = uuid();
    const transparentCache = new TransparentCache({
      redis: {
        get: sinon.stub().callsFake(() => Bluebird.delay(100)),
        set: sinon.stub().callsFake(() => Bluebird.delay(100)),
        del: sinon.stub().callsFake(() => Bluebird.delay(100)),
        pttl: sinon.stub().callsFake(() => Bluebird.delay(100)),
      } as any,
    });

    const fakeFunction = sinon.stub().callsFake(() => serviceResponse);

    const wrapped = transparentCache.wrap<string>(fakeFunction);

    const spiedLocal = sinon.spy(wrapped.__localCache as any);
    const spiedRemote = sinon.spy(wrapped.__remoteCache as any);

    expect(await wrapped()).to.eql(serviceResponse);
    expect(fakeFunction.callCount).to.eql(1);
    expect((spiedLocal as any).get.callCount).to.eql(1);
    expect((spiedRemote as any).get.callCount).to.eql(1);
    expect((spiedLocal as any).setpx.callCount).to.eql(1);
    expect((spiedRemote as any).setpx.callCount).to.eql(1);
    expect((spiedLocal as any).delete.callCount).to.eql(0);
    expect((spiedRemote as any).delete.callCount).to.eql(0);

    // Wait for out-of-band refresh to complete
    await Bluebird.delay(5);

    wrapped.__localCache.client.reset();

    expect(await wrapped()).to.eql(serviceResponse);

    // Extra calls to fakeFunction and set because pttl times out, and it tries to refresh the cache
    expect(fakeFunction.callCount).to.eql(3);
    expect((spiedLocal as any).get.callCount).to.eql(2);
    expect((spiedRemote as any).get.callCount).to.eql(2);
    expect((spiedLocal as any).setpx.callCount).to.eql(3);
    expect((spiedRemote as any).setpx.callCount).to.eql(3);
    expect((spiedLocal as any).delete.callCount).to.eql(0);
    expect((spiedRemote as any).delete.callCount).to.eql(0);

    // Wait for out-of-band refresh to complete
    await Bluebird.delay(5);
  });
});
