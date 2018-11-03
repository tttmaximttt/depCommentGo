const { expect } = require('chai');
const XmlHelper = require('../index');
const { xml } = require('./xml');

describe('XmlHelper', () => {
  it('have a method clean', () => {
    const xmlHelper = new XmlHelper();

    expect(xmlHelper.clean).to.be.an('function');
  });

  it('have a method segmentationTags', () => {
    const xmlHelper = new XmlHelper();

    expect(xmlHelper.removeTags).to.be.an('function');
  });

  it('segmentationTags in xml [text, chkmrk_v]', async () => {
    const xmlHelper = new XmlHelper();
    const tags = ['text', 'chkmrk_v'];
    const reply = await xmlHelper.segmentationTags(xml, tags);

    expect(reply).to.be.an('object');
  });
});
