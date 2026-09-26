package handlers

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"uuid"

	"github.com/opendungeon/opendungeon/internal/repository"
	"github.com/opendungeon/opendungeon/models"
	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

func CreateFriend(
	ctx context.Context,
	conn *sql.Conn,
	userID uuid.UUID,
	targetUsername string,
) error {
	repo := repository.New(conn)
	rows, err := repo.CreateFriend(ctx, repository.CreateFriendParams{
		InitiatorUuid:  userID,
		TargetUsername: targetUsername,
	})
	if err != nil {
		sqlErr := new(sqlite.Error)
		if errors.As(err, &sqlErr) {
			if sqlErr.Code() == sqlite3.SQLITE_CONSTRAINT_FOREIGNKEY {
				return ErrForeignKeyViolation
			} else if sqlErr.Code() == sqlite3.SQLITE_CONSTRAINT_CHECK {
				return ErrCheckViolation
			}
		}

		slog.Error("failed to create friend", "error", err)
		return ErrDatabaseFailure
	}

	if rows == 0 {
		return ErrNotFound
	}

	return nil
}

func ConfirmFriend(
	ctx context.Context,
	conn *sql.Conn,
	userID uuid.UUID,
	targetID uuid.UUID,
) error {
	repo := repository.New(conn)
	err := repo.ConfirmFriend(ctx, repository.ConfirmFriendParams{
		UserUuid:   userID,
		TargetUuid: targetID,
	})
	if err != nil {
		sqlErr := new(sqlite.Error)
		if errors.As(err, &sqlErr) {
			if sqlErr.Code() == sqlite3.SQLITE_CONSTRAINT_FOREIGNKEY {
				return ErrForeignKeyViolation
			}
		}

		slog.Error("failed to confirm friend", "error", err)
		return ErrDatabaseFailure
	}

	return nil
}

func DeleteFriend(
	ctx context.Context,
	conn *sql.Conn,
	userID uuid.UUID,
	targetID uuid.UUID,
) error {
	repo := repository.New(conn)
	err := repo.DeleteFriend(ctx, repository.DeleteFriendParams{
		UserUuid:   userID,
		TargetUuid: targetID,
	})
	if err != nil {
		sqlErr := new(sqlite.Error)
		if errors.As(err, &sqlErr) {
			if sqlErr.Code() == sqlite3.SQLITE_CONSTRAINT_FOREIGNKEY {
				return ErrForeignKeyViolation
			}
		}

		slog.Error("failed to delete friend", "error", err)
		return ErrDatabaseFailure
	}

	return nil
}

func ListFriends(
	ctx context.Context,
	conn *sql.Conn,
	userID uuid.UUID,
) ([]models.Friend, error) {
	repo := repository.New(conn)
	friends, err := repo.ListFriends(ctx, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return []models.Friend{}, nil
		}

		slog.Error("failed to get friends", "error", err)
		return nil, ErrDatabaseFailure
	}

	return models.RepoToFriends(friends, userID), nil
}
