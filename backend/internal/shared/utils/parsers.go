package utils

import "strconv"

func ParseIntArray(strArr []string) []int {
	var intArr []int
	for _, s := range strArr {
		if val, err := strconv.Atoi(s); err == nil {
			intArr = append(intArr, val)
		}
	}
	return intArr
}
