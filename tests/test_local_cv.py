"""Input-integrity checks only; no CV packages, model downloads or inference."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import uuid
from experiments.local_cv.prepare import prepare
from experiments.local_cv.associate import associate


class LocalCvPreparation(unittest.TestCase):
    def fixture(self, root):
        (root / "media").mkdir()
        cases = []
        for ci in range(3):
            assets = []
            for i in range(16):
                identity = str(uuid.uuid4())
                data = f"case{ci}-frame{i}".encode()
                key = f"{identity}.jpg"
                (root / "media" / key).write_bytes(data)
                assets.append(
                    {
                        "id": identity,
                        "key": key,
                        "kind": "frame",
                        "offsetMs": 125 + i * 250,
                        "bytes": len(data),
                        "sha256": hashlib.sha256(data).hexdigest(),
                    }
                )
            cases.append(
                {
                    "sourceSha256": str(ci) * 64,
                    "durationMs": 4000,
                    "item": {
                        "split": "development",
                        "expected": "LABEL_MUST_NOT_LEAK",
                        "actionWindow": [1300, 2300],
                    },
                    "assets": assets,
                }
            )
        file = root / "baseline.json"
        file.write_text(json.dumps({"cases": cases}))
        return file, cases

    def test_all_images_preserved_without_action_labels_and_tamper_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, cases = self.fixture(root)
            output = root / "prepared"
            result = prepare(source, output)
            plan = json.loads((output / "plan.json").read_text())
            self.assertEqual(result["frames"], 48)
            self.assertNotIn("LABEL_MUST_NOT_LEAK", (output / "plan.json").read_text())
            self.assertNotIn("actionWindow", (output / "plan.json").read_text())
            for ci, case in enumerate(plan["cases"]):
                self.assertEqual(
                    [f["offsetMs"] for f in case["frames"]],
                    [a["offsetMs"] for a in cases[ci]["assets"]],
                )
                for frame in case["frames"]:
                    self.assertEqual(
                        hashlib.sha256(
                            (output / frame["file"]).read_bytes()
                        ).hexdigest(),
                        frame["sha256"],
                    )
            (root / "media" / cases[2]["assets"][-1]["key"]).write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "Source frame changed"):
                prepare(source, root / "rejected")
            self.assertFalse((root / "rejected").exists())
            with self.assertRaises(FileExistsError):
                # Existing experiment directories must never be overwritten.
                prepare(source, output)

    def test_cross_case_identity_collision_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, cases = self.fixture(root)
            cases[1]["assets"][0]["id"] = cases[0]["assets"][0]["id"]
            source.write_text(json.dumps({"cases": cases}))
            with self.assertRaisesRegex(ValueError, "Duplicate evidence ID"):
                prepare(source, root / "rejected")
            self.assertFalse((root / "rejected").exists())


class LocalCvAssociation(unittest.TestCase):
    def frame(self, identity, offset, boxes):
        return {
            "id": identity,
            "offsetMs": offset,
            "detections": [
                {"box": b, "score": 0.7, "label": "cardboard box"} for b in boxes
            ],
        }

    def test_missing_detection_does_not_become_an_invented_continuous_track(self):
        frames = [
            self.frame("before", 125, [[0, 0, 10, 10]]),
            self.frame("missing", 375, []),
            self.frame("after", 625, [[1, 0, 11, 10]]),
        ]
        tracks = associate(frames)
        self.assertEqual(
            [[p["frameId"] for p in t["points"]] for t in tracks],
            [["before"], ["after"]],
        )

    def test_two_plausible_parcels_do_not_get_a_forced_identity_link(self):
        frames = [
            self.frame("two", 125, [[0, 0, 10, 10], [6, 0, 16, 10]]),
            self.frame("ambiguous", 375, [[3, 0, 13, 10]]),
        ]
        tracks = associate(frames)
        self.assertEqual([len(t["points"]) for t in tracks], [1, 1, 1])
        self.assertEqual(tracks[-1]["points"][0]["frameId"], "ambiguous")


if __name__ == "__main__":
    unittest.main()
