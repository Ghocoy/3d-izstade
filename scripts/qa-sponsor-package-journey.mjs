import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const baseUrl=(process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
const artifactDir=process.argv[3] || '.tmp/sponsor-package-journey';
await fs.mkdir(artifactDir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
const cases=[];
let completed=false;
const storageKey='warpala.expo.sponsorPackageRequests';
async function setup(width=390) {
 const context=await browser.newContext({viewport:{width,height:900}});
 await context.route('**/api/**', route => route.request().method()==='GET' ? route.fallback() : route.fulfill({status:503,json:{error:'QA_WRITE_REQUIRES_FIXTURE'}}));
 const page=await context.newPage();
 const errors=[];page.on('pageerror', e=>errors.push(e.message));
 return {context,page,errors};
}
async function fill(page) {
 await page.getByLabel('Contact name',{exact:true}).fill('QA Sponsor');
 await page.getByLabel('Work email',{exact:true}).fill('qa@example.invalid');
 await page.getByLabel('Company',{exact:true}).fill('QA Company');
 await page.getByLabel('Sponsor goal',{exact:true}).fill('Synthetic journey check; no live submission.');
}
async function queue(page) { return await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),storageKey); }
async function run(label,action) { await action();cases.push({label,passed:true});console.log('PASS',label); }
try {
 await run('home link chooses package and sends a single request',async()=>{
  const {context,page,errors}=await setup();const payloads=[];let release;
  await page.route('**/api/expo/lead',async route=>{
   payloads.push(route.request().postDataJSON());
   await new Promise(resolve=>{release=resolve});
   await route.fulfill({status:201,json:{success:true}});
  });
  await page.goto(baseUrl+'/');
  await page.getByRole('link',{name:'View sponsor packages',exact:true}).click();
  await page.getByRole('button',{name:'Choose Standard',exact:true}).click();
  assert.equal(await page.getByLabel(/^Package/).inputValue(),'standard');
  await fill(page);
  await page.getByRole('button',{name:'Request quote',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-sponsor-package-request-status]')?.textContent.includes('Sending sponsor request'));
  assert.equal(await page.getByLabel('Contact name',{exact:true}).isDisabled(),true);
  await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(payloads.length,1);
  assert.equal(payloads[0].companyId,'sponsor-concierge');
  assert.match(payloads[0].message,/Standard Booth/);
  release();
  await page.locator('[data-sponsor-package-request-status="success"]').waitFor();
  const saved=await queue(page);assert.equal(saved.length,1);assert.equal(saved[0].syncStatus,'backend-synced');
  assert.equal(await page.getByLabel('Contact name',{exact:true}).inputValue(),'');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(artifactDir,'sponsor-mobile.png'),fullPage:true});
  await context.close();
 });
 for (const status of [400,409,429,503]) await run(`HTTP ${status} preserves correct request state`,async()=>{
  const {context,page,errors}=await setup();
  await page.route('**/api/expo/lead',route=>route.fulfill({status,json:{error:status===409?'EXPO_LEAD_DUPLICATE':'QA_FAILURE'}}));
  await page.goto(baseUrl+'/expo/sponsor-packages');await fill(page);
  await page.getByRole('button',{name:'Request quote',exact:true}).click();
  await page.locator('[data-sponsor-package-request-status="error"]').waitFor();
  assert.equal(await page.getByLabel('Contact name',{exact:true}).inputValue(),'QA Sponsor');
  assert.equal((await queue(page)).length,status===429||status===503?1:0);
  const message=await page.getByRole('status').textContent();
  assert.doesNotMatch(message,/SERVER_API|QA_FAILURE|Connection dropped/);
  if(status===409)assert.match(message,/already in the sponsor team queue/);
  if(status===429||status===503)assert.match(message,/has not been sent/);
  assert.deepEqual(errors,[]);await context.close();
 });
 await run('offline draft survives reload and manual sync sends it once',async()=>{
  const {context,page}=await setup();let online=false;let sent=0;let release;
  await page.route('**/api/expo/lead',async route=>{
   if(!online)return await route.abort('failed');
   sent++;await new Promise(resolve=>{release=resolve});await route.fulfill({status:201,json:{success:true}});
  });
  await page.goto(baseUrl+'/expo/sponsor-packages');await fill(page);
  await page.getByRole('button',{name:'Request quote',exact:true}).click();
  await page.locator('[data-sponsor-package-request-status="error"]').waitFor();
  assert.equal((await queue(page))[0].syncStatus,'backend-pending');
  await page.reload();online=true;
  await page.getByRole('button',{name:'Send saved requests',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-sponsor-package-request-status]')?.textContent.includes('Sending saved sponsor requests'));
  assert.equal(await page.getByRole('button',{name:'Sending request...',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Sending...',exact:true}).isDisabled(),true);
  release();await page.locator('[data-sponsor-package-request-status="success"]').waitFor();
  assert.equal(sent,1);assert.equal((await queue(page))[0].syncStatus,'backend-synced');await context.close();
 });
 await run('local storage failure preserves form without falsely claiming success',async()=>{
  const {context,page}=await setup();
  await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('blocked','QuotaExceededError')};});
  await page.route('**/api/expo/lead',route=>route.abort('failed'));
  await page.goto(baseUrl+'/expo/sponsor-packages');await fill(page);
  await page.getByRole('button',{name:'Request quote',exact:true}).click();
  await page.locator('[data-sponsor-package-request-status="error"]').waitFor();
  assert.match(await page.getByRole('status').textContent(),/could not save a draft/);
  assert.equal(await page.getByLabel('Contact name',{exact:true}).inputValue(),'QA Sponsor');await context.close();
 });
 await run('private inbox sign-in keeps destination',async()=>{
  const {context,page}=await setup();
  await page.goto(baseUrl+'/expo/sponsor-leads');
  const link=page.getByRole('link',{name:'Sign in',exact:true});await link.waitFor();
  assert.equal(await link.getAttribute('href'),'/login?next=/expo/sponsor-leads');
  await link.click();assert.match(page.url(),/\/login\?next=\/expo\/sponsor-leads/);await context.close();
 });
 for(const width of [390,1440]) await run('3D demo opens packages at '+width+'px',async()=>{
  const {context,page,errors}=await setup(width);
  if(width<600) { await context.close(); return await checkTouchExpo(width); }
  await checkExpoPage(page,width,errors);await context.close();
 });
 for(const width of [320,390,1440]) await run('pages fit viewport at '+width+'px',async()=>{
  const {context,page}=await setup(width);
  for(const route of ['/','/expo/sponsor-packages','/expo/sponsor-leads']) {
   await page.goto(baseUrl+route);await page.getByRole('heading',{level:1}).waitFor();
   await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' overflows at '+width);
  }
  await context.close();
 });
 completed=true;
} finally {
 await fs.writeFile(path.join(artifactDir,'browser-result.json'),JSON.stringify({cases,completed,apiWritesUseFixtures:true},null,2));
 await browser.close();
}

