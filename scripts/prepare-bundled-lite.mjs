import fs from 'node:fs/promises';
import path from 'node:path';
import {FILES,ready} from '../desktop/video-reconstruction/lite-runtime.cjs';
import {downloadFile} from '../desktop/video-reconstruction/download.cjs';

// Keep build downloads out of source and copy only the pinned, verified payload.
export async function prepareBundledLite(destination,{cache=path.resolve('tmp/build-downloads/mediapipe'),fetch:fetcher=fetch}={}){
    for(const item of FILES){
        const source=await downloadFile(item,cache,{fetch:fetcher});
        const target=path.join(destination,item.file);
        await fs.mkdir(path.dirname(target),{recursive:true});
        await fs.copyFile(source,target);
    }
    if(!await ready(destination))throw Error('Bundled lightweight recognition verification failed');
    console.log('Prepared bundled lightweight recognition (verified offline assets).');
}
