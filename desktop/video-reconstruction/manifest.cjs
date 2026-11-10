const MODEL = {
    name: 'Human3R-672S', version: '1902f6b702547870994f15413ed4c61b19dca6b6',
    url: 'https://huggingface.co/faneggg/human3r/resolve/1902f6b702547870994f15413ed4c61b19dca6b6/human3r_672S.pth',
    sha256: '84d2a70386473b58b90eef8f78521065ad10908bab647ee58d1196f5018fb778', bytes: 3392703046,
    licenseUrl: 'https://github.com/fanegg/Human3R/blob/402f2b2c7f20514e99cb42e4126c46b4ff75593f/LICENSE',
    sourceUrl: 'https://github.com/fanegg/Human3R',
};
const DOWNLOADS = [
    {file:'models/human3r_672S.pth',url:MODEL.url,sha256:MODEL.sha256,bytes:MODEL.bytes},
    {file:'cache/human3r.tar.gz',url:'https://codeload.github.com/fanegg/Human3R/tar.gz/402f2b2c7f20514e99cb42e4126c46b4ff75593f',bytes:4962416,sha256:'84bfc3c183d690b11efae4aa777f71a87dfa65dc4faf576c5cb4b98d774b629f'},
    {file:'cache/dinov2.tar.gz',url:'https://codeload.github.com/facebookresearch/dinov2/tar.gz/7764ea0f912e53c92e82eb78a2a1631e92725fc8',bytes:2869642,sha256:'c27dcdaf50e9fb5bbdf2bb529da357716372e19c6afab17d5350f3f0094aed4b'},
    {file:'cache/uv-linux.tar.gz',url:'https://github.com/astral-sh/uv/releases/download/0.9.9/uv-x86_64-unknown-linux-gnu.tar.gz',bytes:21323902,sha256:'9ec303873e00deed44d1b2b52b85ab7aa55d849588d7242298748390eaea07ef'},
];
const WINDOWS_UV={file:'cache/uv-windows.zip',url:'https://github.com/astral-sh/uv/releases/download/0.9.9/uv-x86_64-pc-windows-msvc.zip',sha256:'b1c5d78c5cb6804e556e07eeafbcdea7378107c2bd5c342dea0cdc05a607d8e5'};
const TORCH_WHEELS={
    win32:[['torch','2.7.1','win_amd64',3273024349,'2bb8c05d48ba815b316879a18195d53a6472a03e297d971e916753f8e1053d30'],['torchvision','0.22.1','win_amd64',7638377,'650561ba326d21021243f5e064133dc62dc64d52f79623db5cd76637a9665f96']],
    linux:[['torch','2.7.1','manylinux_2_28_x86_64',1039245529,'0b64f7d0a6f2a739ed052ba959f7b67c677028c9566ce51997f9f90fe573ddaa'],['torchvision','0.22.1','manylinux_2_28_x86_64',8730624,'f64ef9bb91d71ab35d8384912a19f7419e35928685bc67544d58f45148334373']],
};
for(const platform of Object.keys(TORCH_WHEELS))TORCH_WHEELS[platform]=TORCH_WHEELS[platform].map(([name,version,target,bytes,sha256])=>{
    const filename=`${name}-${version}+cu128-cp312-cp312-${target}.whl`;
    return {file:`cache/wheels/${filename}`,url:`https://download.pytorch.org/whl/cu128/${filename.replace('+','%2B')}`,bytes,sha256};
});
module.exports={MODEL,DOWNLOADS,WINDOWS_UV,TORCH_WHEELS,RUNTIME_VERSION:'human3r-672s-native-3'};
