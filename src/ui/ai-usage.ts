export function aiUsageText(usage: unknown) {
    if (!usage || typeof usage !== 'object') return '本轮用量未提供';
    const data = usage as Record<string, unknown>;
    const number = (...keys: string[]) => keys.map(key => data[key]).find(value => typeof value === 'number' && Number.isFinite(value) && value >= 0) as number | undefined;
    const input = number('input_tokens', 'prompt_tokens'), output = number('output_tokens', 'completion_tokens'), total = number('total_tokens');
    const parts = [input === undefined ? '' : `输入 ${input.toLocaleString()}`, output === undefined ? '' : `输出 ${output.toLocaleString()}`].filter(Boolean);
    if (!parts.length && total !== undefined) parts.push(`共 ${total.toLocaleString()}`);
    return parts.length ? '本轮用量：' + parts.join(' · ') + ' tokens' : '本轮用量未提供';
}
