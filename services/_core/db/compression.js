const snappy = require('snappy');

const COMPRESS_PREFIX = 'SNAPPY_COMPRESSED:';
const ENCODING = 'binary';
const ENCODING_STRING = 'utf8';
const MAX_UNCOMPRESSED_KEY_SIZE = 1024 * 8; // 8 KB

const compress = (value, cb) => {
  if (value.length >= MAX_UNCOMPRESSED_KEY_SIZE) {
    return snappy.compress(value, (err, buff) => {
      if (err) return cb(err);
      const compressedValue = COMPRESS_PREFIX + buff.toString(ENCODING);

      cb(null, compressedValue);
    });
  }

  return cb(null, value);
};

const uncompress = (value, cb) => {
  if (!value || !value.startsWith(COMPRESS_PREFIX)) return cb(null, value);
  const buffer = Buffer.from(value.substr(COMPRESS_PREFIX.length), ENCODING);

  snappy.uncompress(buffer, (err, buff) => {
    if (err) return cb(err);

    cb(null, buff.toString(ENCODING_STRING));
  });
};

module.exports = { compress, uncompress };
