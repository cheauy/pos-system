const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

test('edit uses direct variant uploads, preserves sibling photos and supports new sizes', async () => {
  // Variant uploads are shrunk asynchronously before they enter the draft.
  const settle = () => new Promise(resolve => setImmediate(resolve));
  let cursor = 0;
  const states = [], errors = [];
  let effects = [];
  const { default: Editor } = loadTs('app/(dashboard)/dashboard/products/[id]/edit/edit-product-client.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/components/anchored-action-menu': { default: 'action-menu' },
    react: {
      Fragment: 'fragment', useId: () => 'dialog',
      useState: initial => { const id = cursor++; if (!(id in states)) states[id] = typeof initial === 'function' ? initial() : initial; return [states[id], value => { states[id] = typeof value === 'function' ? value(states[id]) : value; }]; },
      useRef: value => { const id = cursor++; if (!(id in states)) states[id] = { current: value }; return states[id]; }, useEffect: effect => effects.push(effect), useMemo: fn => fn(),
    },
    'next/link': { default: 'a' }, 'next/navigation': { useRouter: () => ({}) },
    'lucide-react': require('lucide-react'),
    sonner: { toast: { error: message => errors.push(message), info() {}, success() {} } },
    '@/components/product-gallery-input': { default: 'gallery' },
    '@/lib/barcode/generate': { generateInternalBarcode: () => '123456789012345' },
    '@/lib/images/shrink-photo': { shrinkPhoto: async file => file, uploadBytes: () => 0, MAX_SAVE_UPLOAD_BYTES: 15 * 1024 * 1024 },
    '@/lib/products/variant-editor': loadTs('lib/products/variant-editor.ts'),
    '@/lib/inventory/stock-adjustment': { stockAdjustmentLink: () => '' },
    '../../actions': {},
  });
  let product = { id: 's', name: 'Shirt', categoryId: null, description: '', barcode: '', imageUrl: null, images: [], galleryUrls: [], productType: 'variant', variantGroupId: 'group', isActive: true, isOnline: true };
  let initialVariants = ['S', 'M'].map(size => ({ id: size.toLowerCase(), size, color: 'Black', sku: size, costPrice: '1', sellingPrice: '2', stockQuantity: '3', lowStockQuantity: '1', isActive: true, imageUrl: null, variantImageUrl: 'https://images.test/shared.png', imageSlot: null }));
  const render = () => { cursor = 0; effects = []; return Editor({ product, initialVariants, categories: [], businessType: 'fashion', branchId: 'branch', canCreateVariants: true, canDisable: true }); };
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const find = predicate => nodes(render()).find(predicate);
  const picker = label => find(node => node.type === 'input' && node.props['aria-label'] === `Upload image for ${label}`);
  const image = label => find(node => node.type === 'img' && node.props.alt === label)?.props.src;
  picker('Black S').props.onChange({ target: { files: [new File(['photo'], 'size.png', { type: 'image/png' })], value: '' } });
  await settle();
  const selectedImage = image('Black S');
  product = structuredClone(product); initialVariants = structuredClone(initialVariants);
  render(); effects[0]();
  assert.equal(find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, false, 'unchanged refresh must not block saving');
  find(node => node.type === 'input' && node.props['aria-label'] === 'Select Black S').props.onChange();
  find(node => node.type === 'button' && node.props.children === 'Hide selected').props.onClick();
  const visibilityCheckbox = find(node => node.type === 'label' && node.props.children?.includes?.(' Show online')).props.children[0];
  visibilityCheckbox.props.onChange({ target: { checked: false } });
  find(node => node.type === 'button' && node.props.children?.includes?.(' Done')).props.onClick();
  const draft = states[0];
  assert.equal(draft.variants.find(row => row.id === 's').isOnline, false);
  assert.equal(draft.variants.find(row => row.id === 'm').isOnline, true);

  assert.ok(selectedImage.startsWith('blob:'));
  assert.equal(image('Black M'), 'https://images.test/shared.png');
  picker('Black S').props.onChange({ target: { files: [], value: '' } });
  picker('Black S').props.onChange({ target: { files: [new File(['bad'], 'bad.txt', { type: 'text/plain' })], value: '' } });
  await settle();
  assert.equal(image('Black S'), selectedImage);
  assert.equal(errors.length, 1);
  assert.equal(find(node => node.props?.title?.startsWith?.('Image for')), undefined);
  find(node => node.type === 'button' && node.props.children?.includes?.('Add Size')).props.onClick();
  assert.ok(picker('New colour New size'));
  assert.ok(find(node => node.type === 'summary' && node.props.children?.includes?.('Quick size run')));
  assert.equal(find(node => /^(Search variants|Filter by|Sort variants)/.test(node.props?.['aria-label'] || '')), undefined);
  const gallery = find(node => node.type === 'gallery');
  assert.deepEqual(gallery.props.initialUrls, []);
  find(node => node.type === 'input' && node.props['aria-label'] === 'Quick size run image').props.onChange({ target: { files: [new File(['run'], 'run.png', { type: 'image/png' })], value: '' } });
  await settle();
  find(node => node.props?.label === 'Colours').props.children.props.onChange({ target: { value: 'White' } });
  find(node => node.props?.label === 'Sizes').props.children.props.onChange({ target: { value: 'S, M' } });
  // Remove the blank manually-added row before exercising the validated size run.
  states[0] = { ...states[0], variants: states[0].variants.filter(row => row.id) };
  find(node => node.type === 'button' && node.props.children?.includes?.(' to draft')).props.onClick();
  const generated = states[0].variants.filter(row => row.color === 'White');
  assert.equal(generated.length, 2);
  assert.ok(generated[0].imageKey?.startsWith('upload-'));
  assert.equal(generated[0].imageKey, generated[1].imageKey);
  find(node => node.type === 'button' && node.props.children === 'Clear').props.onClick();
  assert.ok(find(node => node.type === 'button' && node.props.children === 'Select All'));
  product = { ...product, name: 'Changed by another user' };
  render(); effects[0]();
  assert.equal(find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, true, 'real conflicting edits must stay protected');
});
