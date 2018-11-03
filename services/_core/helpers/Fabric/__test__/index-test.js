const { expect } = require('chai');
const Fabric = require('../index');

describe('Fabric', () => {
  it('have a method createSnapshotAggregator', () => {
    const fabric = new Fabric();

    expect(fabric.createSnapshotAggregator).to.be.an('function');
  });

  describe('createSnapshotAggregator', () => {
    it('have a method aggregate', () => {
      const fabric = new Fabric();
      const aggregator = fabric.createSnapshotAggregator();

      expect(aggregator).to.be.an('object');
      expect(aggregator.aggregate).to.be.an('function');
    });
  });
});
