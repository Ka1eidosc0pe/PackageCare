"""Local-only, fixed five-source support-transition feasibility probe.

Export HANDLING_PROMPT/handlingJsonSchema from server/handling-evidence.ts to a
contract JSON first. No labels, source names or action windows enter the model.
Outputs are development evidence, never a production accuracy claim.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import time

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plan", type=Path)
    ap.add_argument("contract", type=Path)
    ap.add_argument("model", type=Path)
    ap.add_argument("output", type=Path)
    args = ap.parse_args()
    import mlx.core as mx
    from mlx_vlm import load, stream_generate, prepare_inputs
    from mlx_vlm.structured import build_json_schema_logits_processor, ThinkingAwareLogitsProcessor
    from PIL import Image

    baseline = json.loads(args.plan.read_bytes())
    contract_bytes = args.contract.read_bytes()
    contract = json.loads(contract_bytes)
    if len(baseline["cases"]) != 5:
        raise ValueError("Requires the five-case development baseline")
    frozen = []
    for case in baseline["cases"]:
        frames = sorted((a for a in case["assets"] if a["kind"] == "frame"), key=lambda a: a["offsetMs"])
        if len(frames) != 16:
            raise ValueError("Requires sixteen full frames per source")
        images = []
        for a in frames:
            key = a["key"]
            if Path(key).name != key:
                raise ValueError("Invalid frame key")
            data = (args.plan.parent / "media" / key).read_bytes()
            if sha(data) != a["sha256"]:
                raise ValueError("Changed frame bytes")
            images.append(Image.open(io.BytesIO(data)).convert("RGB"))
        frozen.append((frames, images))
    args.output.mkdir(parents=True, exist_ok=False)
    receipt = {"model": str(args.model), "revision": "10c35caafbb80f7dc6a7a432cdd11af10a6d4818",
               "implementationSha256": sha(Path(__file__).read_bytes()),
               "baselineSha256": sha(args.plan.read_bytes()), "contractSha256": sha(contract_bytes),
               "temperature": 0, "maxTokens": 4096, "thinkingBudget": 1536,
               "maxPixelsPerFrame": 262144, "cases": 5, "framesPerCase": 16,
               "retries": 0, "network": "offline", "nativeImages": True,
               "structuredOutput": "llguidance-thinking-aware"}
    (args.output / "plan.json").write_text(json.dumps(receipt, indent=2))
    (args.output / "contract.json").write_bytes(contract_bytes)
    # Leave memory for the OS and running application. Never raise OS limits.
    mx.set_memory_limit(25 * 1024**3)
    mx.set_cache_limit(256 * 1024**2)
    print("Loading local weights", flush=True)
    model, processor = load(str(args.model), trust_remote_code=False)
    # MLX installs its own NumPy Qwen processor, whose operative settings are
    # min_pixels/max_pixels; assigning HF's .size silently creates an unused attr.
    processor.image_processor.min_pixels = 4096
    processor.image_processor.max_pixels = 262144
    for index, (frames, images) in enumerate(frozen):
        content = [{"type": "text", "text": "Chronological video frames. Gaps are unobserved."}]
        for i, a in enumerate(frames):
            content.extend([{"type": "text", "text": f"f{i+1}: {a['offsetMs']} ms"}, {"type": "image"}])
        content.append({"type": "text", "text": "Inspect every frame. Return JSON matching this schema: " + json.dumps(contract["schema"])})
        messages = [{"role": "system", "content": contract["prompt"]}, {"role": "user", "content": content}]
        prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=True)
        prepared = prepare_inputs(processor, images=images, prompts=prompt, add_special_tokens=False)
        grids = prepared["image_grid_thw"].tolist()
        patch = processor.image_processor.patch_size
        if len(grids) != 16 or any(t != 1 or h*w*patch*patch > 262144 for t,h,w in grids):
            raise ValueError("Actual image grids violate the sixteen-frame pixel bound")
        (args.output / f"case-{index}-request.json").write_text(json.dumps({
            "messages": messages, "frames": frames, "processedImageGrids": grids,
            "patchSize": patch, "inputTokens": int(prepared["input_ids"].shape[-1]),
            "processor": type(processor.image_processor).__name__}, indent=2))
        prepared["mask"] = prepared.pop("attention_mask", None)
        print(f"Case {index}: starting", flush=True)
        started = time.monotonic()
        parts = []
        last = None
        grammar = ThinkingAwareLogitsProcessor(
            build_json_schema_logits_processor(processor.tokenizer, contract["schema"]),
            processor.tokenizer, enable_thinking=True)
        with (args.output / f"case-{index}-partial.txt").open("w") as partial:
            for chunk in stream_generate(model, processor, prompt, max_tokens=4096,
                                         temperature=0, prefill_step_size=512, thinking_budget=1536,
                                         enable_thinking=True, logits_processors=[grammar], **prepared):
                parts.append(chunk.text)
                partial.write(chunk.text)
                partial.flush()
                last = chunk
                if chunk.generation_tokens and chunk.generation_tokens % 256 == 0:
                    print(f"Case {index}: {chunk.generation_tokens} tokens", flush=True)
        raw = "".join(parts)
        result = {"case": index, "text": raw, "seconds": time.monotonic()-started,
                  "promptTokens": last.prompt_tokens, "outputTokens": last.generation_tokens,
                  "peakMemoryGB": last.peak_memory, "finishReason": last.finish_reason}
        (args.output / f"case-{index}-response.json").write_text(json.dumps(result, indent=2))
        print(json.dumps({k:v for k,v in result.items() if k != "text"}), flush=True)
        mx.clear_cache()


if __name__ == "__main__":
    main()
