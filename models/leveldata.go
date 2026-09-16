package models

type Cell struct {
	Texture int `json:"texture"` // -1 indicates no texture is in use
}

type LevelData struct {
	Version     int       `json:"version"`
	Textures    []string  `json:"textures"`
	Decorations []string  `json:"decorations"`
	Grid        [][]*Cell `json:"grid"`
	Objects     struct {
		Decorations []struct {
			Index    int     `json:"index"` // must be a valid index, cannot be -1
			X        float32 `json:"x"`
			Y        float32 `json:"y"`
			Z        float32 `json:"z"`        // defaults to 0.1 for now
			Rotation int     `json:"rotation"` // degrees on y axis
			Scale    float32 `json:"scale"`    // multiplier for all axes
		} `json:"decorations"`
	} `json:"objects"`
}
