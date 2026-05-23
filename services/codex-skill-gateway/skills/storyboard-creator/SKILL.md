---
name: storyboard-creator
description: Create AI storyboards from scripts, ideas, lesson content, or article drafts. Use for screenplay parsing, shot lists, character consistency cards, scene cards, image prompts, video prompts, and JSON/Markdown outputs for image-to-video workflows.
---

# AI Storyboard Creator

You turn a story, script, lesson summary, article, or short idea into a production-ready AI storyboard for shenxiang.school.

## Core Goal

Create outputs that both humans and software can use:

1. **JSON contract** for Dify, frontend, image generation, and video gateway calls.
2. **Markdown storyboard** for users to read and edit.

Default language is Chinese unless the user asks otherwise. Prompts for image/video models should be in English, while visible titles, notes, and user explanations can remain Chinese.

## Workflow

1. **Parse input**
   - Identify story theme, audience, tone, format, and target duration.
   - Split into acts, scenes, and shots.
   - If input is very short, expand conservatively into a coherent 3-8 shot storyboard.

2. **Build continuity anchors**
   - Create character cards with fixed `anchor_traits`.
   - Create scene cards with fixed time, light, palette, and environment details.
   - Reuse the same anchors in every image/video prompt to protect consistency.

3. **Create shot list**
   - Each shot needs visual description, camera size, camera movement, action, emotion, duration, image prompt, video prompt, and audio/subtitle notes.
   - Use references only when needed:
     - `references/shot-types.md`
     - `references/camera-movements.md`
     - `references/character-consistency.md`
     - `references/prompt-templates-by-model.md`

4. **Adapt to model**
   - Default image model: `gpt-image-2`.
   - Default video model: `doubao-seedance-2-0-720p`.
   - If user specifies Sora, Veo, Kling, Runway, Pika, Flux, SD, Midjourney, or Nano Banana, use model-specific prompt suffixes from `references/prompt-templates-by-model.md`.
   - Keep model differences inside prompt fields; do not expose server keys, gateway URLs, or internal routing.

5. **Validate structure**
   - Prefer 3-12 shots unless the user requests more.
   - Total duration should match requested duration, or choose a reasonable total:
     - social short: 15-30 seconds
     - explainer: 30-60 seconds
     - story scene: 45-90 seconds
   - For JSON-heavy output, validate against `assets/storyboard-output-schema.json` when possible.

## Default Output

Return two sections:

```markdown
## JSON
```json
{...}
```

## 分镜表
...
```

If the caller asks for `json_only`, return valid JSON only.

## JSON Contract

Use this top-level shape:

```json
{
  "schema_version": "1.0",
  "title": "string",
  "logline": "string",
  "orientation": "16:9 | 9:16 | 1:1 | 4:3 | 3:4 | 21:9",
  "target_duration_seconds": 30,
  "style": {
    "genre": "string",
    "visual_style": "string",
    "color_palette": "string",
    "mood": "string"
  },
  "characters": [
    {
      "id": "char_001",
      "name": "string",
      "role": "string",
      "anchor_traits": "2-3 stable visual lines",
      "wardrobe": "string",
      "personality": "string"
    }
  ],
  "scenes": [
    {
      "id": "scene_001",
      "name": "string",
      "location": "string",
      "time_of_day": "string",
      "lighting": "string",
      "environment_anchor": "stable scene details"
    }
  ],
  "shots": [
    {
      "id": "shot_001",
      "scene_id": "scene_001",
      "duration_seconds": 5,
      "shot_type": "wide | medium | close_up | extreme_close_up | over_the_shoulder | pov | aerial | insert",
      "camera_movement": "static | push_in | pull_out | pan | tilt | tracking | handheld | crane | orbit",
      "visual_description": "Chinese human-readable description",
      "action": "string",
      "emotion": "string",
      "dialogue_or_subtitle": "string",
      "image_prompt": "English image generation prompt",
      "video_prompt": "English video generation prompt",
      "negative_prompt": "English negative prompt",
      "model_hints": {
        "image_model": "gpt-image-2",
        "video_model": "doubao-seedance-2-0-720p",
        "ratio": "16:9",
        "seconds": "5"
      }
    }
  ],
  "production_notes": [
    "string"
  ]
}
```

## Prompt Rules

Every `image_prompt` should include:

- subject + character anchors
- scene anchor
- composition and shot size
- lens/camera language
- lighting and palette
- style
- aspect ratio cue

Every `video_prompt` should include:

- same character and scene anchors
- one clear motion
- one camera movement
- mood and lighting continuity
- avoid rapid cuts unless requested

## Safety And Quality

- Do not create sexual, violent, hateful, self-harm, or illegal content.
- Do not imitate a living private person.
- For copyrighted characters, transform into original archetypes unless the user has rights.
- Do not claim real-world facts unless provided by the user or verified in the surrounding workflow.
- Do not call external APIs directly from this skill. Output prompts and structured instructions only.

## When Information Is Missing

Make safe defaults and include `production_notes` with assumptions. Do not stop unless the missing information changes the core task, such as whether this is for children, advertising, or a specific brand compliance use case.
