const MODEL = 'doubao-seedream-5-5-261028';
const MODES = ['text', 'edit', 'split'];
const LOW_PIXEL_LIMIT = 2610000;

// RMB per image, stored in thousandths of a yuan so pricing stays exact.
const RATES = {
  discount: { input: 35, low: 91, high: 161 },
  original: { input: 50, low: 130, high: 230 },
};

export function defaultSeedreamForm(mode = 'text') {
  return {
    mode, prompt: '', size: '1.5K', width: '', height: '',
    background: 'auto', format: 'png', maxImages: 5, ocr: false,
  };
}

function positiveInteger(value) {
  if (typeof value === 'string' && !/^\d+$/.test(value)) return false;
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function validRatio(width, height) {
  return width <= height * 16 && height <= width * 16;
}

function sizeError(form) {
  if (form.size === 'custom' && form.mode !== 'split') {
    if (!positiveInteger(form.width) || !positiveInteger(form.height)) {
      return '请用正整数填写宽度和高度，单位为像素。';
    }
    const width = Number(form.width);
    const height = Number(form.height);
    const pixels = width * height;
    if (pixels < 921600 || pixels > 4624220) {
      return '宽度乘以高度须在 921,600 至 4,624,220 像素之间。';
    }
    return validRatio(width, height) ? '' : '请把宽高比调整到 1∶16 至 16∶1 之间。';
  }
  if (['1K', '1.5K', '2K'].includes(form.size)) return '';
  if (form.mode === 'split' && form.size === 'auto') return '';
  return '请为当前任务选择可用的输出尺寸。';
}

function countError(mode, inputCount) {
  if (!Number.isInteger(inputCount) || inputCount < 0) return '图片数量无效，请重新选择图片。';
  if (mode === 'text' && inputCount !== 0) return '文字画图只需要描述，使用参考图时请选择参考图改图。';
  if (mode === 'edit' && (inputCount < 1 || inputCount > 10)) return '请添加 1 至 10 张参考图。';
  if (mode === 'split' && inputCount !== 1) return '请添加一张要拆分的原图。';
  return '';
}

function validMaxImages(value) {
  return positiveInteger(value) && Number(value) >= 2 && Number(value) <= 100;
}

export function validateSeedream(form, inputCount) {
  if (!form || !MODES.includes(form.mode)) return '请选择创作方式。';
  const imageError = countError(form.mode, inputCount);
  if (imageError) return imageError;
  if (typeof form.prompt !== 'string' || (form.mode !== 'split' && !form.prompt.trim())) {
    return '请写下你想画什么，或希望怎样修改图片。';
  }
  const error = sizeError(form);
  if (error) return error;
  if (!['png', 'jpeg'].includes(form.format)) return '请选择 PNG 或 JPEG 格式。';
  if (form.mode === 'split') {
    if (!validMaxImages(form.maxImages)) return '请填写 2 至 100 之间的整数，底图也算一张。';
    if (typeof form.ocr !== 'boolean') return '请选择是否识别图中文字。';
  } else {
    if (!['auto', 'opaque', 'transparent'].includes(form.background)) return '请选择背景类型。';
    if (form.background === 'transparent' && form.format !== 'png') return '透明背景需要选择 PNG 格式。';
  }
  return '';
}

export function validateSeedreamImage(mode, image) {
  if (!['edit', 'split'].includes(mode)) return '当前模式无需上传图片。';
  if (!image || !['image/jpeg', 'image/png'].includes(image.type)) return '此表单支持 JPG 和 PNG 图片。';
  if (!Number.isSafeInteger(image.size) || image.size <= 0) return '文件为空或无法读取，请重新选择图片。';
  if (image.size > 30 * 1024 * 1024) return '每张图片最多 30 MB，请压缩后重新选择。';
  const { width, height } = image;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return '无法读取图片尺寸，请重新导出为 JPG 或 PNG。';
  }
  if (!validRatio(width, height)) return '图片的宽高比须在 1∶16 至 16∶1 之间。';
  if (width * height > 36000000) return '图片总像素超过 3600 万，请缩小后再添加。';
  if (mode === 'split' && width * height < 262144) return '用于拆图的原图至少需要 262,144 像素，例如 512 × 512。';
  if (mode === 'edit' && (width < 15 || height < 15)) return '参考图的宽和高都须至少为 15 像素。';
  return '';
}

export function buildSeedreamRequest(form, images = []) {
  if (!Array.isArray(images) || images.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error('请为每张图片提供图片地址。');
  }
  const error = validateSeedream(form, images.length);
  if (error) throw new Error(error);
  const request = {
    model: MODEL,
    size: form.size === 'custom' ? Number(form.width) + 'x' + Number(form.height) : form.size,
    output_format: form.format,
    response_format: 'url',
  };
  if (form.prompt.trim()) request.prompt = form.prompt.trim();
  if (images.length) request.image = images.length === 1 ? images[0] : [...images];
  if (form.mode === 'split') {
    request.layer_decomposition = true;
    request.layer_decomposition_options = {
      max_images: Number(form.maxImages),
      text_recognition: form.ocr,
    };
  } else {
    request.background = form.background;
  }
  return request;
}

// A quote without actualOutputs uses the requested cap. All layers share the
// request's price tier. A request with zero successful outputs costs zero.
export function seedreamQuote(form, inputCount, priceGroup = 'discount', actualOutputs) {
  if (!form || !MODES.includes(form.mode) || countError(form.mode, inputCount) || sizeError(form)) return null;
  const group = priceGroup === 'default' ? 'discount' : priceGroup;
  if (group !== 'discount' && group !== 'original') return null;
  if (form.mode === 'split' && !validMaxImages(form.maxImages)) return null;
  const outputCap = form.mode === 'split' ? Number(form.maxImages) : 1;
  const outputCount = actualOutputs === undefined ? outputCap : actualOutputs;
  if (!Number.isInteger(outputCount) || outputCount < 0 || outputCount > outputCap) return null;
  const lowTier = form.size === 'custom'
    ? Number(form.width) * Number(form.height) <= LOW_PIXEL_LIMIT
    : form.size === '1K' || form.size === '1.5K';
  const tier = lowTier ? 'low' : 'high';
  const rate = RATES[group];
  const inputMilli = outputCount === 0 ? 0 : inputCount * rate.input;
  const outputMilli = outputCount * rate[tier];
  return {
    inputMilli, outputMilli, totalMilli: inputMilli + outputMilli,
    unitInputMilli: rate.input, unitOutputMilli: rate[tier], outputCount, tier,
  };
}
