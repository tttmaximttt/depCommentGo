const { expect } = require('chai');
const Fabric = require('../index');

describe('Fabric', () => {
  it('have a method createConverter', () => {
    const fabric = new Fabric({});

    expect(fabric.createConverter).to.be.an('function');
  });
});
