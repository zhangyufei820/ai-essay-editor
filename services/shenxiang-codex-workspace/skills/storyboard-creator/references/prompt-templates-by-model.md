# Prompt Templates By Model

Use these as suffixes or formatting hints. Keep prompts clear and concrete.

## Image Models

### gpt-image-2

Best for instruction-following and clean design. Use natural language paragraph prompts.

Suffix:

```text
Clean composition, coherent anatomy, consistent character design, cinematic lighting, no text unless explicitly requested.
```

### Midjourney

Best for stylized concept art.

Suffix:

```text
--ar {ratio} --style raw --v 6
```

### FLUX / SD

Best with concise comma-separated prompt plus negative prompt.

Positive pattern:

```text
subject, anchor traits, scene, shot type, lens, lighting, mood, style, high detail
```

Negative pattern:

```text
inconsistent face, extra fingers, distorted hands, bad anatomy, duplicate person, unreadable text, watermark, logo
```

## Video Models

### doubao-seedance

Use direct cinematic action. Keep motion simple.

Pattern:

```text
{shot_type}. {character_anchor}. {scene_anchor}. {one action}. Camera {movement}. {lighting}. Smooth natural motion, no cuts.
```

### Sora

Can handle richer natural language and synchronized visual continuity.

Pattern:

```text
A cinematic {duration}-second shot in {ratio}. {character_anchor}. {scene_anchor}. {action}. The camera {movement}; maintain consistent identity, lighting, wardrobe, and spatial layout throughout the shot.
```

### Veo

Use concise cinematic direction and physical camera language.

Pattern:

```text
Cinematic shot, {movement}, {subject action}, {environment}, realistic motion, stable character identity, consistent lighting.
```

### Kling / Runway / Pika

Keep movement controlled and avoid complex multi-step action.

Pattern:

```text
Single continuous shot. {subject}. {action}. {camera_movement}. {mood}. Keep character appearance consistent, avoid scene cuts.
```
