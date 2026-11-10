"""CPU-only checks for early CUDA compatibility errors; GPU smoke runs separately."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('runtime_check', Path(__file__).resolve().parents[1] / 'desktop/video-reconstruction/runtime_check.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class RuntimeCheckTests(unittest.TestCase):
    def gpu(self, capability=(12, 0), cuda='12.8', version='2.7.1+cu128'):
        torch = MagicMock()
        torch.__version__ = version
        torch.version.cuda = cuda
        torch.cuda.is_available.return_value = True
        torch.cuda.get_device_name.return_value = 'Test GPU'
        torch.cuda.get_device_capability.return_value = capability
        image = torch.arange.return_value.reshape.return_value
        image.shape = (1, 3, 2, 2)
        image.__getitem__.return_value.shape = image.shape
        torch.equal.return_value = True
        torch.all.return_value.item.return_value = True
        return torch

    def test_old_runtime_rejected_before_blackwell_inference(self):
        for cuda, version in [('12.4', '2.5.1+cu124'), ('12.8', '2.5.1'), ('12.4', '2.7.1')]:
            with self.subTest(cuda=cuda, version=version):
                torch = self.gpu(cuda=cuda, version=version)
                with patch.dict(sys.modules, {'torch': torch}), self.assertRaisesRegex(RuntimeError, '当前运行环境不支持此显卡'):
                    runtime.verify_gpu()
                torch.arange.assert_not_called()

    def test_device_detection_alone_is_not_success(self):
        torch = self.gpu()
        torch.arange.side_effect = RuntimeError('no kernel image is available')
        with patch.dict(sys.modules, {'torch': torch}), self.assertRaisesRegex(RuntimeError, '显卡运算检查失败.*no kernel image'):
            runtime.verify_gpu()

    def test_empty_image_selection_rejected(self):
        torch = self.gpu()
        torch.arange.return_value.reshape.return_value.__getitem__.return_value.shape = (0, 3, 2, 2)
        with patch.dict(sys.modules, {'torch': torch}), self.assertRaisesRegex(RuntimeError, '图像选择运算结果异常'):
            runtime.verify_gpu()

    def test_matrix_result_rejected(self):
        torch = self.gpu()
        torch.all.return_value.item.return_value = False
        with patch.dict(sys.modules, {'torch': torch}), self.assertRaisesRegex(RuntimeError, '矩阵运算结果异常'):
            runtime.verify_gpu()

    def test_success_requires_cuda_synchronization(self):
        for capability in [(8, 9), (12, 0)]:
            torch = self.gpu(capability=capability)
            with patch.dict(sys.modules, {'torch': torch}):
                runtime.verify_gpu()
            torch.cuda.synchronize.assert_called_once()

    def test_missing_driver(self):
        torch = self.gpu()
        torch.cuda.is_available.return_value = False
        with patch.dict(sys.modules, {'torch': torch}), self.assertRaisesRegex(RuntimeError, '无法使用 NVIDIA'):
            runtime.verify_gpu()


if __name__ == '__main__':
    unittest.main()
