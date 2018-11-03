const { Aggregator } = require('cqrs-agregator');
const TrueediIndexBuilder = require('cqrs-agregator/lib/TrueediIndexBuilder').default;
const TrueeditAggregateRule = require('cqrs-agregator/lib/TrueeditAggregateRule').default;
const cqrsCommandOptimizer = require('cqrs-agregator/lib/CommandOptimizer').default;

class Fabric {

  createSnapshotAggregator() {
    const trueEditIndex = new TrueediIndexBuilder();
    const aggregator = new Aggregator(trueEditIndex);

    aggregator.addRule(new TrueeditAggregateRule());
    return aggregator;
  }

  createCommandOptimizer() {
    return cqrsCommandOptimizer;
  }

}

module.exports = Fabric;
