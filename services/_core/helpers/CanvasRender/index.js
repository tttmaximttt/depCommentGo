const fs = require('fs');
const request = require('request');
const { createCanvas, registerFont, Image } = require('canvas');

registerFont('./services/_core/helpers/CanvasRender/fonts/Jellyka CuttyCupcakes.ttf',
  { family: 'Jellyka CuttyCupcakes' });
registerFont('./services/_core/helpers/CanvasRender/fonts/signature.ttf',
  { family: 'signature' });

function createContext2D(w, h) {
  const CONTEXT_TYPE = '2d';
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext(CONTEXT_TYPE);

  return { canvas, ctx };
}

function renderText(ctx, text, x, y) {
  ctx.font = `${text.fontSize}px "${text.fontFamily}"`;
  ctx.fillStyle = `#${text.color}`;
  try {
    ctx.fillText(text.text, x, y);
  } catch (err) {
    console.log('CanvasRender.ctx.fillText:UNCAUGHT_EXCEPTION', err);
  }
}

function defineTextSize(text) {
  const { ctx } = createContext2D(text.width * 2, text.fontSize * 4);
  let size = null;

  try {
    renderText(ctx, text, 0, text.fontSize * 3);
    size = ctx.measureText(text.text);
  } catch (err) {
    console.log('CanvasRender.defineTextSize:UNCAUGHT_EXCEPTION', err);
  }

  return size;
}

function fabricCreateText(text, defineSize) {
  const size = defineTextSize(text);
  const context = createContext2D(size.width + 2, size.emHeightAscent + size.emHeightDescent);

  defineSize({
    width: size.width,
    height: size.emHeightAscent,
  });

  renderText(context.ctx, text, 0, size.emHeightAscent);
  return context.canvas;
}

function renderImage(ctx, image, x, y, w, h) {
  ctx.drawImage(image, x, y, w, h);
}

function loadImageFromUrlToFile(url, filename) {
  const ENCODING = 'binary';

  return new Promise((resolve, reject) => {
    request({ url, encoding: ENCODING }, (err, res, reply) => {
      if (err) return reject(err);
      fs.writeFileSync(filename, new Buffer(reply, ENCODING));
      resolve(reply);
    });
  });
}

function loadImageFromFileToMemory(filename) {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, (err, reply) => {
      if (err) return reject(err);
      const imageData = new Image();

      imageData.src = reply;
      resolve(imageData);
    });
  });
}

async function loadImageFromUrlToMemory(url) {
  const TEMP_FILE_NAME = './__temp_image.png';

  await loadImageFromUrlToFile(url, TEMP_FILE_NAME);
  const imageData = await loadImageFromFileToMemory(TEMP_FILE_NAME);

  fs.unlinkSync(TEMP_FILE_NAME);
  return imageData;
}

async function fabricCreateImage(image) {
  const imageData = await loadImageFromUrlToMemory(image.url);
  const context = createContext2D(imageData.width, imageData.height);

  renderImage(context.ctx, imageData, 0, 0, imageData.width, imageData.height);
  return context.canvas;
}

const renderCurve = (ctx, points, scale, offset) => {
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length - 1; i += 2) {
    ctx.lineTo((points[i] - offset.offsetX) * scale, (points[i + 1] - offset.offsetY) * scale);
  }
};

const renderCurveSmoothing = (ctx, points, scale) => {
  let i;

  ctx.moveTo(points[0], points[1]);

  for (i = 2; i < points.length - 2; i += 2) {
    const xc = (points[i] + points[i + 2]) / 2;
    const yc = (points[i + 1] + points[i + 3]) / 2;

    ctx.quadraticCurveTo(points[i] * scale, points[i + 1] * scale, xc * scale, yc * scale);
  }

  ctx.quadraticCurveTo(points[i - 2] * scale, points[i - 1] * scale,
    points[i] * scale, points[i + 1] * scale);
};

function renderCurveWithStyle(ctx, curve, scale, offset) {
  ctx.strokeStyle = `#${curve.color}`;
  ctx.beginPath();
  if (curve.smoothing) {
    renderCurveSmoothing(ctx, curve.controlPoints, scale, offset);
  } else {
    renderCurve(ctx, curve.controlPoints, scale, offset);
  }

  ctx.stroke();
}

function getSizeCurve({ controlPoints }) {
  const size = {
    minX: controlPoints[0],
    minY: controlPoints[1],
    maxX: controlPoints[0],
    maxY: controlPoints[1],
  };

  for (let i = 0, len = controlPoints.length; i < len; i += 2) {
    if (controlPoints[i] < size.minX) { size.minX = controlPoints[i]; }
    if (controlPoints[i] > size.maxX) { size.maxX = controlPoints[i]; }
    if (controlPoints[i + 1] < size.minY) { size.minY = controlPoints[i + 1]; }
    if (controlPoints[i + 1] > size.maxY) { size.maxY = controlPoints[i + 1]; }
  }

  return size;
}

function getSizeCurves(curves) {
  const sizes = curves.map(curve => getSizeCurve(curve));
  const size = {
    minX: sizes[0].minX,
    minY: sizes[0].minY,
    maxX: sizes[0].maxX,
    maxY: sizes[0].maxY,
  };

  sizes.forEach((s) => {
    if (s.minX < size.minX) { size.minX = s.minX; }
    if (s.minY < size.minY) { size.minY = s.minY; }
    if (s.maxX > size.maxX) { size.maxX = s.maxX; }
    if (s.maxY > size.maxY) { size.maxY = s.maxY; }
  });

  return {
    width: size.maxX - size.minX,
    height: size.maxY - size.minY,
    offsetX: size.minX,
    offsetY: size.minY,
  };
}

function fabricCreateCurves(curve) {
  const size = getSizeCurves(curve.curves);
  const scale = size.width / curve.width;
  const context = createContext2D(size.width * scale, size.height * scale);
  const offset = {
    offsetX: size.offsetX,
    offsetY: size.offsetY,
  };

  curve.curves.forEach(item => renderCurveWithStyle(context.ctx, item, scale, offset));

  return context.canvas;
}

module.exports = () => ({
  fabricCreateText,
  fabricCreateImage,
  fabricCreateCurves,
});
