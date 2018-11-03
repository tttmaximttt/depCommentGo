const Promise = require('bluebird');
const snappy = Promise.promisifyAll(require('snappy'));

const ENCODING = 'hex';
const ENCODING_STRING = 'utf8';

/**
 * @class DataDelivery - store temp data to redis instead of sending using RabbitMQ
 * It is better to use this for large data packages (like initial operations)
 */
class DataDelivery {
  constructor(injector) {
    this.dbMemory = injector.dbMemory;
    this.deliveryExpire = injector.deliveryExpire;
    this.prefix = injector.dbConstants.DATA_DELIVERY;
  }

  create(uid) {
    return `${this.prefix}_${uid}`;
  }

  remove(key) {
    const { dbMemory } = this;

    return dbMemory.delAsync(key);
  }

  async get(key) {
    try {
      const { dbMemory } = this;
      const data = await dbMemory.lrangeAsync(key);

      return await Promise.map(data, async (item) => {
        const buffer = Buffer.from(item, ENCODING);
        const buff = await snappy.uncompressAsync(buffer);

        try {
          return JSON.parse(buff.toString(ENCODING_STRING));
        } catch (e) {
          throw e;
        }
      });
    } catch (err) {
      throw err;
    }
  }


  async put(uid, data) {
    try {
      const key = this.create(uid);
      const { dbMemory, deliveryExpire } = this;
      const dataToCompress = JSON.stringify(data);
      const buffer = await snappy.compressAsync(dataToCompress);

      await dbMemory.rpushAsync(key, buffer.toString(ENCODING));
      dbMemory.client.expire(key, Math.ceil(deliveryExpire / 1000));
      return key;
    } catch (err) {
      throw err;
    }
  }
}

module.exports = DataDelivery;
