package controller

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func saveSeedreamImageTaskResponse(requestFile string, body []byte) error {
	f, err := os.CreateTemp(filepath.Dir(requestFile), "seedream-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	_, err = f.Write(body)
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(f.Name(), requestFile+".outputs")
}

func finishSeedreamImageTask(task *model.Task, response *dto.ImageResponse, status, quota int) {
	var payload playgroundImageTaskPayload
	_ = task.GetData(&payload)
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "/pg/media", nil)
	c := &gin.Context{Request: req}
	c.Set("id", task.UserId)
	c.Set(common.RequestIdKey, payload.RequestID)
	items, err := cacheSeedreamImageTaskItems(c, task, &payload, response)
	if err != nil {
		markPlaygroundImageTaskFailure(task, "生成结果转存失败，未能交付完整图片。")
		return
	}
	payload.Items = items
	markPlaygroundImageTaskSuccess(task, items[0], &payload, status, quota)
}

func cacheSeedreamImageTaskItems(c *gin.Context, task *model.Task, payload *playgroundImageTaskPayload, response *dto.ImageResponse) ([]*playgroundMediaItem, error) {
	if response == nil || len(response.Data) == 0 || len(response.Data) > 100 {
		return nil, errors.New("invalid number of generated images")
	}
	items := make([]*playgroundMediaItem, 0, len(response.Data))
	for _, data := range response.Data {
		item, err := cachePlaygroundImageTaskData(c, task, payload, data)
		if err != nil && data.Url != "" && c.Request.Context().Err() == nil {
			// Only repeat the download. Generating again would charge for a different result.
			item, err = cachePlaygroundImageTaskData(c, task, payload, data)
		}
		if err == nil {
			filename := filepath.Join(playgroundMediaUserDir(c), item.Filename)
			items = append(items, item)
			layer := seedreamImageTaskLayer(data)
			if len(layer) > 0 {
				if item.Metadata == nil {
					item.Metadata = map[string]interface{}{}
				}
				item.Metadata["layer"] = layer
				err = writePlaygroundMediaMetadata(filename, item)
			}
		}
		if err != nil {
			for _, cached := range items {
				removePlaygroundMediaWithMetadata(filepath.Join(playgroundMediaUserDir(c), cached.Filename))
			}
			return nil, err
		}
	}
	return items, nil
}

func seedreamImageTaskLayer(data dto.ImageData) map[string]interface{} {
	var metadata map[string]interface{}
	// Use the response DTO's allowlisted layer fields. Media bodies never enter task history.
	data.Url, data.B64Json, data.RevisedPrompt = "", "", ""
	raw, _ := json.Marshal(data)
	_ = json.Unmarshal(raw, &metadata)
	delete(metadata, "url")
	delete(metadata, "b64_json")
	delete(metadata, "revised_prompt")
	return metadata
}
