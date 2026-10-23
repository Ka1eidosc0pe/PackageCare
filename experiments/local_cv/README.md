# Local computer-vision research helpers

Offline experiments that came before the shipped handling classifier ([`experiments/synthetic/`](../synthetic/), described in [docs/synthetic-classifier.md](../../docs/synthetic-classifier.md)). None of them are used by the app at runtime, except `fetch_model.py`, which downloads the V-JEPA 2 checkpoint the classifier is built on.

Environment: Python 3.12 with the pinned packages in [`requirements.txt`](requirements.txt) (Torch 2.14.1, Transformers 5.20.1). All models load from local, pinned, safetensors-only snapshots with remote code disabled.

| Script | Purpose |
|---|---|
| `fetch_model.py` | Download a pinned public checkpoint: `--actions` (V-JEPA 2 ViT-L SSv2, used by the classifier), default Grounding DINO Tiny, or `--tracker` (SAM2.1 Tiny) |
| `prepare.py`, `run.py`, `associate.py` | Grounding DINO parcel/hand detection over prepared frames, and conservative box association |
| `prepare_tracking.py`, `track_masks.py`, `seed_policy.py`, `review_masks.py` | SAM2.1 mask tracking from detector seeds, with duplicate-seed gating and visual review sheets |
| `reverse_prefix.py`, `replay_prefix.py` | Backward propagation from later seeds into earlier missed frames, plus a no-inference replay |
| `score_tracking.py` | Score tracks against frozen visual annotations (any-candidate and locked-ID coverage) |
| `action_model.py`, `action_windows.py` | V-JEPA 2's generic 174-class action head on whole clips and sliding windows (baseline before training our own head) |
| `support_vlm.py` | A local vision-language model run (MLX) over the same frames, for comparison |

What we learned: detection plus tracking can follow a parcel once seeded but can't tell a toss from a placement, and the generic action head and general vision-language models did not reliably flag brief tosses. That led to the trained head on frozen V-JEPA 2 features. Dependency-free checks for these helpers run with:

```sh
python3 -m unittest discover -s tests -p 'test_local_*.py'
```
