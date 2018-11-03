/* eslint-disable import/no-extraneous-dependencies */
const _ = require('lodash');
const bl = require('bl');
const https = require('https');
const http = require('http');
const pdfjsLib = require('pdf.js-jsf/build/dist');

require('pdf.js-jsf/nodejs/domstubs.js');

const SNAPSHOT_TEMPLATE_VERSION = 3;

class SnapshotModel {

  /**
   * @param {Fabric} fabric
   */
  constructor({ fabric }) {
    this.snapshotAggregator = fabric.createSnapshotAggregator();
    this.commandOptimizer = fabric.createCommandOptimizer();
  }

  /**
   * @returns {{version: number, pages: Array, resources: {}, originalPdf: null}}
   */
  getDefaultTemplate() {
    return {
      version: SNAPSHOT_TEMPLATE_VERSION,
      pages: [],
      resources: {},
      originalPdf: null,
    };
  }

  /**
   * @param url
   * @param snapshot
   * @param pages
   * @param callback
   */
  getSnapshotFromURL(url, snapshot, pages, callback) {
    https.get(url, (response) => {
      response.pipe(bl((err, reply) => {
        const data = new Uint8Array(reply);

        let lastPromise = Promise.resolve();

        pdfjsLib.getDocument({
          data,
        }).then((doc) => {
          const loadPage = pageNum => doc.getPage(pageNum).then((page) => {
            const viewport = page.getViewport(1.0);

            return page.getEditableItems({ viewport }).then((values) => {
              snapshot.pages.push({
                position: pageNum,
                items: _.get(values, 'items[0].ch', []),
              });
            });
          });

          for (let i = 0; i < pages.length; i++) {
            lastPromise = lastPromise.then(loadPage.bind(null, pages[i]));
          }

          return lastPromise;
        }).then(() => {
          callback(null);
        }, (error) => {
          callback(error);
        });
      }));
    });
  }

  getPagesSize(url, callback) {
    const pagesSize = [];
    const protocol = url.includes('https') ? https : http;

    protocol.get(url, (response) => {
      response.pipe(bl((err, reply) => {
        const data = new Uint8Array(reply);

        let lastPromise = Promise.resolve();

        pdfjsLib.getDocument({ data }).then((doc) => {
          const loadPage = pageNum => doc.getPage(pageNum).then((page) => {
            const viewport = page.getViewport(1.0);

            return pagesSize.push(viewport);
          });

          for (let i = 0; i < doc.numPages; i++) {
            lastPromise = lastPromise.then(loadPage.bind(null, i + 1));
          }

          return lastPromise;
        }).then(() => {
          callback(null, pagesSize);
        }, (error) => {
          callback(error);
        });
      }));
    }).on('error', (e) => {
      callback(e);
    });
  }

  /**
   * @param snapshot
   * @param commands
   * @returns {Object}
   */
  mergeSnapShotAndCommands(snapshot, commands) {
    return this.snapshotAggregator.aggregate(snapshot, commands);
  }

  /**
   * @param commands array that contains all commands to optimize before merge with main AST of PDF
   *
   * @returns {array} commands that were optimized (removed extra commands)
   */
  optimizeCommands(commands = []) {
    return this.commandOptimizer.optimize(commands);
  }

}

module.exports = SnapshotModel;
