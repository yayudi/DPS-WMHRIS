package kernel

import (
	"reflect"
	"testing"
	"time"
)

type dummyEntity struct {
	BaseEntity
	SoftDeletable
	Title string `db:"title" json:"title"`
}

type dummyLog struct {
	ImmutableEntity
	Message string `db:"message" json:"message"`
}

func TestKernelEntities(t *testing.T) {
	now := time.Now()

	entity := dummyEntity{
		BaseEntity: BaseEntity{
			ID:        10,
			CreatedAt: now,
			UpdatedAt: now,
		},
		SoftDeletable: SoftDeletable{
			DeletedAt: nil,
		},
		Title: "Test",
	}

	if entity.ID != 10 {
		t.Errorf("entity.ID = %d, want 10", entity.ID)
	}
	if !entity.CreatedAt.Equal(now) {
		t.Errorf("entity.CreatedAt = %v, want %v", entity.CreatedAt, now)
	}
	if entity.DeletedAt != nil {
		t.Errorf("entity.DeletedAt should be nil")
	}

	logEntry := dummyLog{
		ImmutableEntity: ImmutableEntity{
			ID:        20,
			CreatedAt: now,
		},
		Message: "log",
	}

	if logEntry.ID != 20 {
		t.Errorf("logEntry.ID = %d, want 20", logEntry.ID)
	}

	// Verify struct tags
	baseType := reflect.TypeOf(BaseEntity{})
	idField, _ := baseType.FieldByName("ID")
	if idField.Tag.Get("db") != "id" || idField.Tag.Get("json") != "id" {
		t.Errorf("BaseEntity.ID struct tag mismatch")
	}

	softType := reflect.TypeOf(SoftDeletable{})
	delField, _ := softType.FieldByName("DeletedAt")
	if delField.Tag.Get("db") != "deleted_at" || delField.Tag.Get("json") != "deleted_at" {
		t.Errorf("SoftDeletable.DeletedAt struct tag mismatch")
	}
}

