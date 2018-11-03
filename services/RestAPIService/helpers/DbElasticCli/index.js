const Elasticsearch = require('elasticsearch');
const { clone } = require('lodash');

const DbElasticConstructor = ({ elasticsearch }) =>
  new Elasticsearch.Client(clone(elasticsearch));

// const DbElasticConstructor = () => new Elasticsearch.Client({
//   host: 'localhost:9000',
// });

module.exports = DbElasticConstructor;

