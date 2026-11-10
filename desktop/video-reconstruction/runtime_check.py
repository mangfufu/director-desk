"""Exercise the CUDA operations used by reconstruction before loading weights."""

def verify_gpu():
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError('无法使用 NVIDIA 显卡，请安装或更新显卡驱动后重试')
    name = torch.cuda.get_device_name(0)
    capability = torch.cuda.get_device_capability(0)
    cuda = tuple(int(part) for part in (torch.version.cuda or '0.0').split('.')[:2])
    version = tuple(int(part) for part in torch.__version__.split('+')[0].split('.')[:2])
    print(f'GPU: {name}; capability: {capability}; PyTorch: {torch.__version__}; CUDA: {torch.version.cuda}', flush=True)
    if capability[0] >= 10 and (cuda < (12, 8) or version < (2, 7)):
        raise RuntimeError('当前运行环境不支持此显卡，请更新导演台并重新配置视频反推')
    try:
        # A successful device query does not prove that kernels support this GPU.
        image = torch.arange(12, device='cuda', dtype=torch.float32).reshape(1, 3, 2, 2)
        mask = torch.tensor([True]).to('cuda', non_blocking=True)
        selected = image[mask]
        if selected.shape != image.shape or not torch.equal(selected, image):
            raise RuntimeError('图像选择运算结果异常')
        a = torch.ones((32, 32), device='cuda')
        if not torch.all(a @ a == 32).item():
            raise RuntimeError('矩阵运算结果异常')
        torch.cuda.synchronize()
    except RuntimeError as error:
        raise RuntimeError('显卡运算检查失败，请更新显卡驱动并重新配置视频反推。' + str(error)) from error
    print('GPU computation verified', flush=True)


if __name__ == '__main__':
    import cv2, transformers, scipy, smplx
    verify_gpu()
