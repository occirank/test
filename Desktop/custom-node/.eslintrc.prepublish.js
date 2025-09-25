// .eslintrc.prepublish.js
module.exports = {
  // ...your existing config...
  overrides: [
    // keep your existing overrides here

    // ✅ Parse JSON with jsonc-eslint-parser and don't use TS project
    {
      files: ['package.json', '**/*.json'],
      parser: 'jsonc-eslint-parser',
      parserOptions: { project: null }, // <— critical line
      rules: {
        // (optional) JSON-specific rules
      },
    },
  ],
};
