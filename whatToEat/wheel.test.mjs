import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const wheelHtmlPath = path.join(process.cwd(), 'wheel.html');

function loadWheelHtml() {
  return fs.readFileSync(wheelHtmlPath, 'utf8');
}

function loadWheelTestApi() {
  const html = loadWheelHtml();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

  const context = createExecutionContext();
  vm.createContext(context);

  for (const [, scriptContent] of scripts) {
    new vm.Script(scriptContent, { filename: 'wheel.html' }).runInContext(context);
  }

  return context.__wheelTestApi;
}

function createExecutionContext() {
  const storage = new Map();
  const context2d = createCanvasContextStub();
  const canvas = {
    width: 640,
    height: 640,
    getContext(type) {
      assert.equal(type, '2d');
      return context2d;
    },
    getBoundingClientRect() {
      return { width: this.width, height: this.height };
    },
  };

  const elements = new Map([
    ['wheel-canvas', canvas],
    ['spin-button', createElementStub()],
    ['spin-button-text', createElementStub()],
    ['view-config-button', createElementStub()],
    ['result-label', createElementStub()],
    ['result-meta', createElementStub()],
    ['history-list', createElementStub()],
    ['history-count', createElementStub()],
    ['status-text', createElementStub()],
    ['clear-history', createElementStub()],
    ['back-to-wheel-button', createElementStub()],
    ['add-single-item-button', createElementStub()],
    ['open-mobile-batch-import-button', createElementStub()],
    ['add-batch-button', createElementStub()],
    ['config-batch-input', createElementStub()],
    ['config-count', createElementStub()],
    ['config-items-list', createElementStub()],
    ['view-wheel', createElementStub()],
    ['view-config', createElementStub()],
    ['view-mobile-batch-import', createElementStub()],
    ['mobile-result-toast', createElementStub()],
    ['back-to-config-button', createElementStub()],
    ['submit-mobile-batch-button', createElementStub()],
    ['mobile-batch-input', createElementStub()],
  ]);

  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createElementStub());
      }
      return elements.get(id);
    },
    createElement() {
      return createElementStub();
    },
    addEventListener() {},
  };

  const window = {
    document,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    requestAnimationFrame(callback) {
      callback(0);
      return 1;
    },
    cancelAnimationFrame() {},
    performance: { now: () => 0 },
  };

  return {
    window,
    document,
    localStorage: window.localStorage,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    performance: window.performance,
    console,
    Math,
    Date,
    setTimeout,
    clearTimeout,
  };
}

function createElementStub() {
  return {
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    hidden: false,
    className: '',
    dataset: {},
    children: [],
    style: {},
    classList: {
      add() {},
      remove() {},
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = children;
    },
    addEventListener() {},
    setAttribute() {},
    querySelector() {
      return null;
    },
    focus() {},
    select() {},
  };
}

