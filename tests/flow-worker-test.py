"""Adapter-only synthetic tests; no body model, weights or inference claims."""
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile
import numpy as np

spec = importlib.util.spec_from_file_location('flow_worker', Path(__file__).resolve().parents[1] / 'desktop/video-reconstruction/flow-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def body_bytes(betas=16):
    buffer = io.BytesIO()
    np.savez(buffer, v_template=np.zeros((3, 3)), kintree_table=np.array([-1]+[0]*51),
             shapedirs=np.zeros((3, 3, betas)), J_regressor=np.zeros((52, 3)), weights=np.zeros((3, 52)),
             posedirs=np.zeros((3, 3, 459)), f=np.array([[0, 1, 2]]))
    return buffer.getvalue()


class BodyImport(unittest.TestCase):
    def test_imports_archive_and_direct_npz_without_extracting_other_files(self):
        base = Path(__file__).resolve().parents[1] / 'tmp/flowhmr-integration/tests'
        base.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as folder:
            folder = Path(folder)
            expected = body_bytes()
            destination = folder / 'models/neutral/model.npz'
            for suffix in ['npz', 'tar.xz', 'zip']:
                source = folder / ('source.' + suffix)
                if suffix == 'npz':
                    source.write_bytes(expected)
                elif suffix == 'zip':
                    with zipfile.ZipFile(source, 'w') as archive:
                        archive.writestr('smplh/neutral/model.npz', expected)
                        archive.writestr('../../should-not-exist', b'not extracted')
                else:
                    with tarfile.open(source, 'w:xz') as archive:
                        member = tarfile.TarInfo('smplh/neutral/model.npz'); member.size = len(expected)
                        archive.addfile(member, io.BytesIO(expected))
                worker.import_body(source, destination)
                self.assertEqual(destination.read_bytes(), expected)
                self.assertFalse((base / 'should-not-exist').exists())
            source.write_bytes(b'invalid')
            with self.assertRaises(Exception):
                worker.import_body(source, destination)
            self.assertEqual(destination.read_bytes(), expected)
            self.assertFalse(destination.with_suffix('.npz.part').exists())
            wrong = folder / 'wrong.npz'; wrong.write_bytes(body_bytes(10))
            with self.assertRaisesRegex(ValueError, '16'):
                worker.import_body(wrong, destination)

    def test_forward_kinematics_rotates_child_around_parent_and_preserves_root_translation(self):
        rest = [[0., 0., 0.], [1., 0., 0.]] + [[1., 1., 0.]]*50
        identity = [0, 0, 0, 1]
        q = [0, 0, np.sin(np.pi/4), np.cos(np.pi/4)]
        joints = worker.fk(dict(rest=rest, parents=[-1, 0]+[1]*50,
                                translations=[[2, 3, 4]], rotations=[[q]+[identity]*51]))
        np.testing.assert_allclose(joints[0, 0], [2, 3, 4], atol=1e-6)
        np.testing.assert_allclose(joints[0, 1], [2, 4, 4], atol=1e-6)
        np.testing.assert_allclose(joints[0, 2], [1, 4, 4], atol=1e-6)


if __name__ == '__main__':
    unittest.main()
