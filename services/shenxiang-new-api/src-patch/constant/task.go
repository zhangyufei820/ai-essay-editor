package constant

type TaskPlatform string

const (
	TaskPlatformSuno            TaskPlatform = "suno"
	TaskPlatformMidjourney                   = "mj"
	TaskPlatformPlaygroundImage              = "playground_image"
	TaskPlatformPlaygroundUpscale            = "playground_upscale"
)

const (
	SunoActionMusic  = "MUSIC"
	SunoActionLyrics = "LYRICS"

	TaskActionGenerate          = "generate"
	TaskActionTextGenerate      = "textGenerate"
	TaskActionFirstTailGenerate = "firstTailGenerate"
	TaskActionReferenceGenerate = "referenceGenerate"
	TaskActionRemix             = "remixGenerate"
	TaskActionImageRecover      = "imageRecover"
	TaskActionImageGenerate     = "imageGenerate"
	TaskActionImageEdit         = "imageEdit"
	TaskActionImageUpscale      = "imageUpscale"
)

var SunoModel2Action = map[string]string{
	"suno_music":  SunoActionMusic,
	"suno_lyrics": SunoActionLyrics,
}
