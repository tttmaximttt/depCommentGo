class MainController {

    /**
     * @param {MainService} mainService
     */
  constructor({ mainService }) {
    this.mainService = mainService;
  }

  /**
   * @param req
   * @param res
   */
  async generate(req, res) {
    try {
      const pdfSource = req.body.pdfSource;
      const operations = req.body.operations;
      const callbackUrl = req.body.callbackUrl;
      const projectId = req.body.projectId;

      const reply = await this.mainService.generatePDFByOperations(operations, pdfSource, callbackUrl, projectId);

      res.end(JSON.stringify(reply));
    } catch (err) {
      res.status(400);
      res.send('Internal server error.');
    }
  }
}

module.exports = MainController;
