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
    win32:[['torch','2.5.1','win_amd64',2510680879,'3c3f705fb125edbd77f9579fa11a138c56af8968a10fc95834cdd9fdf4f1f1a6'],['torchvision','0.20.1','win_amd64',6143050,'0f6c7b3b0e13663fb3359e64f3604c0ab74c2b4809ae6949ace5635a5240f0e5']],
    linux:[['torch','2.5.1','linux_x86_64',908202405,'bf6484bfe5bc4f92a4a1a1bf553041505e19a911f717065330eb061afe0e14d7'],['torchvision','0.20.1','linux_x86_64',7287066,'d1053ec5054549e7dac2613b151bffe323f3c924939d296df4d7d34925aaf3ad']],
};
for(const platform of Object.keys(TORCH_WHEELS))TORCH_WHEELS[platform]=TORCH_WHEELS[platform].map(([name,version,target,bytes,sha256])=>{
    const filename=`${name}-${version}+cu124-cp312-cp312-${target}.whl`;
    return {file:`cache/wheels/${filename}`,url:`https://download.pytorch.org/whl/cu124/${filename.replace('+','%2B')}`,bytes,sha256};
});
module.exports={MODEL,DOWNLOADS,WINDOWS_UV,TORCH_WHEELS,RUNTIME_VERSION:'human3r-672s-native-2'};
