const _ = require('lodash');

module.exports = ({ clientStatuses }) => ({

  trackPoints(operations = []) {
    operations = _.filter(
      operations,
      _.matches({ properties: { type: 'track', subType: 'point' } })
    );
    return operations.length ? operations : null;
  },

  notDocumentAccess(operations = []) {
    operations = _.filter(operations, o => (
      o.properties && !(o.properties.type === 'access' && o.properties.group === 'document')
    ));
    return operations.length ? operations : null;
  },

  accessIssueMessage(data) {
    const { location, error } = data;

    return {
      group: 'document',
      type: 'access',
      subType: 'issue',
      location,
      message: 'We encountered a technical issue, please wait...',
      error,
    };
  },

  filterByStatus(connection, message) {
    const { DESTROY, AUTHORIZE, OPERATIONS } = clientStatuses;
    const filterMessage = data => _.omitBy(Object.assign({}, message, data), _.isNil);

    if (connection.authorized) {
      return filterMessage({
        auth: null, operations: this.notDocumentAccess(message.operations),
      });
    }

    if (!connection.status) {
      return filterMessage({
        destroy: null,
        params: null,
        operations: this.trackPoints(message.operations),
      });
    }

    if (connection.status === DESTROY) {
      return filterMessage({
        auth: null,
        destroy: null,
        params: null,
        operations: this.trackPoints(message.operations),
      });
    }

    if (connection.status === AUTHORIZE && connection.authPending) {
      return filterMessage({
        auth: null, operations: this.notDocumentAccess(message.operations),
      });
    }

    if (connection.status === OPERATIONS) {
      return filterMessage({
        operations: connection.authPending ?
          this.notDocumentAccess(message.operations) : message.operations,
      });
    }

    return message;
  },
});
