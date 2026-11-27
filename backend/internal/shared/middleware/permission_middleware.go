package middleware

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"sync"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// PermissionQueryer abstracts the database query method needed to verify role permissions,
// allowing *sqlx.DB in production and mock queryers in isolated unit tests.
type PermissionQueryer interface {
	GetContext(ctx context.Context, dest any, query string, args ...any) error
}

var (
	// permCache stores RoleID -> map[PermissionName]bool.
	permCache = make(map[int]map[string]bool)
	cacheMu   sync.RWMutex
)

// ClearPermissionCache invalidates the cached permissions for a specific role ID.
func ClearPermissionCache(roleID int) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	delete(permCache, roleID)
}

// ClearAllPermissionCache resets the entire in-memory permission cache.
func ClearAllPermissionCache() {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	permCache = make(map[int]map[string]bool)
}

// RequirePermission verifies the JWT role against a specific permission using a lazy-loaded in-memory cache.
func RequirePermission(db PermissionQueryer, requiredPermission string) gin.HandlerFunc {
	return RequireAnyPermission(db, requiredPermission)
}

// RequireAnyPermission verifies whether the role holds at least one of the given permissions (OR logic).
func RequireAnyPermission(db PermissionQueryer, permissions ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if len(permissions) == 0 {
			c.Next()
			return
		}

		roleID := GetRoleID(c)
		if roleID == 0 {
			utils.LocalizedError(c, http.StatusForbidden, "errors.forbidden", nil, "FORBIDDEN")
			c.Abort()
			return
		}

		// 0. Superadmin Bypass (roleID == 1)
		if roleID == 1 {
			c.Next()
			return
		}

		var isAllowed bool
		var uncachedPerms []string

		// 1. Check in-memory cache under read lock
		cacheMu.RLock()
		rolePerms, roleCached := permCache[roleID]
		if roleCached {
			for _, p := range permissions {
				if hasPerm, checked := rolePerms[p]; checked {
					if hasPerm {
						isAllowed = true
						break
					}
				} else {
					uncachedPerms = append(uncachedPerms, p)
				}
			}
		} else {
			uncachedPerms = append(uncachedPerms, permissions...)
		}
		cacheMu.RUnlock()

		if isAllowed {
			c.Next()
			return
		}

		if len(uncachedPerms) == 0 || db == nil {
			utils.LocalizedError(c, http.StatusForbidden, "errors.forbidden", nil, "FORBIDDEN")
			c.Abort()
			return
		}

		// 2. Cache miss: query DB using request context without holding cache lock.
		// Only cache negative results when the row is genuinely absent (sql.ErrNoRows);
		// never cache transient DB/connection errors as permanent false!
		const query = `
			SELECT 1 FROM role_permission rp
			JOIN permissions perm ON rp.permission_id = perm.id
			WHERE rp.role_id = ? AND perm.name = ?
			LIMIT 1
		`

		reqCtx := context.Background()
		if c.Request != nil {
			reqCtx = c.Request.Context()
		}

		queryResults := make(map[string]bool, len(uncachedPerms))
		for _, p := range uncachedPerms {
			var hasPermission int
			err := db.GetContext(reqCtx, &hasPermission, query, roleID, p)
			if err == nil {
				queryResults[p] = true
				isAllowed = true
				break
			}
			if errors.Is(err, sql.ErrNoRows) {
				queryResults[p] = false
			} else {
				log.Printf("[RBAC] Permission query error for role_id=%d perm=%s: %v", roleID, p, err)
			}
		}

		// 3. Update cache under short write lock
		if len(queryResults) > 0 {
			cacheMu.Lock()
			if permCache[roleID] == nil {
				permCache[roleID] = make(map[string]bool)
			}
			for p, allowed := range queryResults {
				permCache[roleID][p] = allowed
			}
			cacheMu.Unlock()
		}

		if !isAllowed {
			utils.LocalizedError(c, http.StatusForbidden, "errors.forbidden", nil, "FORBIDDEN")
			c.Abort()
			return
		}

		c.Next()
	}
}
