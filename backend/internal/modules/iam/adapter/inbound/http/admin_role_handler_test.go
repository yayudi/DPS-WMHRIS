package http_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	iam_http "github.com/dps-wmhris/backend/internal/modules/iam/adapter/inbound/http"
	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

type mockAdminUserUseCase struct {
	getAllUsersFunc         func(ctx context.Context) ([]iam_dto.AdminUserResponse, error)
	getRolesFunc            func(ctx context.Context) ([]iam_dto.RoleResponse, error)
	createUserFunc          func(ctx context.Context, req iam_dto.AdminCreateUserRequest, adminID int, ip, ua string) (*iam_dto.AdminUserResponse, error)
	updateUserFunc          func(ctx context.Context, targetID int, req iam_dto.AdminUpdateUserRequest, adminID int, ip, ua string) error
	deleteUserFunc          func(ctx context.Context, targetID int, adminID int, ip, ua string) error
	getUserLocationsFunc    func(ctx context.Context, targetID int) ([]int, error)
	updateUserLocationsFunc func(ctx context.Context, targetID int, req iam_dto.AdminUpdateUserLocationsRequest, adminID int, ip, ua string) error
}

func (m *mockAdminUserUseCase) GetAllUsers(ctx context.Context) ([]iam_dto.AdminUserResponse, error) {
	if m.getAllUsersFunc != nil {
		return m.getAllUsersFunc(ctx)
	}
	return []iam_dto.AdminUserResponse{}, nil
}

func (m *mockAdminUserUseCase) GetRoles(ctx context.Context) ([]iam_dto.RoleResponse, error) {
	if m.getRolesFunc != nil {
		return m.getRolesFunc(ctx)
	}
	return []iam_dto.RoleResponse{}, nil
}

func (m *mockAdminUserUseCase) CreateUser(ctx context.Context, req iam_dto.AdminCreateUserRequest, adminID int, ip, ua string) (*iam_dto.AdminUserResponse, error) {
	if m.createUserFunc != nil {
		return m.createUserFunc(ctx, req, adminID, ip, ua)
	}
	return &iam_dto.AdminUserResponse{ID: 10, Username: req.Username}, nil
}

func (m *mockAdminUserUseCase) UpdateUser(ctx context.Context, targetID int, req iam_dto.AdminUpdateUserRequest, adminID int, ip, ua string) error {
	if m.updateUserFunc != nil {
		return m.updateUserFunc(ctx, targetID, req, adminID, ip, ua)
	}
	return nil
}

func (m *mockAdminUserUseCase) DeleteUser(ctx context.Context, targetID int, adminID int, ip, ua string) error {
	if m.deleteUserFunc != nil {
		return m.deleteUserFunc(ctx, targetID, adminID, ip, ua)
	}
	return nil
}

func (m *mockAdminUserUseCase) GetUserLocations(ctx context.Context, targetID int) ([]int, error) {
	if m.getUserLocationsFunc != nil {
		return m.getUserLocationsFunc(ctx, targetID)
	}
	return []int{1, 2}, nil
}

func (m *mockAdminUserUseCase) UpdateUserLocations(ctx context.Context, targetID int, req iam_dto.AdminUpdateUserLocationsRequest, adminID int, ip, ua string) error {
	if m.updateUserLocationsFunc != nil {
		return m.updateUserLocationsFunc(ctx, targetID, req, adminID, ip, ua)
	}
	return nil
}

type mockRoleUseCase struct {
	getRolesFunc              func(ctx context.Context) ([]iam_dto.RoleResponse, error)
	getPermissionsFunc        func(ctx context.Context) ([]iam_dto.PermissionResponse, error)
	getRolePermissionsFunc    func(ctx context.Context, roleID int) ([]int, error)
	updateRolePermissionsFunc func(ctx context.Context, roleID int, req iam_dto.AssignPermissionsRequest, userID int, ip, ua string) error
	createRoleFunc            func(ctx context.Context, req iam_dto.CreateRoleRequest, userID int, ip, ua string) (int, error)
	updateRoleFunc            func(ctx context.Context, roleID int, req iam_dto.CreateRoleRequest, userID int, ip, ua string) error
	deleteRoleFunc            func(ctx context.Context, roleID int, userID int, ip, ua string) error
}

func (m *mockRoleUseCase) GetRoles(ctx context.Context) ([]iam_dto.RoleResponse, error) {
	if m.getRolesFunc != nil {
		return m.getRolesFunc(ctx)
	}
	return []iam_dto.RoleResponse{{ID: 1, Name: "Superadmin"}}, nil
}

func (m *mockRoleUseCase) GetPermissions(ctx context.Context) ([]iam_dto.PermissionResponse, error) {
	if m.getPermissionsFunc != nil {
		return m.getPermissionsFunc(ctx)
	}
	return []iam_dto.PermissionResponse{}, nil
}

func (m *mockRoleUseCase) GetRolePermissions(ctx context.Context, roleID int) ([]int, error) {
	if m.getRolePermissionsFunc != nil {
		return m.getRolePermissionsFunc(ctx, roleID)
	}
	return []int{10}, nil
}

func (m *mockRoleUseCase) UpdateRolePermissions(ctx context.Context, roleID int, req iam_dto.AssignPermissionsRequest, userID int, ip, ua string) error {
	if m.updateRolePermissionsFunc != nil {
		return m.updateRolePermissionsFunc(ctx, roleID, req, userID, ip, ua)
	}
	return nil
}

func (m *mockRoleUseCase) CreateRole(ctx context.Context, req iam_dto.CreateRoleRequest, userID int, ip, ua string) (int, error) {
	if m.createRoleFunc != nil {
		return m.createRoleFunc(ctx, req, userID, ip, ua)
	}
	return 5, nil
}

