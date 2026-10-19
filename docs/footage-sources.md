# Online footage sourcing — October 19, 2026

The owner cannot record a camera dataset and requested online sources. This catalog records actual findings and selection decisions. It is **not** a completed 12-clip evaluation set, a license warranty, or model-performance evidence. No paid footage was purchased and no rights-holder messages were sent.

## Selected development source

[Van-loading footage](https://commons.wikimedia.org/wiki/File:FedEx荷物積み込み米国宅配で破損が多い理由.ogv), credited on Commons to **副業サポート掘 英郎**, is listed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) with a recorded YouTube license review. The downloaded original is approximately 19.4 seconds and 4.1 MB. Public API metadata, source URLs, artist credit, original hash and bytes are retained locally. Visual inspection of a ten-frame-per-second sequence shows a light-colored carton moving away from the person's hands toward the van interior. The landing area is partly obscured.

Prepared development excerpt: first four seconds, audio removed, H.264 transcode, no crop/speed change. Approximate manually annotated action interval: 1,300–2,300 ms. Expected development label: `possible_rough_handling`, based on the visible airborne interval, without asserting intent, damage or identity. This is **van loading, outside the doorstep domain**, and must not be presented as Ring footage or held-out quality evidence. Two visible actions from this source do not become independent cases. A dense local plan prepares 16 frames / at most eight requests; invocation needs the owner's explicit scope.

Attribution for any shared excerpt: “Van-loading footage by 副業サポート掘 英郎, via Wikimedia Commons, CC BY 3.0. Excerpted to four seconds, audio removed and transcoded. No endorsement implied.” Link both the source and license. Keep attribution beside any demo, presentation, dataset record or report using the excerpt; do not publish an uncredited standalone evidence bundle.

## Other CC BY candidates

| Source | Credit / listed license | Inspection and decision |
|---|---|---|
| [USPS doorway/yard CCTV](https://commons.wikimedia.org/wiki/File:USPS_delivery_person_throws_package_at_house.ogv) | Brian Greul / CC BY 3.0; recorded YouTube license review | Original downloaded, approximately 39.6 s / 37.3 MB. Actual remote playback and contact sheets inspected. Camera is wide and the path/landing can be obscured by vegetation; the video has a scene/time discontinuity. Inspect the original frame by frame before labeling any release. The source title alone is not ground truth. Useful candidate for difficult visibility. |
| [Driveway delivery CCTV](https://commons.wikimedia.org/wiki/File:Fed_Ex_guy_thrown_a_package.ogv) | Junter77 / CC BY 3.0; public Commons metadata retained | Original downloaded, approximately 21.9 s / 1.8 MB. The participant approaches the doorway at the beginning, then later returns to the van. Small parcel/release area is hard to establish from initial contact sheets. Retain for closer visibility annotation, not a guaranteed positive. |
| [Doorway delivery recording](https://commons.wikimedia.org/wiki/File:FedEx_fails_delivery_without_knocking.ogv) | Mac Manson / CC BY 3.0; recorded YouTube license review | Original approximately 100 s / 2.2 MB. Initially rate-limited, then downloaded successfully after waiting; no proxy/bypass. A full-length one-frame-per-second contact sheet is prepared; closer review and a bounded excerpt are still needed. Do not label from its accusatory original description. |
| [Truck at an exhibition](https://commons.wikimedia.org/wiki/File:FedEx_USA_with_style.ogv) | Garduño UwwUr / CC BY 3.0 | Original downloaded and inspected. **Exclude from the handling dataset:** truck exhibition, no visible parcel handling. Could exercise irrelevant-footage abstention, but does not count as a careful placement. |

These files are in ignored `data/online-footage/originals/`. The Commons API returned original URLs, byte lengths, SHA-1 fingerprints and license metadata. Available originals were checked against those fingerprints. SHA-256 fingerprints and local source records are retained in ignored `data/online-footage/sources.json`; retain the public metadata snapshot too. Website availability is not proof that a uploader owns all underlying rights; investigate signs of third-party compilation or unexplained edits before public redistribution.

## Stock candidates for normal placement and missing handling

These are specific asset pages, not a claim that the footage has already been decoded and labeled. The [Pexels license](https://www.pexels.com/license/) allows free use/modification, with restrictions on presenting identifiable people negatively or implying endorsement. Its [service terms](https://www.pexels.com/terms-of-service/) also restrict unauthorized automated collection, including for machine-learning purposes. **No automated Pexels dataset download was performed.** Resolve the collection/use path before pulling a batch for model evaluation; a “free download” badge alone does not settle that question.

| Candidate | Creator | Intended test, pending visual labeling |
|---|---|---|
| [Woman putting boxes on the ground](https://www.pexels.com/video/woman-putting-boxes-on-the-ground-6035125/) | ArtHouse Studio | Candidate controlled placement with visible hands and ground contact |
| [Man putting orders on the doorstep](https://www.pexels.com/video/man-putting-the-orders-on-the-doorstep-8926528/) | Kampus Production | Candidate doorstep placement |
| [Woman delivering a parcel](https://www.pexels.com/video/woman-delivering-parcel-at-the-doorstep-6170051/) | Tima Miroshnichenko | Candidate normal delivery; avoid treating another angle/take of the same event as independent held-out footage |
| [Person delivering three boxes](https://www.pexels.com/video/person-delivering-three-boxes-4440915/) | Polina Tankilevitch | Candidate multi-box handling, potentially an occlusion case |
| [Box already on a doorstep](https://www.pexels.com/video/an-abandoned-box-outside-the-doorstep-7362802/) | RDNE Stock project | Candidate abstention because placement is absent |
| [Packages at the door](https://www.pexels.com/video/packages-at-the-door-6994416/) | Kindel Media | Candidate abstention; parcel presence does not establish careful handling |

[Mixkit's doorstep handover](https://mixkit.co/free-stock-video/delivering-a-package-to-the-door-of-a-house-31155/) is listed under its Stock Video Free License. On October 19 the license modal was read together with the [User Terms](https://mixkit.co/terms/) and incorporated [Envato Acceptable Use Policy](https://help.elements.envato.com/hc/en-us/articles/31035788503321-Acceptable-Use-Policy) / [Fair Use Policy](https://help.elements.envato.com/hc/en-us/articles/360000621743-Fair-Use-Policy). Despite broad ordinary project-use rights, those policies restrict unauthorized AI development/enhancement and automated retrieval. **Held aside pending appropriate permission; no Mixkit media was downloaded or analyzed.** The [pizza-box drop](https://mixkit.co/free-stock-video/courier-man-in-yellow-uniform-drops-the-pizza-boxes-on-13091/) also has a personal-use-only restricted free license. A free-video badge does not settle our evaluation use.

## Held aside

- [SWNS CCTV parcel throw](https://commons.wikimedia.org/wiki/File:Amazon_delivery_driver_THROWS_parcel_as_shocked_dad_watches_live_on_CCTV_-_SWNS_TV.webm): visually relevant description, but Commons relies on an automated-recording public-domain rationale while the source description requests commercial licensing. That is less clear than an explicit creator license, especially for an edited news clip. Do not treat it as rights-cleared or use it in the demo without resolving permission.
- [ViralHog package throws](https://viralhog.com/watch/file/300473234): relevant footage offered through a licensing request, not a free reuse license. No purchase/request authorized.
- [WACV doorbell-delivery research](https://arxiv.org/html/2305.07812) describes a curated consented collection of 5,477 videos, but no usable public download/reuse grant was established in this research. The [package-theft paper](https://arxiv.org/abs/2205.11804) also describes a dataset; a paper's existence does not supply the recordings or redistribution permission. These are research leads, not available evaluation media.

## Evaluation rules

1. Review actual video before inference; annotate visible action and uncertainty independently of titles, news captions and model answers.
2. Preserve originals, source/creator/license, retrieval date, hashes and every edit. Use `uploaded` for external excerpts; only the actual connected Playground capture is `ring_simulator`.
3. Keep all excerpts/takes from one original event in the same split. Different hashes of cropped versions do not establish independence. Do not create twelve “cases” from one or two events.
4. Start with the clearly labeled development source and the real Ring at-rest diagnostic. Obtain more independent normal/rough/unclear examples before claiming the PRD's feasibility gate or selecting a final strategy.
5. Prepare local plans first; only specifically approved invocations may call Bedrock. Source acquisition authorizes neither inference spending nor public publication.

## Validation scope outcome

The owner approved a new $0.75 maximum batch: v6 Ring dense processing first (at most 24 requests), then this eight-request loading excerpt only if Ring succeeded. Ring stopped on `ServiceUnavailableException` on observation window 11 (zero-based): 12 requests attempted, 11 responses received. All 11 returned replies passed the v6 parser. Returned usage was 127,252 input / 2,169 output tokens, estimated $0.00815568 before tax; cost/usage for the unreturned request is unknown. No verification occurred, and the loading plan **was not invoked**. The batch stopped and its scope is closed. Any subsequent model run needs new owner approval. This external service failure does not establish model quality or complete the Ring case.

### Subsequent development comparisons

Two later separately approved scopes did run the source-credited excerpt: twelve requests comparing dense/sparse/native inputs, then sixteen requests for 8 fps dense input. All returned/validated, but neither dense run supported the annotated concern, and sparse/native returned no concern. No model-quality gate passed. Both scopes are closed; estimated combined inference cost $0.00877866 before tax. See [complete development results](evaluation-results-2026-10-19.md). This supersedes only the earlier statement that its *conditional Ring batch* did not invoke the excerpt; that historical batch did stop as agreed.
