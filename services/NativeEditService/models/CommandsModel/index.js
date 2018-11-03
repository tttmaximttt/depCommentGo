const _ = require('lodash');

const COMMAND_OPERATION_PATH = 'properties.content';
const PAGE_COMMAND_OPERATION_PATH = 'params.page';
const PAGE_COMMAND_OPERATION_PATH_V2 = 'pageId';
const CQRS_VERSION_PATH = 'cqrsVersion';

class CommandsModel {

  /**
   * @param operations
   * @returns {Array}
   */
  getFromOperations(operations) {
    return operations.map(operation => _.get(operation, COMMAND_OPERATION_PATH, null));
  }

  /**
   * @param command - single command
   *
   * @returns {integer} page id
   *
   * @todo when new TE will deployed to "baseLine",
   * need change page ingormation extraction by pageId, page ID must be implemented within
   * TE rearrange functionality
   */
  _pageIdFromCommand(command) {
    let page = false;
    const cqrsVersion = _.get(command, CQRS_VERSION_PATH, 0);

    switch (cqrsVersion) {
      case 2:
        page = _.get(command, PAGE_COMMAND_OPERATION_PATH_V2, false);
        if (page !== false) {
          page++;
        }
        break;
      default:
        page = _.get(command, PAGE_COMMAND_OPERATION_PATH, false);
    }

    return page;
  }

  /**
   * @param commands
   * @returns {Array}
   */
  getPagesInList(commands) {
    return _.values(commands.reduce((pages, command) => {
      const pageId = this._pageIdFromCommand(command);

      if (pageId) pages[pageId] = pageId;
      return pages;
    }, {}));
  }
}

module.exports = CommandsModel;
