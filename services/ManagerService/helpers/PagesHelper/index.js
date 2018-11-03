const _ = require('lodash');
const fp = require('lodash/fp');

const REQUIRED_FIELDS = [
  'blankOf',
  'duplicateOf',
  'rotation',
  'source',
  'visible',
];

const OPTIONAL_FIELDS = [
  'hasFillableFields',
];

class PagesHelper {

  validatePagesOperation({ properties }) {
    const { pages } = properties;
    const sourcesMap = pages.reduce(
      (map, page) => _.set(map, page.source, map[page.source] > 0 ? map[page.source] + 1 : 1),
      {}
    );

    return Object.keys(sourcesMap).some(key => sourcesMap[key] > 1);
  }

  getNewPagesCount(pages) {
    return pages
      .filter(({ blankOf, duplicateOf }) => blankOf > -1 || duplicateOf > -1).length;
  }

  updatePagesIndexes(oldPages) {
    let addedPageIndex = oldPages.length - 1;

    return oldPages.reduceRight((pages, page) => {
      const { blankOf, duplicateOf } = page;

      if (blankOf > -1 || duplicateOf > -1) {
        pages.unshift(Object.assign({}, page, {
          blankOf: -1,
          duplicateOf: -1,
          source: addedPageIndex,
        }));
        addedPageIndex -= 1;
      } else {
        pages.unshift(page);
      }

      return pages;
    }, []);
  }

  normalize(pages) {
    const sources = [];

    return pages.filter((page) => {
      const sameFields = _.intersection(REQUIRED_FIELDS, Object.keys(page))
        .length === REQUIRED_FIELDS.length;
      const existingSource = sources.includes(page.source);

      if (!sameFields || existingSource) return false;

      sources.push(page.source);

      return true;
    });
  }

  reset(pages) {
    return this.normalize(pages).map(
      fp.flow(
        fp.set('blankOf', -1),
        fp.set('duplicateOf', -1),
        fp.pick([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS])
      )
    );
  }

}

module.exports = PagesHelper;
