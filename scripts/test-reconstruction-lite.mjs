import {_electron as electron} from 'playwright-core';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('tmp/mediapipe-lite-test-20261110/integration');await fs.mkdir(root,{recursive:true});
const profile=process.env.DIRECTOR_LITE_PROFILE||await fs.mkdtemp(path.join(root,'profile-')),payload=path.resolve('.audit/desktop-app'),harness=path.join(root,'hidden.cjs');
await fs.writeFile(harness,`const {app,BrowserWindow}=require('electron');app.setAppPath(${JSON.stringify(payload)});BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.focus=function(){};require(${JSON.stringify(path.join(payload,'desktop/main.cjs'))});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let app;const errors=[];
try{
 app=await electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:[harness,`--director-test-profile=${profile}`],env});
 const page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#timeline-content .track-lane').first().waitFor();
 const call=async(action,data)=>{const r=await page.evaluate(({action,data})=>window.directorDesktop.reconstruction(action,data),{action,data});assert.equal(r.ok,true,r.error);return r.data;};
 await page.locator('.application-menu [data-act=video-reconstruction]').click();
 assert.equal(await page.locator('#recon-engine').inputValue(),'mediapipe');await page.waitForFunction(()=>document.querySelector('#recon-engine')?.value==='mediapipe'&&!document.querySelector('#recon-engine').disabled);
 assert.equal((await call('state')).engine,'mediapipe');assert.equal((await call('state')).accepted,true);
 assert.equal(await page.locator('#recon-content').isVisible(),false);assert.equal(await page.locator('#recon-people-count').isVisible(),true);
 await page.locator('#recon-configure').click();await page.locator('.reconstruction-settings-modal').waitFor();
 assert.equal(await page.locator('#recon-license').isVisible(),false);
 assert.equal(await page.locator('#recon-standard').isVisible(),false);
 assert.match(await page.locator('#recon-settings-engine option[value=mediapipe]').textContent(),/简易识别（默认）/);
 await page.locator('#recon-settings-engine').selectOption('human3r');
 await page.waitForFunction(()=>document.querySelector('#recon-settings-engine')?.value==='human3r'&&!document.querySelector('#recon-settings-engine').disabled);
 assert.equal(await page.locator('#recon-lite').isVisible(),false);assert.equal(await page.locator('#recon-standard').isVisible(),true);
 assert.equal(await page.locator('#recon-accept').isDisabled(),true);
 await page.locator('#recon-consent').check();assert.equal(await page.locator('#recon-accept').isEnabled(),true);
 await page.locator('#recon-consent').uncheck();assert.equal(await page.locator('#recon-accept').isDisabled(),true);
 await app.evaluate(({shell})=>{globalThis.testModelLinks=[];shell.openExternal=async url=>{globalThis.testModelLinks.push(url);};});
 await page.locator('[data-model-page=project-page][data-engine=human3r]').click();
 await page.locator('[data-model-page=license-page][data-engine=human3r]').click();
 assert.equal((await call('state')).engine,'human3r');
 await page.screenshot({path:path.join(root,'standard-settings.png')});
 await page.locator('#recon-settings-engine').selectOption('mediapipe');
 await page.waitForFunction(()=>document.querySelector('#recon-settings-engine')?.value==='mediapipe'&&!document.querySelector('#recon-settings-engine').disabled);
 assert.equal(await page.locator('#recon-standard').isVisible(),false);
 await page.locator('[data-model-page=project-page][data-engine=mediapipe]').click();
 const links=await app.evaluate(()=>globalThis.testModelLinks);
 assert.match(links[0],/fanegg\/Human3R/);assert.match(links[1],/Human3R.*LICENSE/);assert.match(links[2],/mediapipe/);
 assert.equal((await call('state')).engine,'mediapipe','selected mode persists');

 if(!(await call('state')).ready)await page.locator('#recon-lite-download').click();
 let state;
 for(let i=0;i<240;i++){state=await call('state');if(state.job&&state.job.status!=='running')break;if(i%10===0)console.log('download',state.job?.message,state.job?.downloadFile,state.job?.progress);await page.waitForTimeout(1000);}
 assert.equal(state.ready,true,JSON.stringify(state.job));
 await page.waitForFunction(()=>document.querySelector('#recon-settings-engine option[value=mediapipe]')?.textContent.includes('已安装'));
 assert.doesNotMatch(await page.locator('#recon-settings-engine option[value=human3r]').textContent(),/已安装/);
 await page.screenshot({path:path.join(root,'lite-settings.png')});
 await page.locator('.modal [data-act=close-modal]').last().click();
 if(process.env.DIRECTOR_LITE_SETTINGS_ONLY){assert.deepEqual(errors,[]);console.log('PASS settings dropdown, selected details, installation label, consent and source links');await app.evaluate(({app})=>app.exit(0));process.exit(0);}
 const source=path.resolve(process.env.DIRECTOR_LITE_VIDEO||'tmp/mediapipe-lite-test-20261110/sample.mp4');
 await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},source);
 await page.locator('#recon-choose').click();await page.waitForFunction(()=>document.querySelector('#recon-video-player')?.readyState>=2);
 // Cancellation must release the worker and allow another conversion immediately.
 await page.locator('#recon-run').click();await page.locator('#recon-cancel').waitFor();await page.locator('#recon-cancel').click();
 for(let i=0;i<60;i++){state=await call('state');if(state.job.status!=='running')break;await page.waitForTimeout(100);}
 assert.equal(state.job.status,'cancelled');await page.waitForFunction(()=>!document.querySelector('#recon-run').disabled);
 const previousJob=state.job.id;await page.locator('#recon-run').click();let previewSeen=false;
 for(let i=0;i<120;i++){state=await call('state');if(state.job?.id!==previousJob&&state.job?.kind==='convert'&&state.job.status!=='running')break;previewSeen ||= state.job?.id!==previousJob&&!!(await call('preview'));if(i%5===0)console.log('analysis',state.job?.message,state.job?.progress);await page.waitForTimeout(500);}
 assert.equal(state.job.status,'completed',JSON.stringify(state.job));assert.ok(previewSeen,'live preview produced');
 await page.locator('#recon-open').waitFor();await page.waitForFunction(()=>!document.querySelector('#recon-open').disabled);
 assert.equal(await page.locator('#recon-error').innerText(),'');
 const slider=page.locator('[data-result-time]');await slider.fill('2.5');await slider.dispatchEvent('input');await page.waitForTimeout(800);
 await page.screenshot({path:path.join(root,'result.png')});
 await page.locator('[data-result-model]').first().selectOption('human-female');await page.waitForTimeout(500);assert.equal(await page.locator('#recon-error').innerText(),'');
 await page.locator('#recon-open').click();
 if(await page.locator('#recon-discard').isVisible())await page.locator('#recon-discard').click();
 await page.waitForFunction(()=>!document.querySelector('.reconstruction-workspace'));
 await page.screenshot({path:path.join(root,'editor.png')});
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify({profile,source,state,errors,previewSeen},null,2));console.log('PASS',state.job.file);
}finally{if(app)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
