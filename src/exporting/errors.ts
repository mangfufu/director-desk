export function exportErrorMessage(error: unknown): string {
    const name = (error as Error)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError')
        return '无法写入，请重新选择保存位置。';
    if (name === 'NoModificationAllowedError') return '文件正被其他程序使用，请关闭后重试或更换文件名。';
    if (name === 'NotFoundError') return '保存位置不可用，请重新选择文件夹。';
    return error instanceof Error ? error.message : String(error);
}
