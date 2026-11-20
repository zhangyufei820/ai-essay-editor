import React, { useEffect, useRef, useState } from 'react';
import {
  buildSeedreamRequest,
  defaultSeedreamForm,
  seedreamQuote,
  validateSeedream,
  validateSeedreamImage,
} from './seedream.js';
import './SeedreamPanel.css';

const MODES = {
  text: {
    label: '文字生图',
    hint: '描述画面，生成一张新图。',
    promptLabel: '你想画什么？',
    promptHint: '写出主体、场景和风格。如果需要配字，用引号标出准确文字。',
    example: '一只橘猫坐在蓝色窗台上，午后阳光照在脸上，柔和的水彩插画风格。',
  },
  edit: {
    label: '参考图改图',
    hint: '用照片改图，也可以组合多张参考图。',
    promptLabel: '要改哪里，保留什么？',
    promptHint: '图片按选择顺序编号。可以写“保留第 1 张的产品外观，参考第 2 张的配色”。继续改图时，将上次的结果选作参考图。',
    example: '保留第 1 张照片中的杯子和标志，把桌面换成浅色木纹，背景改为浅灰色。',
  },
  split: {
    label: '图层拆分',
    hint: '把一张设计稿拆成底图和独立图层。',
    promptLabel: '想单独取出哪些元素？（选填）',
    promptHint: '留空时自动拆分；也可以指定人物、文字或图案。',
    example: '把海报的主标题、产品和背景分别拆开，保留各元素在原图中的位置。',
  },
};

const MB = 1024 * 1024;

function limitsFor(mode, policy = {}) {
  const configured = (value, fallback) =>
    Number.isFinite(value) && value > 0 ? value : fallback;
  return {
    perFile: Math.min(30 * MB, configured(policy?.max_image_bytes, 30 * MB), configured(policy?.max_file_bytes, 30 * MB)),
    total: Math.min(configured(policy?.max_total_bytes, 60 * MB), configured(policy?.global_total_bytes, 60 * MB)),
    count: mode === 'split' ? 1 : Math.min(10, configured(policy?.max_images, 10)),
  };
}

function mb(bytes) {
  return Number((bytes / MB).toFixed(2));
}

function money(milli) {
  return '¥' + (milli / 1000).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
    useGrouping: false,
  });
}

