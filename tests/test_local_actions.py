"""Consequential action-scope and numerical-output guards; no ML dependencies."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import uuid

from experiments.local_cv.action_model import prepare, summarize


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


if __name__ == "__main__":
    unittest.main()
