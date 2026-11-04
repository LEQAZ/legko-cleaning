// Local browser QA using installed Edge and Node's built-in CDP/WebSocket support.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const artifacts = path.resolve('artifacts');
await mkdir(artifacts, { recursive: true });
const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update',
  '--remote-debugging-port=9223', `--user-data-dir=${path.join(artifacts, 'edge-profile')}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });
let socket;
let serial = 0;
const pending = new Map();
const errors = [];
const waits = (ms) => new Promise(resolve => setTimeout(resolve, ms));
try {
  let tabs;
  for (let n = 0; n < 50; n++) {
    try { tabs = await (await fetch('http://127.0.0.1:9223/json/list')).json(); if (tabs.length) break; } catch {}
    await waits(200);
  }
  assert.ok(tabs?.length, 'Edge debugging endpoint unavailable');
  const target = await (await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id); clearTimeout(timer); pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const baseUrl = (process.env.SITE_BASE_URL || 'http://127.0.0.1:5500').replace(/\/$/, '') + '/';
  await send('Page.navigate', { url: baseUrl });
  for (let n = 0; n < 50; n++) {
    if (await evaluate("document.querySelector('#window-minus')?.disabled === true && document.querySelector('.room-photo')?.complete")) break;
    await waits(100);
  }
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '4000');
  assert.equal(await evaluate("document.querySelector('[data-receipt-item=minimum]') === null"), true, 'No surcharge above the minimum');
  assert.equal(await evaluate("document.querySelector('#extra-balcony') !== null && document.querySelector('#extra-porch') === null"), true);
  await evaluate("for (const [id,value] of [['extra-balcony',6],['window-count',2]]) {const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input'));}");
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '5420');
  assert.equal(await evaluate("document.querySelector('[data-receipt-item=balcony] dd').textContent.replace(/\\D/g, '')"), '720');
  await evaluate("for (const id of ['extra-balcony','window-count']) {const input=document.getElementById(id);input.value=0;input.dispatchEvent(new Event('input'));}");
  assert.equal(await evaluate("(async () => { const { SERVICES } = await import('./calculator.mjs'); const labels = [...document.querySelectorAll('[data-service-rate]')]; return labels.length === 3 && labels.every(label => label.textContent === new Intl.NumberFormat('ru-RU').format(SERVICES[label.dataset.serviceRate].rate) + ' ₽'); })()"), true, 'Service cards must display rates from SERVICES');
  assert.equal(await evaluate("document.querySelector('.room-photo').naturalWidth > 0"), true);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Desktop overflow');
  const apartmentTheme = await evaluate("getComputedStyle(document.body).getPropertyValue('--blue').trim()");
  assert.equal(await evaluate("document.querySelector('.room-photo').getAttribute('src')"), 'assets/apartment-interior.png');
  const pointerPosition = await evaluate("(() => {const r=document.querySelector('.architecture-frame').getBoundingClientRect(); return {x:r.left+r.width*.7,y:r.top+r.height*.65};})()");
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...pointerPosition });
  await waits(80);
  const finePointerActive = await evaluate("matchMedia('(hover: hover) and (pointer: fine)').matches");
  if (finePointerActive) assert.equal(await evaluate("document.querySelector('.cursor-glow').classList.contains('is-active')"), true);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await waits(80);
  assert.equal(await evaluate("document.body.classList.contains('motion-enabled')"), false, 'Reduced motion disables pointer effects');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.architecture-frame')).transform"), 'none');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1438, y: 500 });
  await waits(100);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Cursor glow cannot cause edge overflow');
  const desktop = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1440, height: 1050, scale: 1 } });
  await writeFile(path.join(artifacts, 'desktop.png'), Buffer.from(desktop.data, 'base64'));
  await evaluate("document.querySelector('[data-pick-service=deep]').click(); document.querySelector('#window-plus').click(); document.querySelector('#oven').click();");
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '7950');
  await evaluate("const input=document.querySelector('#area-number'); input.value='20'; input.dispatchEvent(new Event('input')); document.querySelector('[name=service][value=regular]').click();");
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '3950');
  await evaluate("document.querySelector('#pet-hair').click()");
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '4450');
  assert.equal(await evaluate("document.querySelector('[data-receipt-item=petHair] dd').textContent.replace(/\\D/g, '')"), '500');
  await evaluate("document.querySelector('#pet-hair').click()");
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '3950');
  const displayedAmounts = "[...document.querySelectorAll('#estimate-lines dd')].map(el => Number(el.textContent.replace(/\\D/g, '')))";
  assert.deepEqual(await evaluate(displayedAmounts), [1600, 1400, 350, 600]);
  await evaluate("document.querySelector('#window-minus').click()");
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '3600');
  assert.deepEqual(await evaluate(displayedAmounts), [1600, 1400, 600]);
  await evaluate("window.scrollTo({top:0,behavior:'instant'});");
  const receiptClip = await evaluate("(() => {const r=document.querySelector('.estimate-card').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()");
  const receiptImage = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: receiptClip });
  await writeFile(path.join(artifacts, 'receipt-desktop.png'), Buffer.from(receiptImage.data, 'base64'));
  await evaluate("document.querySelector('#window-plus').click()");
  await evaluate("{const input=document.querySelector('#window-count');input.value=12;input.dispatchEvent(new Event('input'));document.querySelector('#fridge').click();}");
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '8250');
  assert.equal(await evaluate("document.querySelector('#oven').type === 'checkbox' && document.querySelector('#fridge').type === 'checkbox'"), true);
  assert.equal(await evaluate("document.querySelector('#window-count').getAttribute('max')"), null);
  await evaluate("document.querySelector('#window-plus').click()");
  assert.equal(await evaluate("document.querySelector('#window-count').value"), '13', 'Windows can exceed ten');
  await evaluate("{const input=document.querySelector('#window-count');input.value='-1';input.dispatchEvent(new Event('input'));}");
  assert.equal(await evaluate("document.querySelector('#window-count').checkValidity()"), false, 'Negative window count rejected');
  await evaluate("{const input=document.querySelector('#window-count');input.value=1;input.dispatchEvent(new Event('input'));document.querySelector('#fridge').click();}");
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '3950');
  await evaluate("document.querySelector('#customer-name').value='Тест';document.querySelector('#customer-phone').value='123';document.querySelector('#request-form').requestSubmit();");
  assert.equal(await evaluate("document.querySelector('#request-dialog').open"), false);
  assert.equal(await evaluate("document.querySelector('#form-error').textContent.length > 0"), true);
  await evaluate("document.querySelector('#customer-phone').value='+7 900 000-00-00';document.querySelector('#request-form').requestSubmit();");
  assert.equal(await evaluate("document.querySelector('#request-dialog').open"), true);
  assert.equal(await evaluate("document.querySelector('#dialog-summary').textContent.includes('3 950')"), true);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#dialog-receipt dd')].map(el => Number(el.textContent.replace(/\\D/g, '')))"), [1600, 1400, 350, 600]);
  await evaluate("document.querySelector('#dialog-done').click();window.scrollTo({top:0,behavior:'instant'});");
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("window.scrollTo({top:0,behavior:'instant'});"); await waits(250);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Mobile overflow');
  const mobileReceiptClip = await evaluate("(() => {const r=document.querySelector('.estimate-card').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()");
  const mobileReceipt = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: mobileReceiptClip });
  await writeFile(path.join(artifacts, 'receipt-mobile.png'), Buffer.from(mobileReceipt.data, 'base64'));
  await evaluate("document.querySelector('.menu-toggle').click()");
  assert.equal(await evaluate("document.querySelector('.menu-toggle').getAttribute('aria-expanded')"), 'true');
  await evaluate("document.querySelector('#navigation a').click()");
  assert.equal(await evaluate("document.querySelector('.menu-toggle').getAttribute('aria-expanded')"), 'false');
  await evaluate("window.scrollTo({top:0,behavior:'instant'});"); await waits(200);
  const mobile = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 390, height: 1050, scale: 1 } });
  await writeFile(path.join(artifacts, 'mobile.png'), Buffer.from(mobile.data, 'base64'));

  // Follow real links between the two pages and exercise the shared form on the house page.
  await evaluate("document.querySelector('.property-tabs a[href=\"house.html\"]').click()");
  for (let n = 0; n < 50; n++) {
    if (await evaluate("location.pathname.endsWith('/house.html') && document.querySelector('#estimate-lines')?.children.length > 0")) break;
    await waits(100);
  }
  assert.equal(await evaluate('document.body.dataset.propertyLabel'), 'Частный дом');
  assert.equal(await evaluate("document.querySelector('#extra-balcony') === null && document.querySelector('#extra-porch') !== null && document.querySelector('#extra-terrace') !== null && document.querySelector('#extra-stairs') !== null"), true);
  assert.equal(await evaluate("document.querySelector('#area-number').max"), '1000');
  assert.equal(await evaluate("document.querySelector('.property-tabs [aria-current=page]').textContent.trim()"), 'Частные дома');
  assert.notEqual(await evaluate("getComputedStyle(document.body).getPropertyValue('--blue').trim()"), apartmentTheme);
  assert.equal(await evaluate("document.querySelector('.room-photo').getAttribute('src')"), 'assets/house-interior.png');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'House mobile overflow');
  assert.equal(await evaluate("document.querySelector('#window-count').value"), '1', 'Shared window selection survives page switch');
  assert.equal(await evaluate("document.querySelector('#oven').checked"), true);
  await evaluate("{const area=document.querySelector('#area-number');area.value='20';area.dispatchEvent(new Event('input'));const windows=document.querySelector('#window-count');windows.value='0';windows.dispatchEvent(new Event('input'));}");
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '3600');
  await evaluate("document.querySelector('#customer-name').value='Тест';document.querySelector('#customer-phone').value='+7 900 000-00-00';document.querySelector('#request-form').requestSubmit()");
  assert.equal(await evaluate("document.querySelector('#request-dialog').open"), true);
  assert.equal(await evaluate("document.querySelector('#dialog-summary').textContent.includes('Частный дом')"), true);
  await evaluate("document.querySelector('#dialog-done').click();window.scrollTo({top:0,behavior:'instant'});");
  await evaluate("for (const [id,value] of [['area-number',80],['window-count',2],['extra-porch',4],['extra-terrace',10],['extra-stairs',12]]) {const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input'));}");
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '9840');
  assert.equal(await evaluate("[...document.querySelectorAll('#estimate-lines dd')].reduce((sum,el)=>sum+Number(el.textContent.replace(/\\D/g,'')),0)"), 9840);
  await evaluate("{const input=document.querySelector('#extra-porch');input.value='1.25';input.dispatchEvent(new Event('input'));}");
  assert.equal(await evaluate("document.querySelector('#extra-porch').checkValidity()"), false, 'Extra-area precision is validated');
  await evaluate("{const input=document.querySelector('#extra-porch');input.value='4';input.dispatchEvent(new Event('input'));}");
  await waits(350);
  await evaluate("document.querySelector('.property-extras').scrollIntoView({block:'center',behavior:'instant'});");
  await waits(100);
  const objectControlsClip = await evaluate("(() => {const r=document.querySelector('.property-extras').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()");
  const objectControls = await send('Page.captureScreenshot', { format:'png',captureBeyondViewport:true,clip:objectControlsClip });
  await writeFile(path.join(artifacts,'house-object-controls.png'),Buffer.from(objectControls.data,'base64'));
  await evaluate("document.querySelector('.estimate-card').scrollIntoView({block:'center',behavior:'instant'});");
  await waits(100);
  const objectReceiptClip = await evaluate("(() => {const r=document.querySelector('.estimate-card').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()");
  const objectReceipt = await send('Page.captureScreenshot', { format:'png',captureBeyondViewport:true,clip:objectReceiptClip });
  await writeFile(path.join(artifacts,'house-object-receipt.png'),Buffer.from(objectReceipt.data,'base64'));
  await evaluate("window.scrollTo({top:0,behavior:'instant'});");
  await waits(350);
  const houseMobile = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 390, height: 1050, scale: 1 } });
  await writeFile(path.join(artifacts, 'house-mobile.png'), Buffer.from(houseMobile.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'House desktop overflow');
  const houseDesktop = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1440, height: 1050, scale: 1 } });
  await writeFile(path.join(artifacts, 'house-desktop.png'), Buffer.from(houseDesktop.data, 'base64'));
  await evaluate("document.querySelector('.property-tabs a[href=\"index.html\"]').click()");
  for (let n = 0; n < 50; n++) {
    if (await evaluate("location.pathname.endsWith('/index.html') && document.querySelector('#estimate-lines')?.children.length > 0")) break;
    await waits(100);
  }
  assert.equal(await evaluate('document.body.dataset.propertyLabel'), 'Квартира');
  assert.equal(await evaluate("document.querySelector('.property-tabs [aria-current=page]').textContent.trim()"), 'Квартиры');
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
  await waits(350);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Narrow mobile layout overflow');
  assert.equal(await evaluate("document.querySelector('#window-count').value"), '2');
  assert.equal(await evaluate("document.querySelector('#oven').checked"), true);
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"), '7700', 'House-only extras are not charged on apartment');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  const waitForPage = async (page) => {
    for (let n=0;n<60;n++) {
      if (await evaluate(`location.pathname.endsWith('/${page}') && document.querySelector('#estimate-lines')?.children.length > 0`)) { await waits(250); return; }
      await waits(100);
    }
    throw new Error(`Page did not load: ${page}`);
  };
  const mouseDrag = async (x,y,dx,dy=0) => {
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
    for(let step=1;step<=6;step++) {
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx*step/6,y:y+dy*step/6,button:'left',buttons:1});
      await waits(25);
    }
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+dx,y:y+dy,button:'left',buttons:0,clickCount:1});
    await waits(100);
  };
  await evaluate("{const input=document.querySelector('#extra-balcony');input.value='6';input.dispatchEvent(new Event('input'));document.querySelector('#pet-hair').click();const r=document.querySelector('.quantity-extras').getBoundingClientRect();scrollTo({top:r.top+scrollY-document.querySelector('.header').getBoundingClientRect().height,behavior:'instant'});}");
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"),'8920');
  const beforeSwitchTop=await evaluate("document.querySelector('.quantity-extras').getBoundingClientRect().top");
  assert.equal(await evaluate('scrollY > 500'),true);
  await evaluate("document.querySelector('.property-tabs a[href=\"house.html\"]').click()");
  await waitForPage('house.html');
  assert.ok(Math.abs(await evaluate("document.querySelector('.quantity-extras').getBoundingClientRect().top")-beforeSwitchTop)<6,'Tab click preserves the calculator section in the viewport');
  assert.equal(await evaluate("document.querySelector('#area-number').value"),'80');
  assert.equal(await evaluate("document.querySelector('#pet-hair').checked && document.querySelector('#oven').checked"),true);
  assert.equal(await evaluate("document.querySelector('#extra-stairs').value"),'12');
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"),'10340');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.decor-star')).pointerEvents"),'none');

  // Start in a real empty gutter while the calculator is on screen.
  const beforeDragTop=await evaluate("document.querySelector('.quantity-extras').getBoundingClientRect().top");
  await mouseDrag(1420,350,-240);
  await waitForPage('index.html');
  assert.ok(Math.abs(await evaluate("document.querySelector('.quantity-extras').getBoundingClientRect().top")-beforeDragTop)<6,'Mouse navigation preserves the calculator position');
  assert.equal(await evaluate("document.querySelector('#extra-balcony').value"),'6');
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"),'8920');
  await mouseDrag(20,350,240);
  await waitForPage('house.html');
  assert.equal(await evaluate("document.querySelector('#total-price').textContent.replace(/\\s/g, '')"),'10340');
  await mouseDrag(1420,350,-240);
  await waitForPage('index.html');
  const currentPath=await evaluate('location.pathname');
  await mouseDrag(20,350,40);
  assert.equal(await evaluate('location.pathname'),currentPath,'Short drags do not navigate');
  await mouseDrag(20,350,10,150);
  assert.equal(await evaluate('location.pathname'),currentPath,'Vertical drags do not navigate');

  await evaluate("document.querySelector('#area-range').scrollIntoView({block:'center',behavior:'instant'});");
  const slider=await evaluate("(() => {const r=document.querySelector('#area-range').getBoundingClientRect();return {x:r.left+r.width*.25,y:r.top+r.height/2};})()");
  const oldArea=await evaluate("document.querySelector('#area-number').value");
  await mouseDrag(slider.x,slider.y,110);
  assert.equal(await evaluate('location.pathname'),currentPath,'Dragging a calculator slider does not navigate');
  assert.notEqual(await evaluate("document.querySelector('#area-number').value"),oldArea,'The normal slider still responds');
  await evaluate("window.scrollTo({top:0,behavior:'instant'});");
  const heading=await evaluate("(() => {const node=document.querySelector('#hero-title').firstChild;const range=document.createRange();range.setStart(node,0);range.setEnd(node,1);const r=range.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()");
  await mouseDrag(heading.x,heading.y,150);
  assert.equal(await evaluate('location.pathname'),currentPath,'Text selection does not navigate');
  const selectionResult=await evaluate(`({text:getSelection().toString(),type:getSelection().type,dragging:document.body.classList.contains('is-page-dragging'),userSelect:getComputedStyle(document.querySelector('#hero-title')).userSelect,hit:document.elementFromPoint(${heading.x},${heading.y})?.tagName,top:scrollY})`);
  assert.ok(selectionResult.text.length>0,'Text remains selectable: '+JSON.stringify(selectionResult));
  await evaluate('getSelection().removeAllRanges()');
  assert.equal(await evaluate("document.body.classList.contains('is-page-dragging')"),false);
  // Extensions render their controls inside a shadow root; these clicks must stay intact.
  await evaluate(`(() => {const host=document.createElement('swarm-rebuild');host.style.cssText='position:fixed;inset:0;z-index:2147483647';const root=host.attachShadow({mode:'open'});const button=document.createElement('button');button.textContent='Tour';button.style.cssText='position:fixed;left:50px;top:150px;width:100px;height:40px';button.onclick=()=>button.textContent='Touring';root.append(button);document.documentElement.append(host);})()`);
  await mouseDrag(100,170,0);
  assert.equal(await evaluate("document.querySelector('swarm-rebuild').shadowRoot.querySelector('button').textContent"),'Touring','Shadow-root extension buttons remain clickable');
  await evaluate("document.querySelector('swarm-rebuild').remove()");
  await send('Page.navigate', {url: new URL('presentation.html',baseUrl).href});
  for(let n=0;n<100;n++){
    if(await evaluate("document.querySelector('#presentation-video')?.readyState >= 1")) break;
    await waits(100);
  }
  assert.equal(await evaluate("document.querySelector('#presentation-video').videoWidth"),1920);
  assert.equal(await evaluate("document.querySelector('#presentation-video').paused"),true,'Video does not autoplay');
  assert.equal(await evaluate("document.querySelector('#presentation-video').controls"),true);
  assert.ok(Math.abs(await evaluate("document.querySelector('#presentation-video').duration")-61.833)<.1);
  await evaluate("new Promise(resolve=>{const v=document.querySelector('#presentation-video');v.addEventListener('seeked',resolve,{once:true});v.currentTime=5;})");
  await evaluate("document.querySelector('#video-quality').value='media/legko-presentation-1440p.mp4';document.querySelector('#video-quality').dispatchEvent(new Event('change'));");
  for(let n=0;n<100;n++){
    if(await evaluate("document.querySelector('#presentation-video').videoWidth===2560 && document.querySelector('#presentation-video').currentTime>=4.9")) break;
    await waits(100);
  }
  assert.equal(await evaluate("document.querySelector('#presentation-video').videoWidth"),2560,'HQ video loads');
  const switchedTime=await evaluate("document.querySelector('#presentation-video').currentTime");
  assert.ok(Math.abs(switchedTime-5)<.1,`Quality switch retains time: ${switchedTime}`);
  await evaluate("document.querySelector('#presentation-video').muted=true;document.querySelector('#presentation-video').play()");
  await waits(500);
  assert.ok(await evaluate("document.querySelector('#presentation-video').currentTime")>5,'HQ video plays');
  await evaluate("document.querySelector('#presentation-video').pause()");
  for(const width of [1440,390,320]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
    await waits(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'Presentation has no horizontal overflow');
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await writeFile(path.join(artifacts,`presentation-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  await writeFile(path.join(artifacts, 'browser-check.json'), JSON.stringify({ passed: true, viewportWidths: [1440, 390, 320], pages: ['index.html', 'house.html'], singleApplianceToggles:true,petHairFee:true,mousePageDrag:true,scrollPositionPreserved:true,sharedSelectionsPreserved:true,objectExtrasRestored:true,textSelectionAndSliderUnaffected:true,decorationsIgnorePointer:true,differentThemesAndInteriors: true, windowsBeyondTen: true, reducedMotion: true, pointerEffects: finePointerActive, pageLinks: true, propertyInRequest: true, serviceCardRates: true, calculator: true, minimum: true, extras: true, formValidation: true, demoDialog: true, mobileMenu: true, noHorizontalOverflow: true, browserExceptions: errors }, null, 2));
  console.log('Browser checks passed: mouse page dragging and scroll/state restoration, safe text/slider interaction, single appliances, optional pet-hair fee, receipts, links/forms, themes and responsive layouts.');
  await send('Browser.close');
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: ++serial, method: 'Browser.close' }));
    await waits(100);
  }
  if (socket) socket.close();
  browser.kill();
}
