import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialLanguage,desktopLanguage} from '../src/i18n/initial-language.ts';
test('Chinese system locales use Chinese; all other locales use English',()=>{
    for(const locale of ['zh','zh-CN','zh_TW.UTF-8','zh-Hant-HK',' zh_CN@modifier '])assert.equal(initialLanguage(null,locale),'zh-CN');
    for(const locale of ['en-US','fr_FR.UTF-8','ja-JP','C','POSIX','',undefined])assert.equal(initialLanguage(null,locale),'en');
});
test('saved choices override the system locale in both directions',()=>{
    assert.equal(initialLanguage('zh-CN','en-US'),'zh-CN');assert.equal(initialLanguage('en','zh-CN'),'en');
    assert.equal(initialLanguage('invalid','en-US'),'en');assert.equal(initialLanguage('invalid','zh-CN'),'zh-CN');
});
test('Linux message locale follows LC_ALL, LC_MESSAGES, LANG, then Electron locale',()=>{
    assert.equal(desktopLanguage({LC_ALL:'C',LC_MESSAGES:'zh_CN.UTF-8',LANG:'zh_CN.UTF-8'},'zh-CN'),'en');
    assert.equal(desktopLanguage({LC_ALL:'',LC_MESSAGES:'zh_TW.UTF-8',LANG:'en_US.UTF-8'},'en'),'zh-CN');
    assert.equal(desktopLanguage({LANG:'de_DE.UTF-8'},'zh-CN'),'en');
    assert.equal(desktopLanguage({},'zh-CN'),'zh-CN');
});
