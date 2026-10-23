#!/usr/bin/env python3
"""Build a varied, labelled job list for synthetic doorbell clips.

    python3 scripts/synthetic/make_jobs.py OUT.json --counts toss=60,drop=50,place=80,none=50 \
        [--endpoint fal-ai/bytedance/seedance/v1/pro/fast/text-to-video] [--resolution 480p] [--prefix s] [--seed 0]

Each prompt combines a randomly drawn camera, setting, lighting, courier and parcel with one action
template. The sampled attributes are stored on the job so every clip's metadata says exactly what was
requested; the label is the action family requested, which a human still spot-checks on contact sheets.
"""
import argparse
import json
import random

CAMERAS = [
    "Video doorbell footage seen from the doorbell itself, mounted beside the front door at chest height, wide-angle fisheye lens looking out over the porch and front steps",
    "Home security camera footage from a camera mounted high above the front door, looking down at the porch, doormat and steps",
    "Doorbell camera footage, wide fisheye lens at the door looking down the front walkway toward the street",
    "Porch security camera footage from a camera in the upper corner of a covered porch, angled down across the porch floor",
    "Low-resolution CCTV footage from a camera mounted high on a garage, looking down across the driveway and front path from far away, so people appear small in the frame",
    "Grainy security camera footage from across the front yard, the front door and porch small and distant in the frame",
    "Ceiling-mounted security camera footage with a steep top-down view of the doorstep",
    "Apartment door camera footage, wide-angle lens looking out into a building corridor in front of the apartment door",
]
SETTINGS = [
    "a suburban house with a wooden porch and two concrete steps",
    "a brick townhouse with a narrow stoop and iron railing",
    "a modern house with a flat concrete entryway and potted plants",
    "a farmhouse with a wide painted porch and wooden railings",
    "an apartment building hallway with carpet and numbered doors",
    "a small bungalow with a short brick path and a low step",
    "a duplex with a shared concrete landing and a welcome mat",
]
LIGHTING = [
    "bright daylight", "overcast daylight", "late afternoon sun with long shadows", "dusk with the porch light on",
    "night-time infrared black-and-white security footage", "light rain with a wet porch floor", "harsh midday sun",
]
INDOOR_LIGHTING = ["fluorescent hallway lighting", "dim warm hallway lighting", "night-time infrared black-and-white security footage"]
COURIERS = [
    "a delivery driver in a plain navy uniform and cap", "a delivery driver in a high-visibility yellow vest",
    "a courier in a plain grey polo shirt and shorts", "a delivery worker in a dark jacket and beanie",
    "a delivery driver in a plain brown uniform", "a courier in a plain blue t-shirt and jeans",
]
PARCELS = [
    "a small cardboard box", "a medium cardboard box", "a large cardboard box held with both arms",
    "a padded plastic mailer bag", "a flat cardboard box", "two stacked cardboard boxes",
]
ACTIONS = {
    "toss": [
        "walks up holding {parcel}, stops a few meters from the door and tosses it underhand toward the door; the package flies through the air, lands hard on the porch floor, bounces and tumbles. The courier turns and leaves.",
        "approaches holding {parcel} and, without stepping onto the porch, throws it overhand onto the porch; it sails through the air and skids across the floor. The courier walks away quickly.",
        "walks past the door and flings {parcel} sideways onto the doorstep without stopping; the package is airborne for a moment, hits the ground and rolls over.",
        "stands at the bottom of the steps and lobs {parcel} up onto the porch; it arcs through the air, lands on its corner and flips over.",
    ],
    "drop": [
        "walks up to the door holding {parcel} at chest height and simply lets go; the package falls straight down, slams onto the floor and tips over. The courier walks away.",
        "holds {parcel} out at arm's length above the doormat and releases it; it drops to the floor with a hard impact. The courier leaves.",
        "is carrying {parcel} while walking up the steps, fumbles it and the package falls from waist height, hitting the steps and tumbling down.",
        "reaches the door with {parcel} balanced on one hand and lets it drop from shoulder height onto the porch floor before leaving.",
    ],
    "place": [
        "walks up quickly at night holding {parcel}, bends down in one smooth motion and sets it on the floor with both hands still on it, then walks away briskly.",
        "steps onto the porch holding {parcel}, squats, rests it on the floor and slides it a little toward the door with both hands before standing up and leaving.",
        "carries {parcel} in both arms, bends at the waist and lowers it the last few centimeters onto the doormat without letting go early, then leaves.",
        "arrives holding two packages, sets the first one down gently, places the second one carefully on top, then walks away.",
        "walks up quickly holding {parcel}, bends and sets it down briskly but with both hands on it until it touches the floor, then hurries off.",
        "carries {parcel} toward the door, holding it close to the camera for a moment, then lowers it carefully to the floor out of the way and leaves.",
        "arrives holding {parcel} in one hand, crouches low and places it on the doorstep from just above the floor, then walks away.",
        "walks up holding {parcel}, bends down and gently sets it on the doormat with both hands, letting go only once it rests on the floor, then walks away.",
        "carries {parcel} to the door, crouches and carefully places it against the wall beside the door, adjusts it, stands up and leaves.",
        "walks up the steps with {parcel}, lowers it slowly onto the top step with both hands, steps back and walks away.",
        "arrives with {parcel}, kneels, sets it down softly next to the door, takes a photo of it with a phone, then leaves.",
        "walks up with {parcel}, bends at the knees and places it neatly in the corner of the porch, hands staying on it until it is resting on the floor.",
    ],
    "obscured": [
        "walks up holding {parcel} and goes behind a porch pillar; whatever happens to the package is hidden from view, then the courier walks away and the package is not clearly visible.",
        "walks up holding {parcel} but stands with their back to the camera, blocking the view of the package while it ends up on the floor; the moment it is set down cannot be seen.",
        "approaches holding {parcel}; a large bush and the railing block the view of the doorstep while the courier handles the package, then the courier leaves.",
        "carries {parcel} up to the door while the scene is very dark and blurry; it is not possible to see how the package is put down.",
        "walks up holding {parcel} and moves out of the camera's field of view to the side of the door; the package handling happens off-screen, then the courier walks back past the camera empty-handed.",
    ],
    "none": [
        "walks past the house on the sidewalk without approaching the door and carrying nothing.",
        "is not present; {parcel} is already resting on the porch floor and nothing moves except leaves blowing slightly.",
        "walks up to the door holding {parcel}, knocks, waits, then turns and leaves still holding the package.",
        "walks up to the door empty-handed, rings the doorbell, waits and walks away.",
        "is not present; the empty porch is shown with a car passing on the street in the background.",
        "picks up {parcel} that was resting on the doormat, tucks it under one arm and walks inside the house.",
    ],
}
TAIL = " Static camera, no camera movement, single continuous shot, realistic surveillance video quality. The camera device itself is not visible in the image."


