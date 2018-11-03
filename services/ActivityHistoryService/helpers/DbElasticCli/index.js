const Elasticsearch = require('elasticsearch');
const { clone } = require('lodash');

const DbElasticConstructor = ({ elasticsearch }) => new Elasticsearch.Client(clone(elasticsearch));

module.exports = DbElasticConstructor;
