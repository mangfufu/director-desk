const path=require('node:path');
function defaultRuntimeRoot({packaged,executable,userDirectory,env=process.env,platform=process.platform}){
    // Dev payloads are rebuilt in place; keep their data outside the build tree.
    if(!packaged)return path.join(userDirectory,'video-reconstruction','runtime');
    const paths=platform==='win32'?path.win32:path.posix;
    const portable=platform==='win32'?env.PORTABLE_EXECUTABLE_DIR:undefined;
    const appImage=platform==='linux'?env.APPIMAGE:undefined;
    const directory=portable&&paths.isAbsolute(portable)?portable:paths.dirname(appImage&&paths.isAbsolute(appImage)?appImage:executable);
    return paths.join(directory,'video-reconstruction');
}
module.exports={defaultRuntimeRoot};
