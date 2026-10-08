type FileAction = Parameters<NonNullable<NonNullable<Window['directorDesktop']>['files']>>[0];
export async function desktopFile(action: FileAction, data?: unknown) {
    if (!window.directorDesktop?.files) throw Error('按路径读写需要桌面版；浏览器请使用导入／下载');
    const result = await window.directorDesktop.files(action, data);
    if (!result.ok || !result.data) throw Error(result.error || '文件操作失败');
    return result.data;
}
export interface FileDestination { path?: string; directory?: string; filename?: string; overwrite?: boolean }
export async function openOutput(destination: FileDestination, name: string, kind: string) {
    if (destination.path && (destination.directory || destination.filename)) throw Error('path 与 directory/filename 不能同时使用');
    const extension = name.match(/\.[^.]+$/)?.[0]?.toLowerCase();
    const target = destination.path ?? destination.filename;
    if (target && target.match(/\.[^.\\/]+$/)?.[0]?.toLowerCase() !== extension) throw Error('输出文件扩展名与所选格式不符');
    const result = await desktopFile('automation-write-begin', { ...destination, name: destination.filename ?? name, kind });
    const id = result.id!, output = { saved: false, path: result.path!, filename: result.filename! };
    let ended = false, position = 0;
    const abort = async () => { if (!ended) { ended = true; await desktopFile('automation-write-abort', { id }); } };
    const write = async (data: Uint8Array, at = position) => {
        for (let offset = 0; offset < data.byteLength; offset += 4 * 1024 * 1024) {
            const bytes = data.subarray(offset, offset + 4 * 1024 * 1024);
            await desktopFile('automation-write-chunk', { id, bytes, position: at + offset });
        }
        position = at + data.byteLength;
    };
    const close = async () => {
        const completed = await desktopFile('automation-write-close', { id }); ended = true;
        if (!completed.saved) throw Error('文件未保存'); output.saved = true;
    };
    return { output, abort,
        async blob(blob: Blob, signal: AbortSignal) {
            const reader = blob.stream().getReader();
            try { while (true) { signal.throwIfAborted(); const item = await reader.read(); if (item.done) break; await write(item.value); } signal.throwIfAborted(); await close(); return output; }
            catch (error) { await abort(); throw error; }
            finally { await reader.cancel(); reader.releaseLock(); }
        },
        // Mediabunny writes {data, position} records to a WritableStream; offsets support MP4 header updates.
        handle: { name: output.filename, createWritable: async () => new WritableStream<{ data: Uint8Array; position: number }>({
            write: chunk => write(chunk.data, chunk.position), close, abort,
        }) } as unknown as FileSystemFileHandle,
    };
}
