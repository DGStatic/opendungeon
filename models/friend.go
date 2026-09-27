package models

import (
	"uuid"

	"github.com/opendungeon/opendungeon/internal/repository"
)

type Friend struct {
	InitiatorID uuid.UUID `json:"initiatorID"`
	TargetID    uuid.UUID `json:"targetID"`
	Profile     Profile   `json:"profile"`
	Confirmed   bool      `json:"confirmed"`
	CreatedAt   int64     `json:"createdAt"`
}

func RepoToFriend(initiatorID, targetID uuid.UUID, confirmed bool, createdAt int64, p Profile) Friend {
	return Friend{
		InitiatorID: initiatorID,
		TargetID:    targetID,
		Profile:     p,
		Confirmed:   confirmed,
		CreatedAt:   createdAt,
	}
}

func RepoToFriends(f []repository.ListFriendsRow, userID uuid.UUID) []Friend {
	friends := make([]Friend, 0, len(f))
	for _, row := range f {
		id := row.TargetUuid
		if row.TargetUuid == userID {
			id = row.InitiatorUuid
		}
		var avatar *uuid.UUID
		if row.AvatarUuid != nil {
			avatarId := uuid.MustParse(string(row.AvatarUuid))
			avatar = &avatarId
		}
		profile := RepoToProfile(row.Profile, id, avatar)
		friends = append(friends, RepoToFriend(row.InitiatorUuid, row.TargetUuid, row.Confirmed, row.CreatedAt, profile))
	}

	return friends
}