async function inspectFile(file, mode) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('图片无法读取，请重新导出为 JPG 或 PNG。'));
      image.src = url;
    });
    const info = { name: file.name, type: file.type, size: file.size, width: image.naturalWidth, height: image.naturalHeight };
    const error = validateSeedreamImage(mode, info);
    if (error) throw new Error(error);
    return info;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SeedreamPanel({ uploadPolicy } = {}) {
  const [mode, setMode] = useState('text');
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(Object.keys(MODES).map((key) => [key, defaultSeedreamForm(key)])),
  );
  const [sources, setSources] = useState({ edit: [], split: [] });
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [priceGroup, setPriceGroup] = useState('discount');
  const [copyStatus, setCopyStatus] = useState('');
  const operation = useRef(0);
  useEffect(() => () => { operation.current += 1; }, []);

  const form = drafts[mode];
  const content = MODES[mode];
  const isSplit = mode === 'split';
  const files = sources[mode] || [];
  const limits = limitsFor(mode, uploadPolicy);
  const fileCount = files.length;
  // A split always takes one original, so its ceiling is knowable before file selection.
  const quoteInputCount = isSplit ? 1 : fileCount;
  const quote = seedreamQuote(form, quoteInputCount, priceGroup);
  const sampleCount = quote && isSplit ? Math.min(3, quote.outputCount) : 0;
  const sample = sampleCount ? seedreamQuote(form, 1, priceGroup, sampleCount) : null;
  const invalid = validateSeedream(form, fileCount);
  const request = invalid ? '' : JSON.stringify(buildSeedreamRequest(form,
    files.map((file, index) => 'https://example.invalid/image-' + (index + 1) + (file.type === 'image/png' ? '.png' : '.jpg')),
  ), null, 2);

  function update(values) {
    setDrafts((previous) => ({ ...previous, [mode]: { ...previous[mode], ...values } }));
    setCopyStatus('');
  }

  function changeMode(next) {
    operation.current += 1;
    setReading(false);
    setFileError('');
    setCopyStatus('');
    setMode(next);
  }

  async function selectFiles(event) {
    const picked = Array.from(event.target.files || []);
    event.target.value = '';
    if (!picked.length) return;
    const ticket = ++operation.current;
    setReading(true);
    setCopyStatus('');
    setFileError('');
    try {
      const base = isSplit ? [] : files;
      if (base.length + picked.length > limits.count) throw new Error('本次最多选择 ' + limits.count + ' 张图片，请减少张数。');
      if (picked.some((file) => !['image/jpeg', 'image/png'].includes(file.type))) throw new Error('请选择 JPG 或 PNG 图片。');
      if (picked.some((file) => file.size > limits.perFile)) throw new Error('单张图片超过 ' + mb(limits.perFile) + ' MB，请缩小图片后重选。');
      if ([...base, ...picked].reduce((sum, file) => sum + file.size, 0) > limits.total) throw new Error('图片合计超过 ' + mb(limits.total) + ' MB，请减少张数或缩小图片。');
      const checked = [];
      for (const file of picked) {
        if (ticket !== operation.current) return;
        try {
          checked.push(await inspectFile(file, mode));
        } catch (error) {
          throw new Error(file.name + '：' + error.message);
        }
      }
      if (ticket === operation.current) setSources((previous) => ({ ...previous, [mode]: [...base, ...checked] }));
    } catch (error) {
      if (ticket === operation.current) setFileError(error.message);
    } finally {
      if (ticket === operation.current) setReading(false);
    }
  }

  function removeFile(index) {
    setSources((previous) => ({ ...previous, [mode]: previous[mode].filter((_, i) => i !== index) }));
    setFileError('');
    setCopyStatus('');
  }

  async function copyRequest() {
    try {
      await navigator.clipboard.writeText(request);
      setCopyStatus('请求模板已复制。');
    } catch {
      setCopyStatus('请选中下方模板文字，使用系统复制功能。');
    }
  }

  return (
    <section className='mp-seedream' aria-label='豆包 Seedream 5.5 创作设置'>
      <header className='sd-header'>
        <h2>豆包 Seedream 5.5</h2>
        <p>先准备图片和要求，查看费用估算。当前为配置预览，文件仅在本机读取，预览免费。</p>
      </header>
      <div className='sd-layout'>
        <div className='sd-main'>
          <fieldset className='sd-card'>
            <legend>你想做什么？</legend>
            <div className='sd-modes'>
              {Object.entries(MODES).map(([key, item]) => (
                <label className={'sd-mode' + (mode === key ? ' is-selected' : '')} key={key}>
                  <input type='radio' name='seedream-mode' value={key} checked={mode === key} onChange={() => changeMode(key)} />
                  <span><strong>{item.label}</strong><small>{item.hint}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          {mode !== 'text' && (
            <section className='sd-card'>
              <h3>{isSplit ? '原始设计稿' : '参考图片'}</h3>
              <p id='sd-file-hint'>{isSplit ? '选择 1 张要拆分的海报或设计稿，至少 262,144 像素。' : '选择 1 至 ' + limits.count + ' 张参考图，每张宽和高都须大于 14 像素。'} 支持 JPG、PNG，单张最多 {mb(limits.perFile)} MB、合计最多 {mb(limits.total)} MB；单张最多 3600 万像素，宽高比在 1:16 到 16:1 之间。</p>
              <label className='sd-file'>选择{isSplit ? '原图' : '参考图'}
                <input type='file' accept='image/jpeg,image/png' multiple={!isSplit} disabled={reading} aria-describedby='sd-file-hint' onChange={selectFiles} />
              </label>
              {reading && <p role='status'>正在本机检查图片尺寸…</p>}
              {fileError && <p className='sd-error' role='alert'>{fileError}</p>}
              {!!fileCount && <ol className='sd-files'>{files.map((file, i) => (
                <li key={i}><span>{i + 1}. {file.name}<small>{file.width} × {file.height} 像素 · {mb(file.size)} MB</small></span><button type='button' className='sd-link' disabled={reading} aria-label={'移除第 ' + (i + 1) + ' 张图片'} onClick={() => removeFile(i)}>移除</button></li>
              ))}</ol>}
            </section>
          )}
          <div className='sd-card'>
            <div className='sd-title'><label htmlFor='sd-prompt'>{content.promptLabel}</label>
              <button type='button' className='sd-link' disabled={!!form.prompt.trim()} onClick={() => update({ prompt: content.example })}>填入示例</button></div>
            <p id='sd-prompt-help'>{content.promptHint}</p>
            <textarea id='sd-prompt' rows='4' value={form.prompt} required={!isSplit} aria-describedby='sd-prompt-help' placeholder={content.example} onChange={(e) => update({ prompt: e.target.value })} />
          </div>
          <section className='sd-card'>
            <h3>成图设置</h3>
            <div className='sd-grid'>
              <label className='sd-field'>输出尺寸
                <select value={form.size} onChange={(e) => update({ size: e.target.value })}>
                  <option value='1K'>1K · 基础</option><option value='1.5K'>1.5K · 推荐</option><option value='2K'>2K · 高清</option>
                  {isSplit ? <option value='auto'>自动适配原图</option> : <option value='custom'>自定义宽高</option>}
                </select>
                <small>1K 和 1.5K 同价，2K 和拆图的自动尺寸按高档估算。</small>
              </label>
              {!isSplit && <label className='sd-field'>背景
                <select value={form.background} onChange={(e) => update(e.target.value === 'transparent' ? { background: 'transparent', format: 'png' } : { background: e.target.value })}>
                  <option value='auto'>由模型决定</option><option value='opaque'>普通背景</option><option value='transparent'>透明背景</option>
                </select><small>做贴纸或商品素材时可选透明背景，保存为 PNG 后可直接叠到其他画面上。</small>
              </label>}
              <label className='sd-field'>{isSplit ? '底图文件格式' : '图片文件格式'}
                <select value={form.format} disabled={!isSplit && form.background === 'transparent'} onChange={(e) => update({ format: e.target.value })}>
                  <option value='png'>PNG</option><option value='jpeg'>JPEG</option>
                </select><small>{isSplit ? '这个选项只影响底图，其余图层使用透明 PNG。' : 'PNG 可保留透明区域，JPEG 适合普通照片。'}</small>
              </label>
              {isSplit && <label className='sd-field'>最多返回几张（含底图）
                <input type='number' min='2' max='100' step='1' value={form.maxImages} onChange={(e) => update({ maxImages: e.target.value })} />
                <small>可填 2–100。填 5 表示最多 1 张底图加 4 个图层；调高上限也会提高最高费用。</small>
              </label>}
            </div>
            {form.size === 'custom' && !isSplit && <div className='sd-custom'>
              <div className='sd-grid'>
                {['width', 'height'].map((key) => <label key={key} className='sd-field'>{key === 'width' ? '宽度（像素）' : '高度（像素）'}
                  <input type='number' min='1' step='1' value={form[key]} aria-describedby='sd-custom-hint' onChange={(e) => update({ [key]: e.target.value })} />
                </label>)}
              </div>
              <p id='sd-custom-hint'>宽 × 高须在 921,600 至 4,624,220 像素之间。宽高比可从 1:16 到 16:1。总像素超过 261 万时采用高档价格。</p>
            </div>}
            {isSplit && <div className='sd-check'>
              <label><input type='checkbox' checked={form.ocr} onChange={(e) => update({ ocr: e.target.checked })} />提取图层里的文字（OCR）</label>
              <small>可返回印刷文字、位置和近似样式。没有可识别文字的图层可能只有图片。当前参考价目中，文字识别没有单独收费。</small>
            </div>}
          </section>
        </div>
        <aside className='sd-side' aria-label='费用与请求预览'>
          <section className='sd-card sd-cost'>
            <h3>费用估算</h3>
            <label className='sd-field'>参考价目
              <select value={priceGroup} onChange={(e) => setPriceGroup(e.target.value)}>
                <option value='discount'>优惠参考价</option><option value='original'>原价参考价</option>
              </select><small>用于比较方案成本，正式售价以工坊开通后的账单为准。</small>
            </label>
            <div aria-live='polite'>
              {quote ? <>
                <p className='sd-total'>{isSplit ? '按拆图上限估算' : '单次参考费用'}<strong>{money(quote.totalMilli)}</strong></p>
                <dl className='sd-breakdown'>
                  <div><dt>输入 {quoteInputCount} 张 × {money(quote.unitInputMilli)}</dt><dd>{money(quote.inputMilli)}</dd></div>
                  <div><dt>{isSplit ? '最多输出' : '输出'} {quote.outputCount} 张 × {money(quote.unitOutputMilli)}</dt><dd>{money(quote.outputMilli)}</dd></div>
                </dl></> : <p>{mode !== 'text' && !fileCount ? '选择图片后即可查看费用。' : '填好尺寸和张数后即可查看费用。'}</p>}
            </div>
            {sample && <p>举例：如果成功返回 {sampleCount} 张（含底图），按当前参考价共 {money(sample.totalMilli)}。整单失败则为 ¥0。</p>}
            <p>每张输入图从首张计费。{isSplit ? '底图也算一张，所有图层按本次选择的尺寸档位计价。如有预扣，先按上限预留，完成后按实际返回张数结算并退回差额。' : '普通生图只输出一张。'} 整次没有成功输出时，费用为 ¥0。</p>
          </section>
          <details className='sd-card sd-request'>
            <summary>查看请求模板</summary>
            <p>供接入时使用。模板里的图片地址是占位符，使用前替换为可访问的图片 URL。此处不会发起调用。</p>
            {invalid || reading ? <p role='status'>{reading ? '图片检查完成后可查看模板。' : invalid}</p> : <>
              <pre tabIndex='0'>{request}</pre>
              <button type='button' className='sd-copy' onClick={copyRequest}>复制请求模板</button>
              <small role='status'>{copyStatus}</small>
            </>}
          </details>
        </aside>
      </div>
    </section>
  );
}
