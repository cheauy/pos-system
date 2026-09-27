# Temporary Expo Router compatibility copy

This is the upstream `decode-uri-component` **0.5.0** decoder from the official npm archive, with only its `export default` changed to `module.exports`. The wrapper preserves version 0.2's plus-to-space behavior for `query-string` 7.1.3. There is no custom decoding algorithm.

Upstream: https://github.com/SamVerschueren/decode-uri-component

Archive: https://registry.npmjs.org/decode-uri-component/-/decode-uri-component-0.5.0.tgz

SHA-512: `1BiQVoK8C9gUbQU6NzAtO/tkz2qOFpEObMWpcFvhx4fYnj4Oc5yzaJN/LD36ihkVUdXyh5ZekzX+yM+ty/SrPg==`

The old recursive decoder is affected by GHSA-vcc3-ghjq-m6fr. A blind ESM override breaks the CommonJS caller. Reproduce this copy with `node scripts/vendor-decoder.cjs` after fetching the pinned archive as described in that script. Run `node --test tests/mobile-decoder.test.cjs` from the repository root.

Remove this override when the installed Expo Router uses a compatible, fixed upstream dependency. Do not downgrade Router to satisfy npm audit.
