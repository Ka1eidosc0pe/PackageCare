"""Input-integrity checks only; no CV packages, model downloads or inference."""

import hashlib
import copy
import json
from pathlib import Path
import tempfile
import unittest
import uuid
from experiments.local_cv.prepare import prepare
from experiments.local_cv.associate import associate
from experiments.local_cv.prepare_tracking import prepare_tracking
from experiments.local_cv.seed_policy import select_new_seeds
from experiments.local_cv.score_tracking import score, POLICY
from experiments.local_cv.reverse_prefix import derive_jobs, merge_prefix_object


class LocalCvPreparation(unittest.TestCase):
    def fixture(self, root, case_count=3):
        (root / "media").mkdir()
        cases = []
        for ci in range(case_count):
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


class LocalCvTrackingPreparation(unittest.TestCase):
    def fixture(self, root, case_count=3):
        baseline, _ = LocalCvPreparation().fixture(root, case_count)
        source = root / "detections"
        prepare(baseline, source)
        plan = json.loads((source / "plan.json").read_text())
        frames = []
        cases = []
        for ci, case in enumerate(plan["cases"]):
            observed = [
                {
                    "id": f["id"],
                    "case": ci,
                    "offsetMs": f["offsetMs"],
                    "detections": [
                        {
                            "box": [10, 10, 20, 20],
                            "score": 0.7,
                            "label": "cardboard box",
                        }
                    ],
                }
                for f in case["frames"]
            ]
            frames.extend(observed)
            cases.append({"case": ci, "tracks": associate(observed)})
        (source / "results.json").write_text(
            json.dumps({"state": "complete", "frames": frames})
        )
        (source / "tracks.json").write_text(json.dumps({"cases": cases}))
        return source

    def test_two_sources_are_not_padded_and_larger_scope_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.fixture(root, 2)
            prepared = prepare_tracking(source, root / "tracking")
            plan = json.loads(Path(prepared["plan"]).read_text())
            self.assertEqual(plan["maximumFrames"], 32)
            self.assertEqual(len(plan["cases"]), 2)
            self.assertEqual(prepared["objectsPerCase"], [1, 1])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            baseline, _ = LocalCvPreparation().fixture(root, 4)
            with self.assertRaisesRegex(ValueError, "one to three"):
                prepare(baseline, root / "rejected")
            self.assertFalse((root / "rejected").exists())

    def test_uses_every_automatic_first_seed_and_rejects_manual_action_selection(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.fixture(root)
            prepared = prepare_tracking(source, root / "tracking")
            plan = json.loads(Path(prepared["plan"]).read_text())
            self.assertEqual(prepared["objectsPerCase"], [1, 1, 1])
            self.assertTrue(
                all(c["seeds"][0]["frameIndex"] == 0 for c in plan["cases"])
            )
            tracks = json.loads((source / "tracks.json").read_text())
            tracks["cases"][0]["tracks"][0]["points"].pop(0)
            (source / "tracks.json").write_text(json.dumps(tracks))
            with self.assertRaisesRegex(ValueError, "manually selected"):
                prepare_tracking(source, root / "rejected")
            self.assertFalse((root / "rejected").exists())

    def test_retimed_or_wrong_case_frame_is_not_used_as_tracking_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.fixture(root)
            result = json.loads((source / "results.json").read_text())
            result["frames"][-1]["case"] = 0
            (source / "results.json").write_text(json.dumps(result))
            with self.assertRaisesRegex(ValueError, "Frame/case/time mismatch"):
                prepare_tracking(source, root / "rejected")
            self.assertFalse((root / "rejected").exists())


class ReversePrefixIntegrity(unittest.TestCase):
    def fixture(self):
        cases, result = [], []
        for ci in range(2):
            frames = [{"id": f"c{ci}-f{i}", "offsetMs": i * 250} for i in range(4)]
            seeds = [
                {
                    "objectId": j + 1,
                    "frameIndex": j,
                    "frameId": frames[j]["id"],
                    "offsetMs": frames[j]["offsetMs"],
                    "box": [j * 10, 0, j * 10 + 5, 5],
                }
                for j in range(4)
            ]
            cases.append({"frames": frames, "seeds": seeds})
            for fi, frame in enumerate(frames):
                # Keep all accepted candidates, including a generic background candidate;
                # seed 4 was spatially suppressed by the completed forward policy.
                result.append(
                    {
                        **frame,
                        "case": ci,
                        "frameIndex": fi,
                        "seededObjectIds": [fi + 1] if fi < 3 else [],
                        "objects": [
                            {"objectId": identity}
                            for identity in range(1, min(fi + 2, 4))
                        ],
                    }
                )
        return {"cases": cases}, {"state": "complete", "frames": result}

    def test_every_accepted_later_seed_is_used_without_a_manual_target(self):
        plan, result = self.fixture()
        jobs = derive_jobs(plan, result)
        self.assertEqual(
            [(j["case"], j["objectId"], j["frameIndex"]) for j in jobs],
            [(0, 2, 1), (0, 3, 2), (1, 2, 1), (1, 3, 2)],
        )
        self.assertEqual(sum(j["frameIndex"] + 1 for j in jobs), 10)

    def test_retiming_or_preseed_prediction_cannot_create_reverse_jobs(self):
        plan, result = self.fixture()
        changed = copy.deepcopy(result)
        changed["frames"][1]["seededObjectIds"] = [3]
        with self.assertRaisesRegex(ValueError, "retimed"):
            derive_jobs(plan, changed)
        changed = copy.deepcopy(result)
        changed["frames"][0]["objects"].append({"objectId": 3})
        with self.assertRaisesRegex(ValueError, "before its seed"):
            derive_jobs(plan, changed)

    def test_addition_discloses_future_seed_and_cannot_overwrite_forward(self):
        frame = {"offsetMs": 125, "objects": []}
        candidate = {
            "objectId": 2,
            "box": [10, 10, 20, 20],
            "areaPixels": 100,
            "objectScoreLogit": 4,
        }
        added, _ = merge_prefix_object(frame, candidate, 1375)
        self.assertTrue(added)
        self.assertEqual(frame["objects"][0]["conditionedOnOffsetMs"], 1375)
        self.assertEqual(frame["objects"][0]["temporalDirection"], "backward")
        with self.assertRaisesRegex(ValueError, "overwrite"):
            merge_prefix_object(frame, candidate, 1375)
        with self.assertRaisesRegex(ValueError, "overwrite"):
            merge_prefix_object({"offsetMs": 1375, "objects": []}, candidate, 1375)

    def test_duplicate_or_invisible_prefix_never_removes_forward_evidence(self):
        original = {
            "objectId": 1,
            "box": [10, 10, 20, 20],
            "areaPixels": 100,
            "objectScoreLogit": 4,
        }
        frame = {"offsetMs": 125, "objects": [copy.deepcopy(original)]}
        added, decision = merge_prefix_object(frame, {**original, "objectId": 2}, 1375)
        self.assertFalse(added)
        self.assertEqual(decision["possibleDuplicateOf"], 1)
        self.assertEqual(frame["objects"], [original])
        added, decision = merge_prefix_object(
            frame, {**original, "objectId": 2, "objectScoreLogit": -1}, 1375
        )
        self.assertFalse(added)
        self.assertEqual(decision["decision"], "not_visible")
        self.assertEqual(frame["objects"], [original])


class TrackingScores(unittest.TestCase):
    def fixture(self):
        frames = [
            {"id": f"frame-{i}", "sha256": str(i) * 64, "offsetMs": i * 250}
            for i in range(3)
        ]
        plan = {"cases": [{"sourceSha256": "a" * 64, "frames": frames}]}
        labels = {
            "policy": POLICY,
            "cases": [
                {
                    "sourceSha256": "a" * 64,
                    "dimensions": [100, 100],
                    "frames": [
                        {**f, "visibility": "visible", "box": [10, 10, 20, 20]}
                        for f in frames
                    ],
                }
            ],
        }
        results = {
            "state": "complete",
            "frames": [
                {
                    "case": 0,
                    "id": f["id"],
                    "offsetMs": f["offsetMs"],
                    "objects": [
                        {
                            "objectId": 1 if i == 0 else 2,
                            "box": [10, 10, 20, 20],
                            "areaPixels": 100,
                            "objectScoreLogit": 4,
                        }
                    ],
                }
                for i, f in enumerate(frames)
            ],
        }
        return plan, results, labels

    def test_oracle_box_matches_do_not_hide_identity_switch(self):
        plan, results, labels = self.fixture()
        case = score(plan, results, labels, "tracking")["cases"][0]
        self.assertEqual(case["anyCandidateHits"], 3)
        self.assertEqual(case["lockedIdHits"], 1)
        self.assertEqual(case["acquisitions"], [{"frameIndex": 0, "objectId": 1}])

    def test_unscorable_and_discontinuity_do_not_invent_a_continuous_track(self):
        plan, results, labels = self.fixture()
        labels["cases"][0]["frames"][1].update(
            {"visibility": "unscorable", "box": None, "reason": "Parcel hidden"}
        )
        labels["cases"][0]["frames"][2]["continuityBreakBefore"] = True
        case = score(plan, results, labels, "tracking")["cases"][0]
        self.assertEqual(
            (case["totalFrames"], case["scoreableFrames"], case["unscorableFrames"]),
            (3, 2, 1),
        )
        self.assertIsNone(case["frames"][1]["anyCandidateHit"])
        self.assertEqual(
            case["acquisitions"],
            [{"frameIndex": 0, "objectId": 1}, {"frameIndex": 2, "objectId": 2}],
        )

    def test_changed_annotations_or_duplicate_results_cannot_be_scored(self):
        plan, results, labels = self.fixture()
        labels["cases"][0]["frames"][0]["sha256"] = "changed"
        with self.assertRaisesRegex(ValueError, "Annotation frame changed"):
            score(plan, results, labels, "tracking")
        plan, results, labels = self.fixture()
        results["frames"][1] = results["frames"][0]
        with self.assertRaisesRegex(ValueError, "exactly once"):
            score(plan, results, labels, "tracking")


class MaskAgreementSeeds(unittest.TestCase):
    def test_unique_current_mask_reuses_candidate_without_changing_input(self):
        seed = {
            "objectId": 5,
            "box": [10, 10, 20, 20],
            "frameIndex": 5,
            "frameId": "source-id",
        }
        existing = [
            {
                "objectId": 1,
                "box": [10, 10, 20, 20],
                "areaPixels": 100,
                "objectScoreLogit": 4,
            }
        ]
        accepted, decisions = select_new_seeds([seed], existing)
        self.assertEqual(accepted, [])
        self.assertEqual(decisions[0]["possibleDuplicateOf"], 1)
        self.assertEqual(decisions[0]["decision"], "possible_duplicate")
        self.assertEqual(seed["frameId"], "source-id")
        self.assertEqual(existing[0]["objectId"], 1)

    def test_ambiguous_or_absent_or_different_object_does_not_suppress_new_parcel(self):
        seed = {"objectId": 5, "box": [10, 10, 20, 20]}
        visible = {
            "objectId": 1,
            "box": [10, 10, 20, 20],
            "areaPixels": 100,
            "objectScoreLogit": 4,
        }
        cases = [
            [],
            [{**visible, "objectScoreLogit": -1}],
            [{**visible, "areaPixels": 0, "box": None}],
            [{**visible, "box": [30, 30, 40, 40]}],
            [visible, {**visible, "objectId": 2}],
        ]
        for objects in cases:
            with self.subTest(objects=objects):
                accepted, decisions = select_new_seeds([seed], objects)
                self.assertEqual(accepted, [seed])
                self.assertEqual(decisions[0]["decision"], "seeded")


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
