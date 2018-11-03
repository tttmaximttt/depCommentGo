/* eslint-disable import/no-extraneous-dependencies */
const { expect } = require('chai');
const sinon = require('sinon');
const SnapshotModel = require('../index');

const PDF_SOURCE = 'https://www.irs.gov/pub/irs-pdf/fw9.pdf';
const PAGES = [1, 2];

const SNAPSHOT = {
  version: 2,
  pages: [],
  resources: {},
  originalPdf: null,
};

const COMMANDS = [];

const resolveMock = { fabric: { createSnapshotAggregator: sinon.stub() } };

describe('SnapshotModel', () => {
  it('have a method getDefaultTemplate', () => {
    const snapshotModel = new SnapshotModel(resolveMock);

    expect(snapshotModel.getDefaultTemplate).to.be.an('function');
  });

  it('have a method getSnapshotFromURL', () => {
    const snapshotModel = new SnapshotModel(resolveMock);

    expect(snapshotModel.getSnapshotFromURL).to.be.an('function');
  });

  it('have a method mergeSnapShotAndCommands', () => {
    const snapshotModel = new SnapshotModel(resolveMock);

    expect(snapshotModel.mergeSnapShotAndCommands).to.be.an('function');
  });

  describe('getDefaultTemplate', () => {
    it('check with const', () => {
      const snapshotModel = new SnapshotModel(resolveMock);
      const snapshot = snapshotModel.getDefaultTemplate();

      expect(snapshot).to.be.an('object');
      expect(snapshot.pages).to.be.an('array');
      expect(snapshot.pages.length).to.equal(0);
    });
  });

  describe('getSnapshotFromURL', () => {
    it('parse 2 pages from fw9.pdf', (done) => {
      const snapshotModel = new SnapshotModel(resolveMock);
      const snapshot = snapshotModel.getDefaultTemplate();

      snapshotModel.getSnapshotFromURL(PDF_SOURCE, snapshot, PAGES, (err) => {
        expect(err).to.be.an('null');
        expect(snapshot.pages).to.be.an('array');
        expect(snapshot.pages.length).to.equal(2);
        expect(snapshot.pages[0].items).to.be.an('array');
        expect(snapshot.pages[0].items.length).to.equal(218);
        done();
      });
    });
  });

  describe('mergeSnapShotAndCommands', () => {
    it('check with const', () => {
      const fabricMock = {
        createSnapshotAggregator: () => ({
          aggregate: (snapshot, commands) => {
            expect(snapshot).to.be.an('object');
            expect(commands).to.be.an('array');
            return { pages: [] };
          },
        }),
      };

      const snapshotModel = new SnapshotModel({ fabric: fabricMock });
      const snapshot = snapshotModel.mergeSnapShotAndCommands(SNAPSHOT, COMMANDS);

      expect(snapshot).to.be.an('object');
      expect(snapshot.pages).to.be.an('array');
      expect(snapshot.pages.length).to.equal(0);
    });
  });
});
