const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

// Exercise the client callbacks with isolated hooks; no live product writes.
test('catalog opens details directly and toggles Hide / Unhide through confirmation', async () => {
  const previousDocument = global.document, previousWindow = global.window;
  global.document = { body: {} }; global.window = { innerWidth: 1200, innerHeight: 900 };
  try {
    for (const active of [true, false]) {
      let cursor = 0, pending;
      const states = [], writes = [], deletions = [];
      const { default: Catalog } = loadTs('components/product-list.tsx', {
        'react/jsx-runtime': require('react/jsx-runtime'),
    '@/components/anchored-action-menu': { default: 'action-menu' },
        react: {
          useState: initial => { const id = cursor++; if (!(id in states)) states[id] = initial; return [states[id], value => { states[id] = typeof value === 'function' ? value(states[id]) : value; }]; },
          useMemo: fn => fn(), useEffect: () => {}, useTransition: () => [false, fn => { pending = fn(); }],
        },
        'react-dom': { createPortal: node => node },
        'next/link': { default: 'a' }, 'next/navigation': { useRouter: () => ({ refresh() {} }) },
        'lucide-react': require('lucide-react'), sonner: { toast: { error() {} } },
        '@/components/product-photo': { default: 'img' },
        '@/components/product-photo-viewer': { default: 'photo-viewer' },
        '@/lib/inventory/stock-adjustment': { stockAdjustmentLink: () => '' },
        '@/app/(dashboard)/dashboard/products/actions': {
          setProductGroupActive: async (...args) => { writes.push(args); return { success: true }; },
          deleteProductGroup: async (...args) => { deletions.push(args); return { success: true }; },
        },
      });
      const product = { id:'p1', name:'Shirt', image_url:'https://images.test/cover.jpg', image_urls:['https://images.test/cover.jpg','https://images.test/back.jpg'], is_active:active, selling_price:5, stock_quantity:2, low_stock_quantity:1, created_at:'2026-09-30', updated_at:'2026-09-30' };
      const render = () => { cursor = 0; return Catalog({ products:[product] }); };
      function nodes(node) {
        if (!node || typeof node !== 'object') return [];
        if (Array.isArray(node)) return node.flatMap(nodes);
        return [node, ...nodes(node.props?.children)];
      }
      const find = (tree, predicate) => nodes(tree).find(predicate);
      let tree = render();
      const row = find(tree, node => node.type === 'tr' && node.props.onClick);
      row.props.onClick({ target: { closest: () => true } });
      assert.equal(states[9], null, 'checkbox/action clicks must not open details');
      row.props.onClick({ target: { closest: () => false } });
      assert.equal(states[9].name, 'Shirt');
      const photoTree = render();
      const photoButton = find(photoTree, node => node.props?.['aria-label'] === 'View product photo 2');
      assert.equal(photoButton.type, 'button');
      photoButton.props.onClick();
      const viewer = find(render(), node => node.type === 'photo-viewer');
      assert.equal(viewer.props.images[viewer.props.initialIndex], 'https://images.test/back.jpg');
      viewer.props.onClose();
      assert.equal(states[9].name, 'Shirt', 'closing photos keeps product details open');
      states[9] = null;
      find(tree, node => node.props?.['aria-label'] === 'Grid view').props.onClick();
      const card = find(render(), node => typeof node.type === 'function' && node.props?.onView);
      card.props.onView();
      assert.equal(states[9].name, 'Shirt', 'grid cards open the same details');
      find(tree, node => node.props?.['aria-label'] === 'Actions for Shirt').props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: { getBoundingClientRect: () => ({ right:500, bottom:200, top:170 }) } });
      tree = render();
      const menu = find(tree, node => node.props?.role === 'menu');
      const buttons = nodes(menu).filter(node => node.type === 'button');
      assert.equal(buttons.length, 2, 'only visibility and delete buttons remain alongside Edit');
      const visibility = buttons[0];
      assert.ok(visibility.props.children.includes(active ? 'Hide' : 'Unhide'));
      visibility.props.onClick(); tree = render();
      const dialog = find(tree, node => node.props?.role === 'alertdialog');
      const confirm = nodes(dialog).filter(node => node.type === 'button').at(-1);
      assert.equal(confirm.props.children, active ? 'Hide' : 'Unhide');
      confirm.props.onClick(); await pending;
      assert.deepEqual(writes, [['p1', !active]]);
      find(render(), node => node.props?.['aria-label'] === 'List view').props.onClick();
      find(render(), node => node.props?.['aria-label'] === 'Select products on this page').props.onChange();
      const bulkMenu = find(render(), node => node.type === 'action-menu');
      assert.equal(bulkMenu.props.label, 'Actions (1)');
      assert.equal(nodes(bulkMenu).filter(node => node.type === 'button').length, 3);
      find(bulkMenu, node => node.props?.children === 'Delete selected').props.onClick();
      assert.equal(deletions.length, 0, 'delete must wait for confirmation');
      const bulkDialog = find(render(), node => node.props?.role === 'alertdialog');
      nodes(bulkDialog).filter(node => node.type === 'button').at(-1).props.onClick();
      await pending;
      assert.deepEqual(deletions, [['p1', '']]);
      assert.equal(find(render(), node => node.type === 'action-menu'), undefined);
    }
  } finally { global.document = previousDocument; global.window = previousWindow; }
});
