package models

type Cell struct {
	Texture    int `json:"texture"` // -1 indicates no texture is in use
	Decoration struct {
		Index    int `json:"index"`    // -1 indicates no decoration in use
		Rotation int `json:"rotation"` // degrees on y axis
	} `json:"decoration"`
}

type LevelData struct {
	Version     int       `json:"version"`
	Textures    []string  `json:"textures"`
	Decorations []string  `json:"decorations"`
	Grid        [][]*Cell `json:"grid"`
}
