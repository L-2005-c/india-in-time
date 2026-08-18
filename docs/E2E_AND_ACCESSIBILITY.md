# E2E and Accessibility Validation

The application keeps Playwright and axe-core as CI-installed validation tooling so the production runtime dependency lock remains unchanged.

CI performs:
1. `npm ci`
2. exact-version installation of `@playwright/test` and `@axe-core/playwright`
3. Chromium installation
4. browser E2E smoke tests
5. axe accessibility checks
6. initial-page performance-budget checks

Run locally:
```bash
npm ci
npm install --no-save @playwright/test@1.55.0 @axe-core/playwright@4.10.1
npx playwright install chromium
npm run test:e2e
npm run test:accessibility
npm run test:performance
```
