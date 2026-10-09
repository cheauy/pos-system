const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

test('size uploads override only their own row and submit the selected file', () => {
  let cursor = 0;
  const states = [], errors = [];
  const { default: Form } = loadTs('app/(dashboard)/dashboard/products/variant-product-form.tsx', {
    '@/components/providers/language-provider':{useLanguage:()=>({language:'en',t:text=>text})},
    '@/lib/i18n/translations':loadTs('lib/i18n/translations.ts'),
    'react/jsx-runtime': require('react/jsx-runtime'),
    react: {
      useState: initial => { const id = cursor++; if (!(id in states)) states[id] = typeof initial === 'function' ? initial() : initial; return [states[id], value => { states[id] = typeof value === 'function' ? value(states[id]) : value; }]; },
      useActionState: () => [{ success: false, message: '' }, () => {}, false],
      useRef: () => ({ current: null }), useEffect() {}, useMemo: fn => fn(),
    },
    'lucide-react': require('lucide-react'),
    sonner: { toast: { error: message => errors.push(message) } },
    '@/components/product-gallery-input': { default: 'gallery' },
    '@/lib/barcode/generate': { generateInternalBarcode: () => '123456789012345' },
    './actions': { createVariantProduct() {} },
  });
  const render = () => { cursor = 0; return Form({ categories: [], businessType: 'fashion' }); };
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const find = predicate => nodes(render()).find(predicate);
  const rows = () => JSON.parse(find(node => node.type === 'input' && node.props.name === 'variants').props.value);
  const photo = new File(['photo'], 'black.png', { type: 'image/png' });
  find(node => node.props?.name === 'runImage_initial-run').props.onChange({ target: { files: [photo] } });
  find(node => node.type === 'button' && nodes(node).some(child => child.props?.children === 'XS – XXL')).props.onClick();
  assert.equal(rows().length, 6);
  assert.ok(rows().every(row => row.imageSlot === 'initial-run'));
  const picker = () => find(node => node.type === 'input' && node.props['aria-label'] === 'Upload image for Black XS');
  const replacement = new File(['replacement'], 'xs.png', { type: 'image/png' });
  picker().props.onChange({ target: { files: [replacement], value: '' } });
  const slot = rows()[0].imageSlot;
  assert.notEqual(slot, 'initial-run');
  assert.ok(rows().slice(1).every(row => row.imageSlot === 'initial-run'));
  picker().props.onChange({ target: { files: [], value: '' } });
  picker().props.onChange({ target: { files: [new File(['bad'], 'bad.txt', { type: 'text/plain' })], value: '' } });
  assert.equal(rows()[0].imageSlot, slot);
  assert.equal(errors.length, 1);
  const previousTransfer = global.DataTransfer;
  global.DataTransfer = class { files = []; items = { add: file => this.files.push(file) }; };
  try {
    const input = {};
    find(node => node.props?.name === `runImage_${slot}`).props.ref(input);
    assert.equal(input.files[0], replacement);
  } finally { global.DataTransfer = previousTransfer; }
  find(node => node.type === 'button' && node.props.children?.includes?.('Add Size')).props.onClick();
  assert.ok(find(node => node.props?.['aria-label'] === 'Upload image for variant new size'));
});
