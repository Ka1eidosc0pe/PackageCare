"""Spatial duplicate-candidate gating; never establishes physical object identity."""

if __package__:
    from .associate import iou
else:
    from associate import iou

MASK_AGREEMENT = {
    "kind": "mask_agreement_v1",
    "minimumIou": 0.6,
    "ambiguityMargin": 0.1,
    "minimumPresenceLogit": 0,
}


def select_new_seeds(seeds, current_objects):
    accepted, decisions = [], []
    visible = [
        o
        for o in current_objects
        if o["box"] is not None and o["areaPixels"] > 0 and o["objectScoreLogit"] > 0
    ]
    for seed in seeds:
        matches = sorted(
            ((iou(seed["box"], o["box"]), o["objectId"]) for o in visible), reverse=True
        )
        best = matches[0] if matches else None
        ambiguous = len(matches) > 1 and best[0] - matches[1][0] < 0.1
        if best and best[0] >= 0.6 and not ambiguous:
            decisions.append(
                {
                    "objectId": seed["objectId"],
                    "decision": "possible_duplicate",
                    "possibleDuplicateOf": best[1],
                    "iou": best[0],
                }
            )
        else:
            accepted.append(seed)
            decisions.append(
                {
                    "objectId": seed["objectId"],
                    "decision": "seeded",
                    "reason": "ambiguous_match"
                    if best and best[0] >= 0.6 and ambiguous
                    else "no_unique_mask_agreement",
                }
            )
    return accepted, decisions
