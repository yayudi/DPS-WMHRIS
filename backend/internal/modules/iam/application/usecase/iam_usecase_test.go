package usecase_test

import (
	"context"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/dps-wmhris/backend/internal/modules/iam/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/iam/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
)

type stubTxManager struct{}

func (s *stubTxManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

type failingPrefRepo struct{}

func (f *failingPrefRepo) GetByUserID(ctx context.Context, userID int) (*domain.UserPreference, error) {
	return nil, errors.New("simulated user_preferences table outage")
}
func (f *failingPrefRepo) Upsert(ctx context.Context, pref *domain.UserPreference) error {
	return errors.New("simulated user_preferences table outage")
}

type fullMockUserRepo struct {
	port.UserRepository
	user        *domain.User
	updatedNick *string
	updatedHash *string
}

func (m *fullMockUserRepo) FindByUsername(ctx context.Context, username string) (*domain.User, error) {
	if m.user == nil || m.user.Username != username {
		return nil, errors.New("not found")
	}
	return m.user, nil
}

func (m *fullMockUserRepo) FindByID(ctx context.Context, id int) (*domain.User, error) {
	if m.user == nil || m.user.ID != id {
		return nil, errors.New("not found")
	}
	return m.user, nil
}

func (m *fullMockUserRepo) GetRoleAndPermissions(ctx context.Context, roleID int) (string, []string, error) {
	return "Supervisor", []string{"stock.manage"}, nil
}

func (m *fullMockUserRepo) UpdateProfile(ctx context.Context, userID int, nickname *string, hashedPassword *string) error {
	m.updatedNick = nickname
	m.updatedHash = hashedPassword
	if nickname != nil {
		m.user.Nickname = *nickname
	}
	if hashedPassword != nil {
		m.user.PasswordHash = *hashedPassword
	}
	return nil
}

func TestUserUseCase_LoginAndProfile_Resilience(t *testing.T) {
	origSecret := config.AppConfig.JWTSecret
	config.AppConfig.JWTSecret = "test-login-secret"
	t.Cleanup(func() { config.AppConfig.JWTSecret = origSecret })

	hash, err := bcrypt.GenerateFromPassword([]byte("Secret123!"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("bcrypt error: %v", err)
	}

	activeUser := &domain.User{
		Username:     "budi",
		Nickname:     "Budi Gudang",
		IsActive:     true,
		PasswordHash: string(hash),
		RoleID:       2,
	}
	activeUser.ID = 21

	userRepo := &fullMockUserRepo{user: activeUser}
	// Inject a failing preference repository to verify Login does NOT nil-pointer panic on pref.Locale!
	uc := usecase.NewUserUseCase(&stubTxManager{}, userRepo, &failingPrefRepo{}, nil)

	t.Run("Login succeeds and falls back to default preferences when preference repo fails", func(t *testing.T) {
		res, err := uc.Login(context.Background(), iam_dto.LoginRequest{
			Username: "budi",
			Password: "Secret123!",
		})
		if err != nil {
			t.Fatalf("expected Login to succeed despite preference repo error, got: %v", err)
		}
		if res.Token == "" || res.UserInfo.Preferences == nil || res.UserInfo.Preferences.Locale != domain.DefaultPreferenceLocale {
			t.Errorf("unexpected LoginResponse: %+v", res)
		}
	})

	t.Run("Login rejects wrong password with 401 AppError", func(t *testing.T) {
		_, err := uc.Login(context.Background(), iam_dto.LoginRequest{
			Username: "budi",
			Password: "WrongPassword",
		})
		var appErr *apperror.AppError
		if !errors.As(err, &appErr) || appErr.HTTPStatus != http.StatusUnauthorized {
			t.Fatalf("expected 401 AppError, got %v", err)
		}
	})

	t.Run("Login rejects inactive account with 403 AppError", func(t *testing.T) {
		activeUser.IsActive = false
		t.Cleanup(func() { activeUser.IsActive = true })

		_, err := uc.Login(context.Background(), iam_dto.LoginRequest{
			Username: "budi",
			Password: "Secret123!",
		})
		var appErr *apperror.AppError
		if !errors.As(err, &appErr) || appErr.HTTPStatus != http.StatusForbidden {
			t.Fatalf("expected 403 AppError for inactive user, got %v", err)
		}
	})

	t.Run("UpdateProfile updates nickname and returns full profile with permissions", func(t *testing.T) {
		newNick := "Budi Lead"
		prof, err := uc.UpdateProfile(context.Background(), 21, iam_dto.UpdateProfileRequest{
			CurrentPassword: "Secret123!",
			Nickname:        &newNick,
		}, "127.0.0.1", "UnitTest")
		if err != nil {
			t.Fatalf("UpdateProfile failed: %v", err)
		}
		if prof.Nickname != "Budi Lead" || len(prof.Permissions) != 1 || prof.Preferences == nil {
			t.Errorf("expected full UserProfile after UpdateProfile, got %+v", prof)
		}
	})
}

type mockAdminUserRepo struct {
	port.AdminUserRepository
	existingUser  *domain.User
	lastParams    domain.UserUpdateParams
	insertedLocs  []int
	softDelRows   int
	insertErr     error
}

func (m *mockAdminUserRepo) FindUserByID(ctx context.Context, userID int) (*domain.User, error) {
	return m.existingUser, nil
}

func (m *mockAdminUserRepo) InsertUser(ctx context.Context, username, passwordHash string, roleID int, nickname *string, shiftID *int, excludeFromAttendance bool) (int, error) {
	if m.insertErr != nil {
		return 0, m.insertErr
	}
	return 55, nil
}

func (m *mockAdminUserRepo) UpdateUserByID(ctx context.Context, userID int, params domain.UserUpdateParams) (int, error) {
	m.lastParams = params
	return 1, nil
}

func (m *mockAdminUserRepo) SoftDeleteUser(ctx context.Context, userID int) (int, error) {
	return m.softDelRows, nil
}

func (m *mockAdminUserRepo) DeleteUserLocations(ctx context.Context, userID int) error {
	return nil
}

func (m *mockAdminUserRepo) InsertUserLocations(ctx context.Context, userID int, locationIDs []int) error {
	m.insertedLocs = locationIDs
	return nil
}

func TestAdminUserUseCase_GuardsAndDeduplication(t *testing.T) {
	existing := &domain.User{
		Username: "staff1",
		Nickname: "Staff One",
		RoleID:   2,
	}
	existing.ID = 10

	repo := &mockAdminUserRepo{existingUser: existing, softDelRows: 1}
	uc := usecase.NewAdminUserUseCase(&stubTxManager{}, repo, nil, nil)

	t.Run("DeleteUser blocks self-deletion", func(t *testing.T) {
		err := uc.DeleteUser(context.Background(), 10, 10, "127.0.0.1", "Test")
		var appErr *apperror.AppError
		if !errors.As(err, &appErr) || appErr.HTTPStatus != http.StatusForbidden {
			t.Fatalf("expected 403 when admin tries to delete self, got %v", err)
		}
	})

	t.Run("UpdateUser returns error when bcrypt fails on >72 byte password", func(t *testing.T) {
		tooLongPassword := strings.Repeat("A", 80)
		err := uc.UpdateUser(context.Background(), 10, iam_dto.AdminUpdateUserRequest{
			NewPassword: &tooLongPassword,
		}, 1, "127.0.0.1", "Test")
		if err == nil {
			t.Fatal("expected error when newPassword exceeds bcrypt 72-byte limit, got nil")
		}
	})

	t.Run("UpdateUserLocations deduplicates and strips non-positive location IDs", func(t *testing.T) {
		err := uc.UpdateUserLocations(context.Background(), 10, iam_dto.AdminUpdateUserLocationsRequest{
			LocationIDs: []int{3, 7, 3, 0, -5, 7, 9},
		}, 1, "127.0.0.1", "Test")
		if err != nil {
			t.Fatalf("UpdateUserLocations failed: %v", err)
		}
		if !reflect.DeepEqual(repo.insertedLocs, []int{3, 7, 9}) {
			t.Errorf("expected deduplicated locations [3, 7, 9], got %v", repo.insertedLocs)
		}
	})
}

type mockRoleRepo struct {
	port.RoleRepository
	insertedPerms []int
	deleteErr     error
	deleteOk      bool
}

func (m *mockRoleRepo) DeleteRolePermissions(ctx context.Context, roleID int) error {
	return nil
}

func (m *mockRoleRepo) InsertRolePermissions(ctx context.Context, roleID int, permissionIDs []int) error {
	m.insertedPerms = permissionIDs
	return nil
}

func (m *mockRoleRepo) DeleteRole(ctx context.Context, id int) (bool, error) {
	return m.deleteOk, m.deleteErr
}

func TestRoleUseCase_SuperAdminGuardAndDeduplication(t *testing.T) {
	repo := &mockRoleRepo{deleteOk: true}
	uc := usecase.NewRoleUseCase(&stubTxManager{}, repo, nil)

	t.Run("DeleteRole blocks deleting SuperAdminRoleID (1)", func(t *testing.T) {
		err := uc.DeleteRole(context.Background(), domain.SuperAdminRoleID, 1, "127.0.0.1", "Test")
		var appErr *apperror.AppError
		if !errors.As(err, &appErr) || appErr.HTTPStatus != http.StatusForbidden {
			t.Fatalf("expected 403 when attempting to delete SuperAdmin role, got %v", err)
		}
	})

	t.Run("DeleteRole maps MySQL 1452 FK violation to 409 Conflict", func(t *testing.T) {
		repo.deleteErr = &mysql.MySQLError{Number: 1452, Message: "Cannot delete parent row"}
		t.Cleanup(func() { repo.deleteErr = nil })

		err := uc.DeleteRole(context.Background(), 4, 1, "127.0.0.1", "Test")
		var appErr *apperror.AppError
		if !errors.As(err, &appErr) || appErr.HTTPStatus != http.StatusConflict {
			t.Fatalf("expected 409 Conflict when role is still referenced by users, got %v", err)
		}
	})

	t.Run("UpdateRolePermissions deduplicates permission IDs", func(t *testing.T) {
		err := uc.UpdateRolePermissions(context.Background(), 4, iam_dto.AssignPermissionsRequest{
			PermissionIDs: []int{11, 12, 11, 0, -1, 15},
		}, 1, "127.0.0.1", "Test")
		if err != nil {
			t.Fatalf("UpdateRolePermissions failed: %v", err)
		}
		if !reflect.DeepEqual(repo.insertedPerms, []int{11, 12, 15}) {
			t.Errorf("expected deduplicated permission IDs [11, 12, 15], got %v", repo.insertedPerms)
		}
	})
}