def job(i, label, rng, endpoint, resolution, prefix):
    setting = rng.choice(SETTINGS)
    indoor = "hallway" in setting
    attrs = {"camera": CAMERAS[-1] if indoor else rng.choice(CAMERAS[:-1]), "setting": setting,
             "lighting": rng.choice(INDOOR_LIGHTING if indoor else LIGHTING),
             "courier": rng.choice(COURIERS), "parcel": rng.choice(PARCELS)}
    template = rng.randrange(len(ACTIONS[label]))
    action = ACTIONS[label][template].format(parcel=attrs["parcel"])
    who = attrs["courier"][0].upper() + attrs["courier"][1:]
    prompt = f"{attrs['camera']}, at {attrs['setting']}, {attrs['lighting']}. {who} {action}{TAIL}"
    if label == "none" and "is not present" in action:
        prompt = f"{attrs['camera']}, at {attrs['setting']}, {attrs['lighting']}. No person is visible; {action.split('; ', 1)[1]}{TAIL}"
    inp = {"prompt": prompt, "duration": "5", "aspect_ratio": "16:9", "camera_fixed": True}
    if "seedance" in endpoint:
        inp["resolution"] = resolution
    elif "wan" in endpoint:
        inp = {"prompt": prompt, "resolution": resolution, "num_frames": 81, "frames_per_second": 16, "aspect_ratio": "16:9"}
    elif "kling" in endpoint:
        inp = {"prompt": prompt, "duration": "5", "aspect_ratio": "16:9"}
    return {"id": f"{prefix}-{label}-{i:03d}", "label": label, "template": template, "attributes": attrs,
            "endpoint": endpoint, "input": inp}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--counts", required=True)
    ap.add_argument("--endpoint", default="fal-ai/bytedance/seedance/v1/pro/fast/text-to-video")
    ap.add_argument("--resolution", default="480p")
    ap.add_argument("--prefix", default="s")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    jobs = []
    for part in a.counts.split(","):
        label, n = part.split("=")
        jobs += [job(i, label, rng, a.endpoint, a.resolution, a.prefix) for i in range(int(n))]
    with open(a.out, "w") as f:
        json.dump(jobs, f, indent=1)
    print(f"{len(jobs)} jobs -> {a.out}")


if __name__ == "__main__":
    main()
