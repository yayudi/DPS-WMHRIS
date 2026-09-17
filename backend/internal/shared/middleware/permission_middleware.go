package middleware

import (
	"net/http"
	"sync"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

var (
	// permCache menyimpan mapping RoleID -> map[PermissionName]bool
	permCache = make(map[int]map[string]bool)
	cacheMu   sync.RWMutex
)

// ClearPermissionCache dipanggil jika ada perubahan permission di DB (dari fitur admin)
func ClearPermissionCache(roleID int) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	delete(permCache, roleID)
}

// RequirePermission memverifikasi role dari JWT terhadap izin spesifik menggunakan lazy-loading in-memory cache
func RequirePermission(db *sqlx.DB, requiredPermission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		roleVal, exists := c.Get("role_id")
		if !exists {
			utils.ErrorResponse(c, http.StatusForbidden, "Forbidden: No role assigned", "FORBIDDEN")
			c.Abort()
			return
		}

		roleID, ok := roleVal.(int)
		if !ok {
			utils.ErrorResponse(c, http.StatusInternalServerError, "Internal server error: invalid role data type", "INTERNAL_ERROR")
			c.Abort()
			return
		}

		// 0. Superadmin Bypass (Mencegah Lockout)
		// Jika roleID == 1 (Superadmin), berikan akses penuh tanpa cek permission
		if roleID == 1 {
			c.Next()
			return
		}

		// 1. Cek ketersediaan di In-Memory Cache (R-Lock)
		cacheMu.RLock()
		rolePerms, roleCached := permCache[roleID]
		if roleCached {
			hasPerm, permChecked := rolePerms[requiredPermission]
			cacheMu.RUnlock()

			if permChecked { // Permission ini sudah pernah di-query sebelumnya
				if hasPerm {
					c.Next()
				} else {
					utils.ErrorResponse(c, http.StatusForbidden, "Forbidden: Insufficient permission", "FORBIDDEN")
					c.Abort()
				}
				return
			}
		} else {
			cacheMu.RUnlock()
		}

		// 2. Cache Miss: Query ke database (hanya sekali per kombinasi role & permission)
		var hasPermission int
		query := `
			SELECT 1 FROM role_permission rp
			JOIN permissions p ON rp.permission_id = p.id
			WHERE rp.role_id = ? AND p.name = ?
			LIMIT 1
		`

		err := db.QueryRow(query, roleID, requiredPermission).Scan(&hasPermission)
		isAllowed := (err == nil)

		// 3. Update Cache (W-Lock)
		cacheMu.Lock()
		if permCache[roleID] == nil {
			permCache[roleID] = make(map[string]bool)
		}
		permCache[roleID][requiredPermission] = isAllowed
		cacheMu.Unlock()

		// 4. Evaluasi final
		if !isAllowed {
			utils.ErrorResponse(c, http.StatusForbidden, "Forbidden: Insufficient permission", "FORBIDDEN")
			c.Abort()
			return
		}

		c.Next()
	}
}

// RequireAnyPermission memverifikasi apakah role memiliki setidaknya satu dari beberapa permission (OR Logic)
func RequireAnyPermission(db *sqlx.DB, permissions ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if len(permissions) == 0 {
			c.Next()
			return
		}

		roleVal, exists := c.Get("role_id")
		if !exists {
			utils.ErrorResponse(c, http.StatusForbidden, "Forbidden: No role assigned", "FORBIDDEN")
			c.Abort()
			return
		}

		roleID, ok := roleVal.(int)
		if !ok {
			utils.ErrorResponse(c, http.StatusInternalServerError, "Internal server error: invalid role data type", "INTERNAL_ERROR")
			c.Abort()
			return
		}

		// 0. Superadmin Bypass
		if roleID == 1 {
			c.Next()
			return
		}

		var isAllowed bool

		// 1. Cek di Cache
		cacheMu.RLock()
		rolePerms, roleCached := permCache[roleID]
		if roleCached {
			for _, p := range permissions {
				if hasPerm, checked := rolePerms[p]; checked && hasPerm {
					isAllowed = true
					break
				}
			}
		}
		cacheMu.RUnlock()

		if isAllowed {
			c.Next()
			return
		}

		// 2. Cache Miss: Query DB dengan Lazy Evaluation (Berhenti jika sudah menemukan 1 yang diizinkan)
		query := `
			SELECT 1 FROM role_permission rp
			JOIN permissions perm ON rp.permission_id = perm.id
			WHERE rp.role_id = ? AND perm.name = ?
			LIMIT 1
		`

		cacheMu.Lock()
		if permCache[roleID] == nil {
			permCache[roleID] = make(map[string]bool)
		}

		for _, p := range permissions {
			// Skip jika status permission ini sudah tersimpan di cache (berarti false, karena loop cache sebelumnya tidak lolos)
			if _, checked := permCache[roleID][p]; checked {
				continue
			}

			var hasPermission int
			err := db.QueryRow(query, roleID, p).Scan(&hasPermission)
			allowed := (err == nil)
			permCache[roleID][p] = allowed

			if allowed {
				isAllowed = true
				break // Stop query DB, karena cukup 1 izin saja untuk lolos (OR logic)
			}
		}
		cacheMu.Unlock()

		if !isAllowed {
			utils.ErrorResponse(c, http.StatusForbidden, "Forbidden: Insufficient permissions", "FORBIDDEN")
			c.Abort()
			return
		}

		c.Next()
	}
}
