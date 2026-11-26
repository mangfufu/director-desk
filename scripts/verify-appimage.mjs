import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {_electron as electron} from 'playwright-core';

assert.equal(process.platform,'linux','Run under Linux/Xvfb.');
const executablePath=path.resolve(process.argv[2]??'release/linux-unpacked/DirectorDesk');
const output=path.resolve(process.env.DIRECTOR_CHECK_OUTPUT??'tmp/appimage-check');
await fs.mkdir(output,{recursive:true});
const profile=await fs.mkdtemp(path.join(output,'profile-'));
const env={...process.env,LANG:'C',LC_ALL:'C',XDG_CONFIG_HOME:profile};
delete env.ELECTRON_RUN_AS_NODE;
// Exercise the same software graphics backend used by the installed fallback.
const started=Date.now();
const app=await electron.launch({executablePath,env,args:[`--user-data-dir=${profile}`,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
    const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',()=>{});
    await page.locator('#timeline-content .track-lane').first().waitFor({timeout:45000});
    await page.waitForFunction(()=>{const canvas=document.querySelector('#stage-canvas canvas');return canvas?.width>0&&canvas?.height>0;});
    assert.equal(await page.locator('#startup-error').count(),0);
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    const editorReadyMs=Date.now()-started;
    // The catalog waits ten seconds, then fits the window into an 800×600 screen.
    await page.waitForTimeout(Math.max(0,10000-(Date.now()-started)));
    const windowId=execFileSync('xdotool',['getactivewindow'],{encoding:'utf8'}).trim();
    execFileSync('xdotool',['windowmove',windowId,'0','0']);
    execFileSync('xdotool',['windowsize',windowId,'796','570']);
    await page.waitForTimeout(1000);
    await page.screenshot({path:path.join(output,'editor.png')});
    execFileSync('import',['-window','root',path.join(output,'screen.png')]);
    // Confirm actual 3D pixels, not only a visible shell around an empty canvas.
    const graphics=await page.evaluate(()=>{
        const canvas=document.querySelector('#stage-canvas canvas');
        const copy=document.createElement('canvas');copy.width=64;copy.height=64;
        const context=copy.getContext('2d');context.drawImage(canvas,0,0,64,64);
        const pixels=context.getImageData(0,0,64,64).data,colors=new Set();
        for(let i=0;i<pixels.length;i+=4)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
        const gl=canvas.getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');
        return {colors:colors.size,renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
    });
    assert.ok(graphics.colors>20,`3D view contains only ${graphics.colors} colors`);
    await page.locator('.application-menu [data-act=video-reconstruction]').click();
    await page.locator('#recon-choose').waitFor();
    assert.deepEqual(errors,[]);
    const result={executablePath,editorReadyMs,graphics,gpu:await app.evaluate(({app})=>app.getGPUFeatureStatus()),errors};
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));
    console.log('PASS: Linux package with software rendering, English UI and rendered scene',JSON.stringify(result));
} finally {
    await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});
    await fs.rm(profile,{recursive:true,force:true});
}