function createCanvasContextStub() {
  return {
    save() {},
    restore() {},
    clearRect() {},
    translate() {},
    rotate() {},
    beginPath() {},
    moveTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillText() {},
    measureText(text) {
      return { width: String(text).length * 12 };
    },
    set fillStyle(value) {
      this._fillStyle = value;
    },
    get fillStyle() {
      return this._fillStyle;
    },
    set strokeStyle(value) {
      this._strokeStyle = value;
    },
    get strokeStyle() {
      return this._strokeStyle;
    },
    set lineWidth(value) {
      this._lineWidth = value;
    },
    get lineWidth() {
      return this._lineWidth;
    },
    set font(value) {
      this._font = value;
    },
    get font() {
      return this._font;
    },
    set textAlign(value) {
      this._textAlign = value;
    },
    get textAlign() {
      return this._textAlign;
    },
    set textBaseline(value) {
      this._textBaseline = value;
    },
    get textBaseline() {
      return this._textBaseline;
    },
  };
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

runTest('sanitizeItems trims labels and removes empty entries', () => {
  const api = loadWheelTestApi();

  assert.deepEqual(toPlain(api.sanitizeItems([
    { label: '  晨会抽签  ' },
    { label: '' },
    { label: '  ' },
    {},
    { label: '复盘主持' },
  ])), [
    { label: '晨会抽签' },
    { label: '复盘主持' },
  ]);
});

runTest('pushHistory keeps newest records first and caps at ten entries', () => {
  const api = loadWheelTestApi();

  const result = toPlain(Array.from({ length: 12 }, (_, index) => index + 1).reduce(
    (history, index) => api.pushHistory(history, `选项 ${index}`),
    [],
  ));

  assert.equal(result.length, 10);
  assert.equal(result[0].label, '选项 12');
  assert.equal(result.at(-1).label, '选项 3');
});

runTest('computeWinningIndex matches the requested winner after a planned spin', () => {
  const api = loadWheelTestApi();

  const rotation = api.computeSpinRotation(6, 4, 5);
  assert.equal(api.getWinningIndex(6, rotation), 4);
});

runTest('editorTextToItems converts non-empty lines into labels', () => {
  const api = loadWheelTestApi();

  assert.deepEqual(toPlain(api.editorTextToItems(`
    红烧肉
    宫保鸡丁
      番茄鸡蛋面  `)), [
    { label: '红烧肉' },
    { label: '宫保鸡丁' },
    { label: '番茄鸡蛋面' },
  ]);
});

runTest('appendItems keeps existing labels and appends parsed batch items', () => {
  const api = loadWheelTestApi();

  assert.deepEqual(toPlain(api.appendItems([
    { label: '红烧肉' },
    { label: '番茄鸡蛋面' },
  ], `
    麻辣香锅

    牛肉粉  `)), [
    { label: '红烧肉' },
    { label: '番茄鸡蛋面' },
    { label: '麻辣香锅' },
    { label: '牛肉粉' },
  ]);
});

runTest('itemsToEditorText serializes menu labels as newline-delimited text', () => {
  const api = loadWheelTestApi();

  assert.equal(
    api.itemsToEditorText([
      { label: '绾㈢儳鑲?' },
      { label: '鐣寗楦¤泲闈?' },
      { label: '楹昏荆棣欓攨' },
    ]),
    '绾㈢儳鑲?\n鐣寗楦¤泲闈?\n楹昏荆棣欓攨',
  );
});

runTest('default wheel config seeds the requested menu list', () => {
  const api = loadWheelTestApi();

  assert.deepEqual(
    toPlain(api.defaultWheelItems).map((item) => item.label),
    [
      '\u65b0\u8363\u548c',
      '\u8d85\u610f\u5174',
      '\u91d1\u5fb7\u5229\u6c11',
      '\u9e21\u86cb\u677f\u9762',
      '\u897f\u7ea2\u67ff\u9e21\u86cb\u9762/\u7092\u9e21',
      '\u4e09\u6c5f\u6e90\u7684\u9762',
      '\u9a74\u8089\u7c89\u4e1d\u6c64',
      '\u56db\u5ddd\u9762\u9986',
      'K88\u677f\u51f3\u9762',
      '\u7f8a\u6392\u624b\u6293\u996d',
      '\u8001\u5976\u5976\u9762',
      '\u8054\u56db\u8def\u5176\u4ed6\u7684',
      '\u9752\u5c71\u91cc',
    ],
  );
});

runTest('wheel center button keeps centered transform on hover', () => {
  const html = loadWheelHtml();

  assert.match(
    html,
    /\.wheel-center-button:hover:not\(:disabled\)\s*\{[\s\S]*transform:\s*translate\(-50%,\s*-50%\)/,
  );
});

runTest('wheel center button keeps centered transform when disabled during spin', () => {
  const html = loadWheelHtml();

  assert.match(
    html,
    /\.wheel-center-button:disabled\s*\{[\s\S]*transform:\s*translate\(-50%,\s*-50%\)/,
  );
});

runTest('createWheelLabelLines formats long labels into at most two readable lines', () => {
  const api = loadWheelTestApi();

  assert.deepEqual(
    toPlain(api.createWheelLabelLines('新疆和田烤肉拌饭')),
    ['新疆和田', '烤肉拌饭'],
  );
});

runTest('page copy uses readable chinese labels instead of mojibake', () => {
  const html = loadWheelHtml();

  assert.match(html, /<title>今天吃什么<\/title>/);
  assert.match(html, />配置</);
  assert.match(html, />清空记录</);
  assert.match(html, />新增</);
  assert.match(html, />批量导入</);
  assert.match(html, />返回转盘</);
  assert.doesNotMatch(html, /閰嶇疆|娓呯┖璁板綍|杩斿洖鑿滃崟|鎶藉彇涓/);
});

runTest('mobile result no longer renders a transient toast after drawing a winner', () => {
  const html = loadWheelHtml();

  assert.doesNotMatch(html, /id="mobile-result-toast"/);
  assert.doesNotMatch(html, /function showMobileResultToast\(label\)/);
  assert.doesNotMatch(html, /抽中了：\$\{label\}/);
});

runTest('mobile layout keeps viewport fixed and moves scroll into the history list', () => {
  const html = loadWheelHtml();

  assert.match(
    html,
    /@media \(max-width: 640px\)\s*\{[\s\S]*?html,\s*body\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*hidden;/,
  );

  assert.match(
    html,
    /@media \(max-width: 640px\)\s*\{[\s\S]*?\.app-shell\s*\{[\s\S]*?height:\s*calc\(100dvh - 12px\);[\s\S]*?overflow:\s*hidden;/,
  );

  assert.match(
    html,
    /@media \(max-width: 640px\)\s*\{[\s\S]*?\.history-scroll\s*\{[\s\S]*?overflow-y:\s*auto;/,
  );
});

runTest('mobile config toolbar uses direct actions instead of the old drawer menu', () => {
  const html = loadWheelHtml();

  assert.match(
    html,
    /<div class="toolbar config-toolbar">[\s\S]*?id="add-single-item-button"[\s\S]*?新增[\s\S]*?id="open-mobile-batch-import-button"[\s\S]*?批量导入[\s\S]*?id="back-to-wheel-button"[\s\S]*?返回转盘/s,
  );

  assert.doesNotMatch(html, /id="manage-menu-button"/);
  assert.doesNotMatch(html, /id="mobile-config-drawer"/);
  assert.doesNotMatch(html, /返回菜单/);
});

runTest('config items card exposes a small copy button near the current menu heading', () => {
  const html = loadWheelHtml();

  assert.match(
    html,
    /<div class="items-head">[\s\S]*?<button id="copy-items-button" class="toolbar-button compact-button" type="button">[\s\S]*?<\/button>[\s\S]*?<p class="meta-label">当前菜单<\/p>/,
  );
});

runTest('mobile batch import uses a dedicated full-screen panel with a larger textarea', () => {
  const html = loadWheelHtml();

  assert.match(html, /id="view-mobile-batch-import"/);
  assert.match(html, /id="back-to-config-button"/);
  assert.match(html, /id="submit-mobile-batch-button"/);
  assert.match(
    html,
    /@media \(max-width: 640px\)\s*\{[\s\S]*?\.batch-import-input\s*\{[\s\S]*?min-height:\s*42dvh;/,
  );
});

runTest('mobile add action still appends a placeholder item and focuses inline editing', () => {
  const html = loadWheelHtml();

  assert.match(html, /function addSingleItem\(\)[\s\S]*?appendItems\(state\.items,\s*"待编辑内容"\)/);
  assert.match(html, /function addSingleItem\(\)[\s\S]*?lastInput\.focus\(\);/);
});

runTest('mobile batch import switches to its own view instead of opening a drawer', () => {
  const html = loadWheelHtml();

  assert.match(
    html,
    /function openMobileBatchImport\(\)[\s\S]*?switchView\("mobile-batch-import"\);/,
  );

  assert.match(
    html,
    /function addBatchItems\(source = "desktop"\)[\s\S]*?if \(source === "mobile"\)[\s\S]*?switchView\("config"\);/,
  );
});
