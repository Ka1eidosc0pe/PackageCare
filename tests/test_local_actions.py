"""Consequential action-scope and numerical-output guards; no ML dependencies."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import uuid

from experiments.local_cv.action_model import prepare, summarize
from experiments.local_cv import action_model, action_windows


class LocalActionInputs(unittest.TestCase):
    def fixture(self, root, count=5):
        (root / "frames").mkdir()
        cases = []
        for ci in range(count):
            frames = []
            for fi in range(16):
                identity = str(uuid.uuid4())
                data = f"source-{ci}-frame-{fi}".encode()
                key = f"frames/{identity}.jpg"
                (root / key).write_bytes(data)
                frames.append(
                    {
                        "id": identity,
                        "file": key,
                        "offsetMs": 125 + fi * 250,
                        "sha256": hashlib.sha256(data).hexdigest(),
                        "bytes": len(data),
                    }
                )
            cases.append(
                {
                    "sourceSha256": str(ci) * 64,
                    "durationMs": 4000,
                    "frames": frames,
                    "expected": "LABEL_MUST_NOT_LEAK",
                    "actionWindow": [1300, 2300],
                }
            )
        parent = root / "parent.json"
        parent.write_text(json.dumps({"cases": cases}))
        return parent, cases

    def test_complete_five_case_scope_preserves_every_frame_and_excludes_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            parent, cases = self.fixture(root)
            result = prepare([parent], root / "prepared")
            raw = (root / "prepared/plan.json").read_text()
            self.assertEqual(
                (result["cases"], result["frames"], result["maximumLocalCalls"]),
                (5, 80, 5),
            )
            self.assertNotIn("LABEL_MUST_NOT_LEAK", raw)
            self.assertNotIn("actionWindow", raw)
            self.assertEqual(
                [[f["id"] for f in c["frames"]] for c in json.loads(raw)["cases"]],
                [[f["id"] for f in c["frames"]] for c in cases],
            )
            cases[0]["frames"].pop()
            parent.write_text(json.dumps({"cases": cases}))
            with self.assertRaisesRegex(ValueError, "all sixteen"):
                prepare([parent], root / "selected")
            self.assertFalse((root / "selected").exists())

    def test_reused_source_or_changed_image_is_rejected_before_writing_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            parent, cases = self.fixture(root, 1)
            with self.assertRaisesRegex(ValueError, "Distinct sources"):
                prepare([parent, parent], root / "reused")
            self.assertFalse((root / "reused").exists())
            (root / cases[0]["frames"][0]["file"]).write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "input changed"):
                prepare([parent], root / "changed")
            self.assertFalse((root / "changed").exists())

    def test_native_logits_must_be_complete_finite_and_normalize_without_overflow(self):
        labels = {str(i): f"native-{i}" for i in range(174)}
        logits = [10000.0] * 174
        result = summarize(logits, labels)
        self.assertAlmostEqual(sum(r["softmaxScore"] for r in result["rankings"]), 1.0)
        with self.assertRaisesRegex(ValueError, "finite native"):
            summarize(logits[:-1], labels)
        logits[151] = float("nan")
        with self.assertRaisesRegex(ValueError, "finite native"):
            summarize(logits, labels)


class LocalActionWindows(unittest.TestCase):
    def test_automatic_views_cover_all_dense_frames_without_repeating_a_source(self):
        frames = [{"id": str(i), "offsetMs": i * 125} for i in range(32)]
        grouped = action_windows.views(frames)
        self.assertEqual([len(w) for w in grouped], [16, 16, 16])
        self.assertEqual(
            {f["id"] for w in grouped for f in w}, {f["id"] for f in frames}
        )
        self.assertEqual(
            len({f["id"] for f in grouped[0]} & {f["id"] for f in grouped[1]}), 8
        )
        with self.assertRaisesRegex(ValueError, "Every ordered"):
            action_windows.views(frames[:-1])

    def test_dense_bundle_rejects_retimed_view_and_changed_global_call_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "media").mkdir()
            data = b"original-source"
            (root / "media/original.mp4").write_bytes(data)
            fingerprint = hashlib.sha256(data).hexdigest()
            assets = [
                {
                    "name": "original-source.mp4",
                    "key": "original.mp4",
                    "sha256": fingerprint,
                    "bytes": len(data),
                    "kind": "video",
                }
            ]
            for i in range(32):
                identity = str(uuid.uuid4())
                data = f"dense-{i}".encode()
                key = f"{identity}.jpg"
                (root / "media" / key).write_bytes(data)
                assets.append(
                    {
                        "id": identity,
                        "name": key,
                        "key": key,
                        "kind": "frame",
                        "offsetMs": 62 + i * 125,
                        "sha256": hashlib.sha256(data).hexdigest(),
                        "bytes": len(data),
                    }
                )
            evaluation = root / "dense.json"
            evaluation.write_text(
                json.dumps(
                    {
                        "cases": [
                            {
                                "sourceSha256": fingerprint,
                                "durationMs": 4000,
                                "item": {"split": "development"},
                                "assets": assets,
                            }
                        ]
                    }
                )
            )
            receipt = root / "model.json"
            receipt.write_text(
                json.dumps(
                    {
                        "model": action_model.MODEL,
                        "revision": action_model.REVISION,
                        "files": [],
                    }
                )
            )
            output = root / "bundle"
            report = action_windows.prepare(evaluation, receipt, output)
            self.assertEqual(
                (report["sources"], report["views"], report["maximumLocalCalls"]),
                (1, 3, 3),
            )
            action_windows.inspect(output / "plan.json", require_final=False)
            child = output / "window-1/plan.json"
            before = child.read_bytes()
            plan = json.loads(before)
            plan["cases"][0]["frames"][0]["offsetMs"] += 1
            child.write_text(json.dumps(plan))
            with self.assertRaisesRegex(ValueError, "Dense coverage"):
                action_windows.inspect(output / "plan.json", require_final=False)
            child.write_bytes(before)
            parent = output / "plan.json"
            bundle = json.loads(parent.read_text())
            bundle["maximumLocalCalls"] = 2
            parent.write_text(json.dumps(bundle))
            with self.assertRaisesRegex(ValueError, "complete fixed"):
                action_windows.inspect(parent, require_final=False)


if __name__ == "__main__":
    unittest.main()
