import test from 'node:test';
import assert from 'node:assert/strict';
import { englishText, t, getLanguage, setLanguage, onLanguageChange } from '../src/i18n/locale.ts';

test('language choice is explicit, reversible and does not translate unknown text', () => {
    let changes=0;const unsubscribe=onLanguageChange(()=>changes++);
    setLanguage('en');assert.equal(t('保存'),'Save');assert.equal(getLanguage(),'en');
    setLanguage('invalid');assert.equal(getLanguage(),'en');assert.equal(changes,1);
    assert.equal(t('角色甲说：“保存这个秘密。”'),'角色甲说：“保存这个秘密。”');
    setLanguage('zh-CN');assert.equal(t('保存'),'保存');unsubscribe();
});
test('dynamic labels preserve names, whitespace and literal replacement characters', () => {
    assert.equal(englishText('  当前戏段 · $&保存  '),'  Current Scene · $&保存  ');
    assert.equal(englishText('1 个视频 · 共 15.00 s'),'1 video · 15.00 s total');
    assert.equal(englishText('主体宽度 / m'),'Body Width (m)');
    assert.equal(englishText('内置 / 回旋踢'),'Built-in / Roundhouse Kick');
});
