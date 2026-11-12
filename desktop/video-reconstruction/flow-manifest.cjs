// Pinned upstream sources and model manifests. See docs/flowhmr-integration.md.
const SOURCES=[
  {
    "file": "cache/FlowHMR-Windows.tar.gz",
    "url": "https://codeload.github.com/xiaoerofficial021-collab/FlowHMR-Windows/tar.gz/c3efad9d9028d6ab031a150a70476853e4ba3f41",
    "bytes": 12425111,
    "sha256": "b66bddc28e885f2f2515bd67e03dc51e072ae73004c3c84e77036f5b58cf04ff",
    "target": "repo"
  },
  {
    "file": "cache/YOLOX.tar.gz",
    "url": "https://codeload.github.com/Megvii-BaseDetection/YOLOX/tar.gz/6ddff4824372906469a7fae2dc3206c7aa4bbaee",
    "bytes": 4428383,
    "sha256": "103b59b2d679f2ab829e7f7bf348242c400efa925a4adb262cbf3dd375c4ec0c",
    "target": "repo/third_party/YOLOX"
  },
  {
    "file": "cache/sam-3d-body.tar.gz",
    "url": "https://codeload.github.com/facebookresearch/sam-3d-body/tar.gz/b5c765a0d89d789985e186d396315e7590887b94",
    "bytes": 23447682,
    "sha256": "71199eafd6c00598a57995af593778a5849f727a8d21dacecb3b563bea6e67b5",
    "target": "repo/third_party/sam-3d-body"
  },
  {
    "file": "cache/vggt-omega.tar.gz",
    "url": "https://codeload.github.com/facebookresearch/vggt-omega/tar.gz/48b23c8ce72c9a8fcf987f0d7f43d8e4870759f6",
    "bytes": 44143006,
    "sha256": "7ee9d87cb0ab0efc42d9092332d3e0809ef379bafe2c7c293354378a5657793c",
    "target": "repo/third_party/vggt-omega"
  },
  {
    "file": "cache/dinov3.tar.gz",
    "url": "https://codeload.github.com/facebookresearch/dinov3/tar.gz/6876159a11b4df116f30f667f8c9888617df0751",
    "bytes": 13333605,
    "sha256": "94da41da596633a73619078bb3bbde64ff3be95c55e8658638fa57c542cc4fe7",
    "target": "repo/third_party/dinov3"
  }
];
const MODELS=[
  {
    "file": "models/flowhmr_latest/config.yml",
    "url": "https://huggingface.co/fafsaf1/flowhmr-0.46B/resolve/1eb105e554e0cfc1846ea5feac8c2d516a36d319/flowhmr_latest/config.yml",
    "bytes": 3067,
    "sha256": "5deae01800c031975558bf9675819e8d1e24803414f692b8b5c2196b266c64d7"
  },
  {
    "file": "models/flowhmr_latest/flowhmr_latest.ckpt",
    "url": "https://huggingface.co/fafsaf1/flowhmr-0.46B/resolve/1eb105e554e0cfc1846ea5feac8c2d516a36d319/flowhmr_latest/flowhmr_latest.ckpt",
    "bytes": 1841702021,
    "sha256": "b7eb06b119feaf5ad7287bafdb2fff38d42dfc22ea9d256f8cdd2ada26dfc53a"
  },
  {
    "file": "models/yolox/yolox_l.pth",
    "url": "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_l.pth",
    "bytes": 434357141,
    "sha256": "1e6b7fa6240375370b2a8a8eab9066b3cdd43fd1d0bfa8d2027fd3a51def2917"
  },
  {
    "file": "models/sam-3d-body-dinov3/model.ckpt",
    "url": "https://www.modelscope.cn/models/facebook/sam-3d-body-dinov3/resolve/master/model.ckpt",
    "bytes": 2109129346,
    "sha256": "b5a2f9d305dd02626b967aa2e86021fba07065df66ce7a7e00ffb9664f150abf"
  },
  {
    "file": "models/sam-3d-body-dinov3/model_config.yaml",
    "url": "https://www.modelscope.cn/models/facebook/sam-3d-body-dinov3/resolve/master/model_config.yaml",
    "bytes": 1488,
    "sha256": "1012fc3f39cb5e90e3f8fbadf7bded31604bfafdce0321d17a7c1a2d3f08b88d"
  },
  {
    "file": "models/sam-3d-body-dinov3/assets/mhr_model.pt",
    "url": "https://www.modelscope.cn/models/facebook/sam-3d-body-dinov3/resolve/master/assets/mhr_model.pt",
    "bytes": 696110248,
    "sha256": "352e271a6c42729c68554ceaea0c955e866970160c31e35506d782dc0f7377bc"
  },
  {
    "file": "models/vggt-omega/vggt_omega_1b_512.pt",
    "url": "https://www.modelscope.cn/models/facebook/VGGT-Omega/resolve/master/vggt_omega_1b_512.pt",
    "bytes": 4576706117,
    "sha256": "c02da418b18bb01d0392598d3f6147366bcde1bb70fd08a5e3bf7925b0667934"
  },
  {
    "file": "models/body_models/smpl_neutral_J_regressor.pt",
    "url": "https://raw.githubusercontent.com/zju3dv/GVHMR/main/hmr4d/utils/body_model/smpl_neutral_J_regressor.pt",
    "bytes": 662187,
    "sha256": "70e3213bd30fe8d8ce37b54675282745e406f915a51511a003aeff99b6da04cf"
  }
];
const VERSION="flowhmr-c3efad9-native-1";
const MODEL={name:"FlowHMR",bytes:MODELS.reduce((n,f)=>n+f.bytes,0),sourceUrl:"https://github.com/flowhmr/flowhmr",licenseUrl:"https://huggingface.co/fafsaf1/flowhmr-0.46B/blob/main/LICENSE",bodyUrl:"https://mano.is.tue.mpg.de/download.php"};
module.exports={SOURCES,MODELS,VERSION,MODEL};
