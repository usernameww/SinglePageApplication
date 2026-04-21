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
    ['add-batch-button', createElementStub()],
    ['config-batch-input', createElementStub()],
    ['config-count', createElementStub()],
    ['config-items-list', createElementStub()],
    ['view-wheel', createElementStub()],
    ['view-config', createElementStub()],
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
    { label: '  早会抽签  ' },
    { label: '' },
    { label: '  ' },
    {},
    { label: '复盘主持' },
  ])), [
    { label: '早会抽签' },
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
      番茄鸡蛋面
  `)), [
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

    牛肉粉
  `)), [
    { label: '红烧肉' },
    { label: '番茄鸡蛋面' },
    { label: '麻辣香锅' },
    { label: '牛肉粉' },
  ]);
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
