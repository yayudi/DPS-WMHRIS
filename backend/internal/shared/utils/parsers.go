package utils

import (
	"strconv"
	"strings"
)

// ParseIntArray converts a slice of strings into a slice of valid integers, skipping malformed entries.
func ParseIntArray(strArr []string) []int {
	if len(strArr) == 0 {
		return nil
	}
	intArr := make([]int, 0, len(strArr))
	for _, s := range strArr {
		if val, err := strconv.Atoi(strings.TrimSpace(s)); err == nil {
			intArr = append(intArr, val)
		}
	}
	return intArr
}
