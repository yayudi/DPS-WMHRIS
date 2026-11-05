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
	return RequireAnyPermission(db, requiredPermission)
}

// RequireAnyPermission memverifikasi apakah role memiliki setidaknya satu dari beberapa permission (OR Logic)
func RequireAnyPermission(db *sqlx.DB, permissions ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if len(permissions) == 0 {
			c.Next()
			return
		}

		roleID := GetRoleID(c)
		if roleID == 0 {
			utils.ErrorResponse(c, http.StatusForbidden, "Forbidden: No role assigned", "FORBIDDEN")
			c.Abort()
			return
		}

		// 0. Superadmin Bypass (Mencegah Lockout)
		// Jika roleID == 1 (Superadmin), berikan akses penuh tanpa cek permission
		if roleID == 1 {
			c.Next()
			return
		}

		var isAllowed bool
		var uncachedPerms []string

		// 1. Cek di Cache (R-Lock)
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

		if len(uncachedPerms) == 0 {
			// Semua permission telah dicek di cache dan tidak ada yang diizinkan
			utils.ErrorResponse(c, http.StatusForbidden, "Forbidden: Insufficient permissions", "FORBIDDEN")
			c.Abort()
			return
		}

		// 2. Cache Miss: Query DB tanpa memegang lock untuk mencegah contention
		query := `
			SELECT 1 FROM role_permission rp
			JOIN permissions perm ON rp.permission_id = perm.id
			WHERE rp.role_id = ? AND perm.name = ?
			LIMIT 1
		`

		queryResults := make(map[string]bool)
		for _, p := range uncachedPerms {
			var hasPermission int
			err := db.QueryRow(query, roleID, p).Scan(&hasPermission)
			allowed := (err == nil)
			queryResults[p] = allowed

			if allowed {
				isAllowed = true
				break // Stop query DB jika sudah ada 1 izin terpenuhi (OR logic)
			}
		}

		// 3. Update Cache (W-Lock singkat hanya untuk assign map)
		cacheMu.Lock()
		if permCache[roleID] == nil {
			permCache[roleID] = make(map[string]bool)
		}
		for p, allowed := range queryResults {
			permCache[roleID][p] = allowed
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
