# Image And Video Prompt Patterns

This file synthesizes reusable patterns from the local prompt export under the user's WeChat file directory. It does not copy source prompts verbatim; it keeps only practical rules for this skill.

Matched source families:

- `AI绘画提示词生成器`
- `Meta MJ`
- `Video Generation Guide`
- `Sora 与 Veo3 视频生成元提示词`
- `当代舞现场 Storyboard`
- `冬季生存惊悚 Storyboard`
- related local image, storyboard, scene, poster, and video prompt files

## Image Prompt Formula

Use this order:

```text
subject + stable character/prop anchors, environment, action/pose, composition and shot size, lens/camera angle, lighting source and direction, palette, texture/material, style, aspect ratio cue, quality/consistency constraints
```

For image models that prefer natural language, use one concise paragraph. For SD/Flux-like models, use comma-separated phrases plus a negative prompt.

Strong image prompts are concrete:

- Replace vague mood with visible evidence.
- Include foreground, midground, and background only when they matter.
- Add lens and shot-size language when the output must match a shot list.
- Add lighting source, direction, and color temperature when continuity matters.
- Avoid visible text unless the user explicitly requests a typography/layout image.

Default negative prompt:

```text
inconsistent face, inconsistent wardrobe, wrong prop shape, bad anatomy, distorted hands, extra fingers, duplicate person, unreadable text, watermark, logo, over-saturated color, plastic AI face
```

## Video Prompt Formula

Treat each video prompt as a cinematographer's brief:

```text
style intent, shot size/framing, subject anchor, scene anchor, one subject action, one camera movement, lighting continuity, duration, no cuts
```

Use one action and one camera move per shot. If the desired action is complex, split it into multiple shots.

Good video prompt fields:

- `shot_size`: WIDE, MED, MCU, CU, ECU.
- `camera_movement`: Static, Pan, Tilt, Dolly In, Dolly Out, Truck, Crane, Arc, Handheld, Steadicam, Whip Pan, Zoom.
- `action`: physical action in observable beats.
- `environment`: foreground/midground/background only when useful.
- `lighting`: source, direction, quality, palette.
- `duration`: 2s, 4s, 5s, 8s, etc.

## Model Notes

### gpt-image-2

Use complete natural-language instructions. Good for precise composition, design, and storyboard sheet render prompts.

Pattern:

```text
Create [format]. [subject and anchors]. [scene]. [composition, shot size, camera/lens]. [lighting and palette]. [style constraints]. No visible text unless explicitly requested.
```

### Midjourney

Use visual tokens, compact phrasing, and ratio parameters. Use weights only when the user needs emphasis.

Pattern:

```text
/imagine: [reference image URL if any] [subject] [setting] [composition] [camera/lens] [lighting] [style] --ar [ratio] --style raw
```

### Flux / SD

Use comma-separated positive prompt and a separate negative prompt.

### Sora / Veo / Runway / Kling / Pika

Use controlled motion. Include physical cause/effect only when relevant. For start/end frame workflows, clearly state what the first frame locks and what the end frame should become.

Image-to-video pattern:

```text
Single continuous [duration]-second shot in [ratio]. Use the provided first frame as the locked starting composition. [character anchor]. [scene anchor]. [one action]. Camera [movement]. Maintain consistent identity, wardrobe, prop shape, lighting direction, and spatial layout. No cuts, no morphing, no text overlays.
```

Start/end frame pattern:

```text
Interpolate from the provided first frame to the provided last frame. Preserve character identity, costume, prop geometry, scene layout, and light direction. [describe the transition action]. Smooth natural motion, no scene cut, no new objects.
```

## Storyboard Thumbnail Prompt Pattern

For `Frame` cells in a Shot List Sheet:

```text
dark warm-gray cinematic storyboard thumbnail, [shot content], [shot size], [camera angle], [movement cue], rough production sketch energy, realistic human proportions, readable silhouette, low-saturation film still mood, no comic bubble, no decorative frame, no paper texture
```

The thumbnail prompt must match the row's `visual_description`. If the row describes a prop insert, the thumbnail must show the prop insert, not a character portrait.

