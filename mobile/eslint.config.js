const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expo,
  { ignores: ['dist/**', '.expo/**'] },
  { files: ['*.config.js', 'scripts/*.cjs'], languageOptions: { globals: { Buffer: 'readonly', __dirname: 'readonly' } } },
]);
