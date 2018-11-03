// const Promise = require('bluebird');

class BuildService {

  async build(builder, type, { content, template, dictionary, ownerId }) {
    try {
      if (type === 'dictionary') {
        return builder.buildDictionary(content, template, { ownerId });
      }

      if (type === 'content') {
        return builder.buildContent(content, template, dictionary, { ownerId });
      }
    } catch (e) {
      throw e;
    }
  }

}

module.exports = BuildService;
