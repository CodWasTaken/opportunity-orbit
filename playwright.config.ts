import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  retries: 1,
  timeout: 30000,
  expect: { timeout: 12000 },
  use: { baseURL:'http://127.0.0.1:4173/opportunity-orbit/', reducedMotion:'reduce', browserName:'chromium' },
  projects:[
    {name:'desktop',use:{viewport:{width:1400,height:900}}},
    {name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
  ],
  webServer: {
    command:'npm run dev -- --port 4173 --strictPort',
    url:'http://127.0.0.1:4173/opportunity-orbit/',
    timeout:30000,
    reuseExistingServer: !process.env.CI,
  },
});
