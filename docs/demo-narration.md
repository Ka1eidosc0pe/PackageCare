# Demo narration (final)

About 400 words, roughly 2:40 at a relaxed pace, under the 3:00 limit. Record one audio file per screen; the video is cut to match each file's length.

**Screen 1: title, then the app home**

There are few things worse than finally getting the package you've been waiting for, opening it up, and finding it damaged. All that excitement metamorphoses into dread about the work it'll take to sort out. I can't magically guarantee every package arrives in great condition, but PackageCare makes the aftermath as painless as possible. It turns your Ring footage into a clear record of how your delivery was handled, with the evidence you need for a swift resolution.

**Screen 2: Connections → Ring live view → save clip** *(local app)*

PackageCare connects to Ring through the official Partner API. Here's a live Ring Playground camera over WHEP. I save a clip, and it becomes a delivery record with the original footage preserved.

**Screen 3: the saved Ring clip → "Unable to assess"** *(local app)*

The Playground scene shows a parcel already at rest. Nothing was handled on camera, so PackageCare honestly says it can't assess handling instead of guessing.

**Screen 4: AI-generated toss → verdict, timeline click, slow-motion replay** *(cloud app)*

Ring's simulator can't show a real delivery, so for handling I use clearly labeled AI-generated doorbell clips. Uploads go to our AWS pipeline, where our own classifier flags possible mishandling, links the exact two-second segment and shows the frames. Click it and the video jumps right there, or replay the moment in slow motion.

**Screen 5: recipient review: confirm, damage, notes, photo** *(cloud app)*

The recipient is the decision-maker: confirm, correct, or dismiss what the model saw. Damage is recorded separately, because mishandling doesn't necessarily mean damage, and damage doesn't prove mishandling.

**Screen 6: preview → finalize → open the exported report** *(cloud app)*

The report is previewed, frozen as a version, and exported with the evidence files and a hash manifest. Nothing is sent anywhere automatically.

**Screen 7: rain placement → "No concern"; obscured porch → "Unable to assess"** *(cloud app)*

Restraint matters as much as detection. A careful placement isn't flagged, and when the package is hidden, the model abstains instead of guessing.

**Screen 8: how it was built, then the AWS architecture**

Without a Ring camera, and with real footage of packages being thrown nearly impossible to come by, I generated about five hundred labeled doorbell clips with an AI video model, degraded them to look like real cameras, and trained a small classifier on frozen V-JEPA 2 video features. I only tested it on footage it had never seen: clips from a different video generator, where it caught fourteen of fifteen tosses and drops, and a handful of real recordings. It's not perfect. It sometimes flags a careful placement, which is exactly why the recipient has the final say. On AWS, uploads land in S3, Step Functions runs the classifier in a Lambda container, and results live in DynamoDB.

**Screen 9: roadmap concept card, then the end card**

There's plenty of room to grow. A natural next step, shown here only as a concept, is working with carriers, so a reviewed report goes straight to the team that handles claims for your address, with everything they need in one place. That way, the dopamine hit from your Prime Day haul stays just that!
