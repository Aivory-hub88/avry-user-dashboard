// Flat ESLint config (ESLint 9 / Next 16 — `next lint` and .eslintrc-based
// config were both removed; this is the officially supported replacement).
// There was previously no eslint.config.js at all in this repo, so `eslint`
// silently couldn't run project-wide.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'node_modules/**',
      '.data/**',
      'public/**',
    ],
  },
]

export default eslintConfig
