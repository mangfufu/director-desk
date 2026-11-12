export function initialLanguage(saved:unknown,locale:unknown):'zh-CN'|'en'{
    if(saved==='zh-CN'||saved==='en')return saved;
    return typeof locale==='string'&&/^zh(?:[-_@.]|$)/i.test(locale.trim())?'zh-CN':'en';
}
export function desktopLanguage(env:Record<string,string|undefined>,fallback:string):'zh-CN'|'en'{
    const locale=[env.LC_ALL,env.LC_MESSAGES,env.LANG,fallback].find(value=>value?.trim());
    return initialLanguage(undefined,locale);
}
