# Footage sources and credits

## AI-generated (in this repository)

Every handling clip shown in the app, the demo video and [`samples/`](../samples/) is **AI-generated** and labeled as such:

- Training clips: Seedance v1 Pro Fast (ByteDance) via fal.ai.
- Cross-generator test clips: Kling 2.5 Turbo Pro (Kuaishou), plus two Wan 2.2 pilot clips, via fal.ai.
- The damage photo in the demo: FLUX.1 [dev] (Black Forest Labs) via fal.ai.

Prompts never name real brands; no clip carries Ring branding.

## Ring Developer Playground

The Ring live-view clips in the demo are real browser recordings of the official Ring Developer Playground simulator (Package scene), captured through the Ring Partner API's WHEP live view. The app labels them as browser recordings, not native Ring downloads.

## Third-party footage used only for local evaluation (not in this repository)

These recordings were used as held-out *real* test clips. They are not redistributed here; short excerpts were evaluated locally with audio removed and no other edits.

| Clip | Source and credit | License |
|---|---|---|
| Van loading toss | 副業サポート掘 英郎, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:FedEx荷物積み込み米国宅配で破損が多い理由.ogv) | CC BY 3.0 |
| Postal conveyor placement | U.S. Marine Corps video by MCSN Kelly Meyer / AFN Okinawa, [DVIDS 776728](https://www.dvidshub.net/video/776728/okinawa-postal-service-broll-package). The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement. | Public domain |
| Office delivery (railing-obscured) | itookmypantsoff1time, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%C2%ABHigh_level_of_service%C2%BB_offered_by_US_Postal_Service.ogv) | CC BY 3.0 |
| Porch box delivery | USDAgov / Lance Cheung, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:20200824-FNS-LSC-Box_to_Table_(50287966517).webm) | Public domain (USDA) |
| CCTV parcel throw | SWNS, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Amazon_delivery_driver_THROWS_parcel_as_shocked_dad_watches_live_on_CCTV_-_SWNS_TV.webm) | Listed PD-automated; the publisher requests commercial licensing, so it was used for private local evaluation only |
| Doorway carton, yard | Mac Manson and Brian Greul (Wikimedia Commons) | CC BY 3.0 |

## Models

- Meta **V-JEPA 2** ViT-L, SSv2 fine-tune (`facebook/vjepa2-vitl-fpc16-256-ssv2`), MIT license, downloaded at a pinned revision by `experiments/local_cv/fetch_model.py`.