async function checkTouchExpo(width) {
 const context=await browser.newContext({viewport:{width,height:900},isMobile:true,hasTouch:true});
 await context.route('**/api/**', route => route.request().method()==='GET' ? route.fallback() : route.fulfill({status:503,json:{error:'QA_WRITE_REQUIRES_FIXTURE'}}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await checkExpoPage(page,width,errors,true);await context.close();
}
async function checkExpoPage(page,width,errors,touch=false) {
 await page.goto(baseUrl+'/expo-3d?salesDemo=1');
 await page.locator('[data-sales-demo-guide-overlay="true"]').waitFor();
 if(touch) {
  await page.getByRole('button',{name:'Open sponsor form',exact:true}).click();
  await page.getByRole('textbox',{name:'Company',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close sponsor form',exact:true}).click();
  await page.getByRole('textbox',{name:'Company',exact:true}).waitFor({state:'hidden'});
  assert.match(page.url(),/expo-3d/);
 }
 await page.locator('[data-sales-demo-cta-label="View Packages"]').click();
 await page.getByRole('heading',{level:1}).waitFor();
 assert.match(page.url(),/\/expo\/sponsor-packages/);
 assert.deepEqual(errors,[]);
 await page.locator('[data-sponsor-package-request-form="true"]').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(artifactDir,'request-form-'+width+'.png')});
}
