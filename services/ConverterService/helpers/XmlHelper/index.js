const ltx = require('ltx');

const IMAGE_ID_TYPES = ['image', 'image_sig'];

class XmlHelper {

  clean(xml) {
    return typeof xml === 'string' ? xml.trim()
      .replace(/\n/g, '')
      .replace(/\t/g, '')
      .replace(/\u0000/g, '')
      .replace(/> {2,}</g, '><') : xml;
  }

  segmentationTags(xml, tags) {
    return new Promise((resolve, reject) => {
      const parser = new ltx.Parser();
      const segmentationContent = ltx.createElement('content');
      const imageIdList = [];

      parser.on('tree', (content) => {
        const pages = content.getChildren('page');

        pages.forEach((page) => {
          const searchPage = ltx.createElement('page');

          searchPage.attrs.id = page.attrs.id;
          segmentationContent.children.push(searchPage);
          const objects = page.getChildren('obj');

          objects.forEach((obj) => {
            const objectType = obj.getChild('type').text();

            if (tags.includes(objectType)) {
              searchPage.children.push(obj);
              page.remove(obj);
              if (IMAGE_ID_TYPES.includes(objectType)) {
                imageIdList.push(obj.getChild('image_id').text().replace('s', ''));
              }
            }
          });
        });

        resolve({
          content: content.toString(),
          unavailable: segmentationContent.toString(),
          imageIdList,
        });
      });
      parser.on('error', (err) => {
        reject(err);
      });

      xml = this.clean(xml);
      parser.write(xml);
      parser.end();
    });
  }

  processContent(xml, { segmentationTags, findImages }) {
    return new Promise((resolve, reject) => {
      const parser = new ltx.Parser();
      const imageIdList = [];

      let segmentationContent;

      if (segmentationTags) {
        segmentationContent = ltx.createElement('content');
      }

      parser.on('tree', (content) => {
        const pages = content.getChildren('page');

        pages.forEach((page) => {
          let searchPage;
          const objects = page.getChildren('obj');

          if (segmentationTags) {
            searchPage = ltx.createElement('page');
            searchPage.attrs.id = page.attrs.id;
            segmentationContent.children.push(searchPage);
          }

          objects.forEach((obj) => {
            const objectType = obj.getChild('type').text();

            if (!!segmentationTags && segmentationTags.includes(objectType)) {
              searchPage.children.push(obj);
              page.remove(obj);
            }

            if (!!findImages && IMAGE_ID_TYPES.includes(objectType)) {
              imageIdList.push(obj.getChild('image_id').text().replace('s', ''));
            }
          });
        });

        resolve({
          content: content.toString(),
          unavailable: segmentationContent ? segmentationContent.toString() : null,
          imageIdList,
        });
      });
      parser.on('error', (err) => {
        reject(err);
      });

      xml = this.clean(xml);
      parser.write(xml);
      parser.end();
    });
  }
}

module.exports = XmlHelper;
