const { expect } = require('chai');
const CommandsModel = require('../index');

describe('CommandsModel', () => {
  it('have a method getFromOperations', () => {
    const commandsModel = new CommandsModel();

    expect(commandsModel.getFromOperations).to.be.an('function');
  });

  it('have a method getPagesInList', () => {
    const commandsModel = new CommandsModel();

    expect(commandsModel.getPagesInList).to.be.an('function');
  });

  describe('getFromOperations', () => {
    it('empty operations', () => {
      const commandsModel = new CommandsModel();
      const commands = commandsModel.getFromOperations([]);

      expect(commands).to.be.an('array');
      expect(commands.length).to.equal(0);
    });
  });

  describe('getPagesInList', () => {
    it('empty commands', () => {
      const commandsModel = new CommandsModel();
      const pages = commandsModel.getPagesInList([]);

      expect(pages).to.be.an('array');
      expect(pages.length).to.equal(0);
    });
  });
});
