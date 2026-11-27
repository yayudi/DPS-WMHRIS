package database

import (
	"errors"

	"github.com/go-sql-driver/mysql"
)

// IsDuplicateKey checks whether an error is a MySQL duplicate entry error (Error 1062).
func IsDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	var mysqlErr *mysql.MySQLError
	if errors.As(err, &mysqlErr) {
		return mysqlErr.Number == 1062
	}
	return false
}

// IsForeignKeyViolation checks whether an error is a MySQL foreign key constraint failure
// (Error 1451 ER_ROW_IS_REFERENCED_2 on delete/update parent or Error 1452 ER_NO_REFERENCED_ROW_2 on insert/update child).
func IsForeignKeyViolation(err error) bool {
	if err == nil {
		return false
	}
	var mysqlErr *mysql.MySQLError
	if errors.As(err, &mysqlErr) {
		return mysqlErr.Number == 1451 || mysqlErr.Number == 1452
	}
	return false
}

