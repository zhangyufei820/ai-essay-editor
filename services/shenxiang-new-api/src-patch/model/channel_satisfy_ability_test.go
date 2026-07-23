package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func withAbilityCircuitDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:ability-circuit-%p?mode=memory&cache=shared", t)
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec(`
CREATE TABLE channels (
  id INTEGER PRIMARY KEY,
  status INTEGER NOT NULL,
  "group" TEXT NOT NULL,
  tag TEXT
);
CREATE TABLE abilities (
  "group" TEXT NOT NULL,
  model TEXT NOT NULL,
  channel_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  priority INTEGER,
  weight INTEGER,
  tag TEXT,
  PRIMARY KEY ("group", model, channel_id)
);`).Error)
	originalDB := DB
	DB = db
	t.Cleanup(func() { DB = originalDB })
	return db
}

func TestIsChannelAbilityEnabledRequiresLiveEnabledMatchingRoute(t *testing.T) {
	db := withAbilityCircuitDB(t)
	require.NoError(t, db.Exec(
		`INSERT INTO channels (id, status, "group", tag) VALUES (?, ?, ?, ?)`,
		43,
		common.ChannelStatusEnabled,
		"plus",
		"xingren-plus-text-wangwang",
	).Error)
	require.NoError(t, db.Exec(
		`INSERT INTO abilities ("group", model, channel_id, enabled, priority, weight, tag) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"plus",
		"gpt-5.6-sol",
		43,
		1,
		20,
		100,
		"xingren-plus-text-wangwang",
	).Error)

	enabled, err := IsChannelAbilityEnabled("plus", "gpt-5.6-sol", 43)
	require.NoError(t, err)
	require.True(t, enabled)

	require.NoError(t, db.Exec(`UPDATE abilities SET enabled = 0 WHERE channel_id = 43`).Error)
	enabled, err = IsChannelAbilityEnabled("plus", "gpt-5.6-sol", 43)
	require.NoError(t, err)
	require.False(t, enabled)
}

func TestIsChannelAbilityEnabledRejectsTagOrGroupDrift(t *testing.T) {
	db := withAbilityCircuitDB(t)
	require.NoError(t, db.Exec(
		`INSERT INTO channels (id, status, "group", tag) VALUES (?, ?, ?, ?)`,
		44,
		common.ChannelStatusEnabled,
		"plus",
		"expected-tag",
	).Error)
	require.NoError(t, db.Exec(
		`INSERT INTO abilities ("group", model, channel_id, enabled, priority, weight, tag) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"plus",
		"gpt-5.5",
		44,
		1,
		10,
		100,
		"wrong-tag",
	).Error)

	enabled, err := IsChannelAbilityEnabled("plus", "gpt-5.5", 44)
	require.NoError(t, err)
	require.False(t, enabled)

	require.NoError(t, db.Exec(`UPDATE abilities SET tag = 'expected-tag' WHERE channel_id = 44`).Error)
	require.NoError(t, db.Exec(`UPDATE channels SET "group" = 'default' WHERE id = 44`).Error)
	enabled, err = IsChannelAbilityEnabled("plus", "gpt-5.5", 44)
	require.NoError(t, err)
	require.False(t, enabled)
}
