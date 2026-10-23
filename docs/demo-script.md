# Demo script (target 2:45, hard limit 3:00)

Record at 1440×900 or 1920×1080, browser zoom 100%, the app on `http://127.0.0.1:3012` started with `PACKAGECARE_ANALYZER=local` and a fresh `DATA_DIR`. Pre-load the demo clips (below) before recording so analysis has finished; do one live upload on camera to show it's real. Every generated clip is labeled as AI-generated on screen and in narration.

## Before recording

1. Get a fresh Ring Developer Playground token (they can be regenerated about every 30 minutes, so get it right before recording).
2. Start the app. Upload, in this order: `demo-place`, `demo-obscured`, `demo-drop` from `data/synthetic/demo/clips/`. Keep `demo-toss` for the live upload.
3. Open the AWS console tabs you'll show (Step Functions execution, S3 bucket, DynamoDB item, Lambda logs), if the cloud deployment is live.

## Shot list

| Time | Screen | Narration (suggested) |
|---|---|---|
| 0:00–0:15 | Title card, then app home | "A package arrives damaged. Was it thrown? Today you'd scrub through doorbell footage and write it all up yourself. PackageCare turns Ring footage into a clear, evidence-linked handling record that you control." |
| 0:15–0:40 | Connections → paste Playground token → device → Live view → Save 12-second clip | "PackageCare connects to Ring through the official Partner API. Here's a live Ring Playground camera over WHEP. I save a clip, and it becomes a delivery record with the original bytes preserved." |
| 0:40–0:55 | Analyze the Ring clip → result: unable to assess | "The Playground scene shows a parcel already at rest — nothing was handled on camera, so PackageCare says it can't assess handling rather than guessing." |
| 0:55–1:25 | Import `demo-toss` (AI-generated, labeled) → processing → timeline flags 'Possible airborne release', click it → video seeks to the toss; evidence frames | "Ring's simulator can't show a real delivery, so for handling we use clearly labeled AI-generated doorbell clips. Our classifier runs locally on this laptop: it flags a possible toss, links the exact two-second segment, and shows the frames. Click and the video jumps there." |
| 1:25–1:50 | Recipient review: Confirm observation, damage 'Damage observed', add a photo, shipment reference, notes | "The recipient decides. They can confirm, correct, or dismiss what the model saw. Damage is recorded separately — a toss doesn't mean damage, and damage doesn't prove a toss." |
| 1:50–2:05 | Preview report → Finalize → Download ZIP, open report.html | "The report is previewed, frozen as a version, and exported with the evidence files and a hash manifest. Nothing is sent anywhere automatically." |
| 2:05–2:20 | Quickly show `demo-place` (no concern) and `demo-obscured` (unable to assess) | "Restraint matters as much as detection: careful placement isn't flagged, and when the package is hidden, it abstains." |
| 2:20–2:40 | How it works slide: synthetic data → V-JEPA 2 features → classifier; AWS architecture | "We had almost no real footage, so we generated ~400 labeled doorbell clips with an AI video model, degraded them to look like real cameras, and trained a small classifier on frozen V-JEPA 2 video features. We test only on footage it never saw: clips from a different generator and real recordings. On AWS, uploads land in S3, Step Functions runs the classifier in a Lambda container, and results live in DynamoDB." (Adjust to what is actually deployed.) |
| 2:40–2:50 | Limitations + roadmap card | "It's a hackathon model: synthetic training data, a small real test set, and scores that aren't probabilities — so it supports the recipient's review rather than replacing it. Next: a recipient-approved carrier claim, shown here only as a concept." |

## Honesty checklist for the video

- Say "AI-generated" whenever a generated clip is on screen; the app labels it "Uploaded footage".
- Don't call the Ring Playground clip a delivery, or the generated clips Ring footage.
- Quote real held-out results only (from `data/synthetic/model/*.json` → `docs/synthetic-classifier.md`).
- The carrier escalation is a labeled concept, not a feature.