func (m *mockRoleUseCase) UpdateRole(ctx context.Context, roleID int, req iam_dto.CreateRoleRequest, userID int, ip, ua string) error {
	if m.updateRoleFunc != nil {
		return m.updateRoleFunc(ctx, roleID, req, userID, ip, ua)
	}
	return nil
}

func (m *mockRoleUseCase) DeleteRole(ctx context.Context, roleID int, userID int, ip, ua string) error {
	if m.deleteRoleFunc != nil {
		return m.deleteRoleFunc(ctx, roleID, userID, ip, ua)
	}
	return nil
}

func TestUserHandler_LoginCookieAndProfileGuard(t *testing.T) {
	gin.SetMode(gin.TestMode)
	prevEnv := config.AppConfig.Env
	config.AppConfig.Env = "production"
	t.Cleanup(func() {
		config.AppConfig.Env = prevEnv
	})

	userUC := &mockUserUseCase{
		loginFunc: func(ctx context.Context, req iam_dto.LoginRequest) (*iam_dto.LoginResponse, error) {
			return &iam_dto.LoginResponse{
				Token: "jwt-token-xyz",
				UserInfo: iam_dto.UserProfile{
					ID:       7,
					Username: req.Username,
				},
			}, nil
		},
	}
	handler := iam_http.NewUserHandler(userUC)
	r := gin.New()
	r.POST("/auth/login", handler.Login)
	r.GET("/user/profile", handler.GetProfile)

	// 1. Login in production sets Secure, HttpOnly, SameSite=Lax, and Max-Age=86400 cookie
	loginBody := bytes.NewBufferString(`{"username":"admin","password":"secret"}`)
	reqLogin, _ := http.NewRequest(http.MethodPost, "/auth/login", loginBody)
	reqLogin.Header.Set("Content-Type", "application/json")
	wLogin := httptest.NewRecorder()
	r.ServeHTTP(wLogin, reqLogin)

	if wLogin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on login, got %d", wLogin.Code)
	}
	cookies := wLogin.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected 1 cookie, got %d", len(cookies))
	}
	tokenCookie := cookies[0]
	if tokenCookie.Name != "token" || !tokenCookie.HttpOnly || !tokenCookie.Secure || tokenCookie.MaxAge != 86400 || tokenCookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("unexpected cookie attributes: %+v", tokenCookie)
	}

	// 2. GetProfile without authenticated userID in context returns 401
	reqProfile, _ := http.NewRequest(http.MethodGet, "/user/profile", nil)
	wProfile := httptest.NewRecorder()
	r.ServeHTTP(wProfile, reqProfile)
	if wProfile.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized on unauthenticated GetProfile, got %d", wProfile.Code)
	}
}

func TestAdminUserAndRoleHandlers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	adminUC := &mockAdminUserUseCase{
		deleteUserFunc: func(ctx context.Context, targetID int, adminID int, ip, ua string) error {
			if targetID == adminID {
				return apperror.Validation("settings.user.cannot_delete_self", "VALIDATION_ERROR")
			}
			return nil
		},
	}
	roleUC := &mockRoleUseCase{
		deleteRoleFunc: func(ctx context.Context, roleID int, userID int, ip, ua string) error {
			if roleID == 1 {
				return apperror.Forbidden("settings.roles.superadmin_protected", "FORBIDDEN")
			}
			return nil
		},
	}

	adminHandler := iam_http.NewAdminUserHandler(adminUC)
	roleHandler := iam_http.NewRoleHandler(roleUC)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserIDKey, 1)
		c.Next()
	})
	r.GET("/admin/users", adminHandler.GetUsers)
	r.DELETE("/admin/users/:id", adminHandler.DeleteUser)
	r.POST("/roles", roleHandler.CreateRole)
	r.DELETE("/roles/:id", roleHandler.DeleteRole)

	// 1. GET /admin/users returns {"success":true,"users":[]}
	reqUsers, _ := http.NewRequest(http.MethodGet, "/admin/users", nil)
	wUsers := httptest.NewRecorder()
	r.ServeHTTP(wUsers, reqUsers)
	if wUsers.Code != http.StatusOK || !strings.Contains(wUsers.Body.String(), `"users"`) {
		t.Fatalf("expected 200 with users payload, got %d: %s", wUsers.Code, wUsers.Body.String())
	}

	// 2. DELETE /admin/users/1 (self) returns 400 Bad Request
	reqDelSelf, _ := http.NewRequest(http.MethodDelete, "/admin/users/1", nil)
	wDelSelf := httptest.NewRecorder()
	r.ServeHTTP(wDelSelf, reqDelSelf)
	if wDelSelf.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on self-delete, got %d", wDelSelf.Code)
	}

	// 3. POST /roles creates a role with 201 Created
	reqCreateRole, _ := http.NewRequest(http.MethodPost, "/roles", bytes.NewBufferString(`{"name":"Auditor"}`))
	reqCreateRole.Header.Set("Content-Type", "application/json")
	wCreateRole := httptest.NewRecorder()
	r.ServeHTTP(wCreateRole, reqCreateRole)
	if wCreateRole.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on CreateRole, got %d: %s", wCreateRole.Code, wCreateRole.Body.String())
	}

	// 4. DELETE /roles/1 (Superadmin) returns 403 Forbidden
	reqDelRole, _ := http.NewRequest(http.MethodDelete, "/roles/1", nil)
	wDelRole := httptest.NewRecorder()
	r.ServeHTTP(wDelRole, reqDelRole)
	if wDelRole.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden on deleting Superadmin role, got %d", wDelRole.Code)
	}
}
